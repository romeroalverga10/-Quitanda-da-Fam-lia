const crypto = require('crypto');
const https = require('https');
const fs = require('fs');
const forge = require('node-forge');
const { SignedXml } = require('xml-crypto');
const db = require('../database/db');
const backup = require('./backup');

// ── Constantes SEFAZ-SP ──────────────────────────────────────────────────────
const SEFAZ = {
  1: { // Produção
    autorizacao: 'nfce.fazenda.sp.gov.br',
    autorizacaoPath: '/ws/nfeautorizacao4.asmx',
    soapNs: 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4',
    qrcode: 'https://www.nfce.fazenda.sp.gov.br/qrcode',
    consulta: 'https://www.nfce.fazenda.sp.gov.br/consulta',
  },
  2: { // Homologação
    autorizacao: 'homologacao.nfce.fazenda.sp.gov.br',
    autorizacaoPath: '/ws/nfeautorizacao4.asmx',
    soapNs: 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4',
    qrcode: 'https://www.homologacao.nfce.fazenda.sp.gov.br/qrcode',
    consulta: 'https://www.homologacao.nfce.fazenda.sp.gov.br/consulta',
  },
};

const TPAG = {
  dinheiro: '01',
  pix: '17',
  cartao: null, // definido por tipo_cartao
};

function fmt(v, dec) { return Number(v).toFixed(dec); }

// ── Chave de Acesso ──────────────────────────────────────────────────────────
function calcularCDV(chave43) {
  const nums = chave43.split('').map(Number);
  let peso = 2;
  let soma = 0;
  for (let i = nums.length - 1; i >= 0; i--) {
    soma += nums[i] * peso;
    peso = peso >= 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

function gerarChaveAcesso(config, nNF, cNF, tpEmis = 1) {
  const agora = new Date();
  const aamm = String(agora.getFullYear()).slice(2) + String(agora.getMonth() + 1).padStart(2, '0');
  const cnpj = config.cnpj.replace(/\D/g, '').padStart(14, '0');
  const serie = String(config.serie).padStart(3, '0');
  const nNFpad = String(nNF).padStart(9, '0');
  const cNFpad = String(cNF).padStart(8, '0');
  const chave43 = `35${aamm}${cnpj}65${serie}${nNFpad}${tpEmis}${cNFpad}`;
  const cdv = calcularCDV(chave43);
  return chave43 + cdv;
}

function gerarCNF() {
  return Math.floor(10000000 + Math.random() * 89999999);
}

// ── QR Code Offline (Manual DANFE NFC-e QR Code v6.0, seção 4.3.2/4.3.5) ────
// URL: chave|2|tpAmb|dia|valor|digestHex|cIdToken|hash
// Hash: SHA1(chave|2|tpAmb|dia|valor|digestHex|cIdToken + CSC)
function gerarUrlQrCodeOffline(chave, config, dhEmi, vTotal, digestValueBase64) {
  const tpAmb    = config.ambiente;
  const cscIdNum = String(parseInt(config.csc_id, 10) || 1);
  const cscLimpo = (config.csc || '').trim().replace(/[\r\n\s]/g, '');
  const dia      = String(new Date(dhEmi).getDate()).padStart(2, '0');
  const valor    = fmt(vTotal, 2);
  const digestHex = Buffer.from(digestValueBase64, 'base64').toString('hex').toLowerCase();
  const params   = `${chave}|2|${tpAmb}|${dia}|${valor}|${digestHex}|${cscIdNum}`;
  const hash     = crypto.createHash('sha1').update(params + cscLimpo, 'utf8').digest('hex').toUpperCase();
  return `${SEFAZ[tpAmb].qrcode}?p=${params}|${hash}`;
}

// ── QR Code URL (Manual DANFE NFC-e QR Code v6.0, seção 4.3.4) ──────────────
function gerarUrlQrCode(chave, config) {
  const tpAmb = config.ambiente;
  // cIdToken sem zeros à esquerda (spec: "informar sem os zeros não significativos")
  const cscIdNum = String(parseInt(config.csc_id, 10) || 1);
  // CSC sem espaços/quebras de linha, como armazenado
  const cscLimpo = (config.csc || '').trim().replace(/[\r\n\s]/g, '');

  // Hash = SHA1( chave|2|tpAmb|cIdToken + CSC )
  // Passo 1: concatenar params 1-4 com |
  // Passo 2: adicionar CSC diretamente ao final (sem separador)
  const paramsHash = `${chave}|2|${tpAmb}|${cscIdNum}${cscLimpo}`;
  const hash = crypto.createHash('sha1')
    .update(paramsHash, 'utf8')
    .digest('hex').toUpperCase();

  const url = SEFAZ[tpAmb].qrcode;
  return `${url}?p=${chave}|2|${tpAmb}|${cscIdNum}|${hash}`;
}

// ── XML NFC-e ────────────────────────────────────────────────────────────────
function dhEmiISO(dataHoraStr) {
  // Converte data_hora do DB para formato ISO-8601 com offset -03:00
  const d = new Date(dataHoraStr);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}-03:00`;
}

function xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function montarXmlNfce(config, venda, nNF, chave, cNF, opts = {}) {
  const tpAmb = config.ambiente;
  const dhEmi = dhEmiISO(venda.data_hora);
  const urlConsulta = SEFAZ[tpAmb].consulta;
  const cnpj = config.cnpj.replace(/\D/g, '');
  const cep = (config.cep || '').replace(/\D/g, '');

  const itens = venda.itens.map((item, idx) => {
    const nItem = idx + 1;
    const cEAN = item.codigo_barras && item.codigo_barras.length >= 8
      ? xmlEscape(item.codigo_barras)
      : 'SEM GTIN';
    const ncmLimpo = (item.ncm || item.ncm_produto || '').replace(/\D/g, '');
    const uCom = item.unidade === 'kg' ? 'KG' : 'UN';
    const qCom = item.unidade === 'kg'
      ? fmt(item.quantidade, 3)
      : fmt(item.quantidade, 0);
    const xProd = tpAmb === 2
      ? 'NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL'
      : xmlEscape(item.nome.substring(0, 120));
    return `<det nItem="${nItem}">
<prod>
<cProd>${String(item.produto_id).padStart(6, '0')}</cProd>
<cEAN>${cEAN}</cEAN>
<xProd>${xProd}</xProd>
<NCM>${ncmLimpo}</NCM>
<CFOP>5102</CFOP>
<uCom>${uCom}</uCom>
<qCom>${qCom}</qCom>
<vUnCom>${fmt(item.preco_unitario, 10)}</vUnCom>
<vProd>${fmt(item.subtotal, 2)}</vProd>
<cEANTrib>SEM GTIN</cEANTrib>
<uTrib>${uCom}</uTrib>
<qTrib>${qCom}</qTrib>
<vUnTrib>${fmt(item.preco_unitario, 10)}</vUnTrib>
<indTot>1</indTot>
</prod>
<imposto>
<ICMS>
<ICMSSN102>
<orig>${item.origem || 0}</orig>
<CSOSN>400</CSOSN>
</ICMSSN102>
</ICMS>
<PIS>
<PISNT>
<CST>07</CST>
</PISNT>
</PIS>
<COFINS>
<COFINSNT>
<CST>07</CST>
</COFINSNT>
</COFINS>
</imposto>
</det>`;
  }).join('\n');

  // Pagamento
  let tPag = '01';
  let tPag2 = null;
  const fp = venda.forma_pagamento;
  if (fp === 'pix') tPag = '17';
  else if (fp === 'cartao') {
    tPag = venda.tipo_cartao === 'credito' ? '03' : '04';
  } else if (fp === 'dinheiro') {
    tPag = '01';
    if (venda.pagamento_2 === 'pix') tPag2 = '17';
    else if (venda.pagamento_2 === 'cartao') {
      tPag2 = venda.tipo_cartao === 'credito' ? '03' : '04';
    }
  }

  const vTotal = fmt(venda.total, 2);
  const vDinheiro = venda.valor_dinheiro ? fmt(venda.valor_dinheiro, 2) : vTotal;
  const troco = venda.troco ? fmt(venda.troco, 2) : '0.00';

  let pagXml = `<detPag><tPag>${tPag}</tPag><vPag>${tPag2 ? vDinheiro : vTotal}</vPag></detPag>`;
  if (tPag2) {
    const vRestante = fmt(venda.total - Number(venda.valor_dinheiro), 2);
    pagXml += `<detPag><tPag>${tPag2}</tPag><vPag>${vRestante}</vPag></detPag>`;
  }
  if (fp === 'dinheiro' && Number(troco) > 0) {
    pagXml += `<vTroco>${troco}</vTroco>`;
  }

  return `<NFe xmlns="http://www.portalfiscal.inf.br/nfe">
<infNFe Id="NFe${chave}" versao="4.00">
<ide>
<cUF>35</cUF>
<cNF>${String(cNF).padStart(8, '0')}</cNF>
<natOp>VENDA</natOp>
<mod>65</mod>
<serie>${config.serie}</serie>
<nNF>${nNF}</nNF>
<dhEmi>${dhEmi}</dhEmi>
<tpNF>1</tpNF>
<idDest>1</idDest>
<cMunFG>${config.cod_municipio || '3550308'}</cMunFG>
<tpImp>4</tpImp>
<tpEmis>${opts.tpEmis || 1}</tpEmis>
<cDV>${chave.slice(-1)}</cDV>
<tpAmb>${tpAmb}</tpAmb>
<finNFe>1</finNFe>
<indFinal>1</indFinal>
<indPres>1</indPres>
<procEmi>0</procEmi>
<verProc>PDV-QF-1.0</verProc>
${opts.dhCont ? `<dhCont>${opts.dhCont}</dhCont><xJust>${xmlEscape(opts.xJust || 'Contingencia offline')}</xJust>` : ''}
</ide>
<emit>
<CNPJ>${cnpj}</CNPJ>
<xNome>${xmlEscape(config.razao_social)}</xNome>
<xFant>${xmlEscape(config.fantasia || config.razao_social)}</xFant>
<enderEmit>
<xLgr>${xmlEscape(config.logradouro || '')}</xLgr>
<nro>${xmlEscape(config.numero || 'SN')}</nro>
${config.complemento ? `<xCpl>${xmlEscape(config.complemento)}</xCpl>` : ''}
<xBairro>${xmlEscape(config.bairro || '')}</xBairro>
<cMun>${config.cod_municipio || '3550308'}</cMun>
<xMun>${xmlEscape(config.municipio || 'SAO PAULO')}</xMun>
<UF>${config.uf || 'SP'}</UF>
<CEP>${cep.padStart(8, '0')}</CEP>
<cPais>1058</cPais>
<xPais>Brasil</xPais>
${config.telefone ? `<fone>${(config.telefone || '').replace(/\D/g, '')}</fone>` : ''}
</enderEmit>
<IE>${(config.ie || '').replace(/\D/g, '')}</IE>
<CRT>${config.crt || 1}</CRT>
</emit>
${venda.cpf_cliente ? `<dest><CPF>${venda.cpf_cliente.replace(/\D/g,'')}</CPF><indIEDest>9</indIEDest></dest>` : ''}
${itens}
<total>
<ICMSTot>
<vBC>0.00</vBC>
<vICMS>0.00</vICMS>
<vICMSDeson>0.00</vICMSDeson>
<vFCPUFDest>0.00</vFCPUFDest>
<vICMSUFDest>0.00</vICMSUFDest>
<vICMSUFRemet>0.00</vICMSUFRemet>
<vFCP>0.00</vFCP>
<vBCST>0.00</vBCST>
<vST>0.00</vST>
<vFCPST>0.00</vFCPST>
<vFCPSTRet>0.00</vFCPSTRet>
<vProd>${vTotal}</vProd>
<vFrete>0.00</vFrete>
<vSeg>0.00</vSeg>
<vDesc>0.00</vDesc>
<vII>0.00</vII>
<vIPI>0.00</vIPI>
<vIPIDevol>0.00</vIPIDevol>
<vPIS>0.00</vPIS>
<vCOFINS>0.00</vCOFINS>
<vOutro>0.00</vOutro>
<vNF>${vTotal}</vNF>
</ICMSTot>
</total>
<transp>
<modFrete>9</modFrete>
</transp>
<pag>
${pagXml}
</pag>
<infAdic>
<infCpl>${tpAmb === 2 ? 'NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL' : 'Obrigado pela preferencia!'}</infCpl>
</infAdic>
</infNFe>
</NFe>`;
}

// ── Assinatura XMLDSig genérica (xml-crypto, C14N 1.0) ──────────────────────
function assinarXml(xmlStr, elementName, certPath, certSenha) {
  const pfxBuf = fs.readFileSync(certPath);
  const p12Asn1 = forge.asn1.fromDer(pfxBuf.toString('binary'));
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, certSenha);

  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const privateKey = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag][0].key;
  const cert = certBags[forge.pki.oids.certBag][0].cert;

  const privateKeyPem = forge.pki.privateKeyToPem(privateKey);
  const certDer = forge.util.encode64(
    forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes()
  );

  const xpath = `//*[local-name()='${elementName}']`;
  const sig = new SignedXml({
    privateKey: privateKeyPem,
    canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
    getKeyInfoContent: ({ prefix }) => {
      const ns = prefix ? `${prefix}:` : '';
      return `<${ns}X509Data><${ns}X509Certificate>${certDer}</${ns}X509Certificate></${ns}X509Data>`;
    },
  });

  sig.addReference({
    xpath,
    digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
    transforms: [
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    ],
  });

  sig.computeSignature(xmlStr, {
    location: { reference: xpath, action: 'after' },
  });

  return sig.getSignedXml();
}

function assinarXmlNfce(xmlStr, certPath, certSenha) {
  return assinarXml(xmlStr, 'infNFe', certPath, certSenha);
}

// ── Transmissão SEFAZ ────────────────────────────────────────────────────────
function transmitirNfce(xmlAssinado, config) {
  return new Promise((resolve, reject) => {
    const tpAmb = config.ambiente;
    const endpoint = SEFAZ[tpAmb];
    const idLote = String(Date.now()).padStart(15, '0');

    const nfeBody = `<enviNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">` +
      `<idLote>${idLote}</idLote>` +
      `<indSinc>1</indSinc>` +
      xmlAssinado +
      `</enviNFe>`;


    const soapNs = endpoint.soapNs;
    // WSDL usa document/literal: nfeDadosMsg é o elemento direto no Body, sem wrapper nfeAutorizacaoLote
    const soapBody = `<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope" ` +
      `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
      `xmlns:xsd="http://www.w3.org/2001/XMLSchema">` +
      `<soap12:Body>` +
      `<nfeDadosMsg xmlns="${soapNs}">${nfeBody}</nfeDadosMsg>` +
      `</soap12:Body>` +
      `</soap12:Envelope>`;

    const pfxBuf = fs.readFileSync(config.cert_path);

    const options = {
      hostname: endpoint.autorizacao,
      port: 443,
      path: endpoint.autorizacaoPath,
      method: 'POST',
      headers: {
        'Content-Type': `application/soap+xml; charset=utf-8; action="${soapNs}/nfeAutorizacaoLote"`,
        'Content-Length': Buffer.byteLength(soapBody),
      },
      pfx: pfxBuf,
      passphrase: config.cert_senha,
      rejectUnauthorized: false, // SEFAZ usa cadeia ICP-Brasil
    };


    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          // cStat/xMotivo dentro de <infProt> = status individual da NF-e
          const infProtMatch = data.match(/<infProt>([\s\S]*?)<\/infProt>/);
          const infProt = infProtMatch ? infProtMatch[1] : data;
          const cStatMatch = infProt.match(/<cStat>(\d+)<\/cStat>/);
          const xMotivoMatch = infProt.match(/<xMotivo>([^<]+)<\/xMotivo>/);
          const nProtMatch = infProt.match(/<nProt>([^<]+)<\/nProt>/);
          const cStat = cStatMatch ? cStatMatch[1] : '999';
          const motivo = xMotivoMatch ? xMotivoMatch[1] : 'Sem resposta';
          const protocolo = nProtMatch ? nProtMatch[1] : null;
          resolve({
            ok: cStat === '100',
            cStat,
            motivo,
            protocolo,
            xmlRetorno: data,
          });
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(soapBody);
    req.end();
  });
}

// ── Função principal ─────────────────────────────────────────────────────────
async function emitirNfce(vendaId) {
  // Delega para contingência se o modo estiver ativo
  const cfgCheck = db.get('SELECT modo_contingencia FROM config_fiscal WHERE id = 1');
  if (cfgCheck && cfgCheck.modo_contingencia === 1) {
    return emitirContingencia(vendaId);
  }

  // 1. Buscar venda + itens
  const venda = db.get(
    `SELECT v.*, o.nome AS operador_nome FROM vendas v JOIN operadores o ON v.operador_id = o.id WHERE v.id = ?`,
    vendaId
  );
  if (!venda) return { ok: false, erro: 'Venda não encontrada' };

  const itens = db.all(
    `SELECT iv.*, p.nome, p.unidade, p.codigo_barras, p.ncm, p.origem
     FROM itens_venda iv JOIN produtos p ON iv.produto_id = p.id WHERE iv.venda_id = ?`,
    vendaId
  );
  venda.itens = itens;

  // 2. Verificar config fiscal
  const config = db.get('SELECT * FROM config_fiscal WHERE id = 1');
  if (!config || !config.cnpj || !config.csc || !config.cert_path) {
    return { ok: false, erro: 'Configuração fiscal incompleta. Acesse /fiscal.html para configurar.' };
  }
  if (!fs.existsSync(config.cert_path)) {
    return { ok: false, erro: 'Arquivo de certificado não encontrado: ' + config.cert_path };
  }

  // 3. Verificar NCM de todos os itens
  const semNCM = itens.filter(i => !(i.ncm || '').replace(/\D/g, ''));
  if (semNCM.length > 0) {
    return {
      ok: false,
      erro: 'Produtos sem NCM cadastrado: ' + semNCM.map(i => i.nome).join(', '),
      semNCM: semNCM.map(i => ({ id: i.produto_id, nome: i.nome })),
    };
  }

  // 4. Verificar duplicidade
  const nfceExistente = db.get('SELECT * FROM nfce WHERE venda_id = ? AND status = ?', [vendaId, 'autorizada']);
  if (nfceExistente) {
    return { ok: true, chave: nfceExistente.chave, protocolo: nfceExistente.protocolo, jaAutorizada: true };
  }

  // 5. Incrementar número e gerar chave
  db.run('UPDATE config_fiscal SET nnf_atual = nnf_atual + 1 WHERE id = 1');
  const configAtualizado = db.get('SELECT nnf_atual, serie FROM config_fiscal WHERE id = 1');
  const nNF = configAtualizado.nnf_atual;
  const cNF = gerarCNF();
  const chave = gerarChaveAcesso(config, nNF, cNF);

  // 6. Montar XML → assinar → extrair digest → inserir infNFeSupl (não recalcina)
  let xmlAssinado;
  try {
    const dhEmi = dhEmiISO(venda.data_hora);
    const xmlBase = montarXmlNfce(config, venda, nNF, chave, cNF)
      .replace(/>\s+</g, '><').trim();
    const xmlAssinadoBase = assinarXmlNfce(xmlBase, config.cert_path, config.cert_senha || '');
    // Extrair DigestValue (base64 → hex) para compor QR Code NT 2020.005
    const digestMatch = xmlAssinadoBase.match(/<DigestValue>([^<]+)<\/DigestValue>/);
    const digestHex = digestMatch ? Buffer.from(digestMatch[1], 'base64').toString('hex') : '0000000000';
    const urlQrCode = gerarUrlQrCode(chave, config);
    const urlConsulta = SEFAZ[config.ambiente].consulta;
    const infNFeSupl = `<infNFeSupl><qrCode>${xmlEscape(urlQrCode)}</qrCode>` +
      `<urlChave>${urlConsulta}</urlChave></infNFeSupl>`;
    // infNFeSupl é irmão de infNFe (fora dele), inserido antes do Signature
    xmlAssinado = xmlAssinadoBase.replace(/<Signature /, infNFeSupl + '<Signature ');
  } catch (err) {
    db.run('UPDATE config_fiscal SET nnf_atual = nnf_atual - 1 WHERE id = 1');
    return { ok: false, erro: 'Erro ao assinar XML: ' + err.message };
  }

  // 8. Salvar NFC-e como pendente
  db.run(
    `INSERT OR REPLACE INTO nfce (venda_id, chave, numero, serie, xml_assinado, status, ambiente, data_emissao)
     VALUES (?, ?, ?, ?, ?, 'pendente', ?, ?)`,
    [vendaId, chave, nNF, config.serie, xmlAssinado, config.ambiente,
     new Date().toISOString()]
  );
  const nfceId = db.get('SELECT id FROM nfce WHERE chave = ?', chave).id;

  // 9. Transmitir para SEFAZ
  let resultado;
  try {
    resultado = await transmitirNfce(xmlAssinado, config);
  } catch (err) {
    db.run(`UPDATE nfce SET status='erro', mensagem=? WHERE id=?`,
      ['Erro de conexão: ' + err.message, nfceId]);
    return { ok: false, erro: 'Erro de conexão com SEFAZ: ' + err.message, nfceId };
  }

  // 10. Salvar resultado
  db.run(
    `UPDATE nfce SET status=?, protocolo=?, xml_retorno=?, mensagem=?, data_autorizacao=? WHERE id=?`,
    [resultado.ok ? 'autorizada' : 'rejeitada',
     resultado.protocolo || null,
     resultado.xmlRetorno,
     resultado.motivo,
     resultado.ok ? new Date().toISOString() : null,
     nfceId]
  );
  if (resultado.ok) backup.salvarXmlNfe(chave, xmlAssinado, resultado.xmlRetorno);

  return {
    ok: resultado.ok,
    nfceId,
    chave,
    numero: nNF,
    serie: config.serie,
    protocolo: resultado.protocolo,
    motivo: resultado.motivo,
    cStat: resultado.cStat,
    xmlAssinado,
    config,
    venda,
    urlQrCode: (xmlAssinado.match(/<qrCode>([^<]+)<\/qrCode>/)?.[1] || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'),
    urlConsulta: SEFAZ[config.ambiente].consulta,
  };
}

// ── Emissão em Contingência Offline (tpEmis=9) ─────────────────────────────
async function emitirContingencia(vendaId) {
  const venda = db.get(
    `SELECT v.*, o.nome AS operador_nome FROM vendas v JOIN operadores o ON v.operador_id = o.id WHERE v.id = ?`,
    vendaId
  );
  if (!venda) return { ok: false, erro: 'Venda não encontrada' };

  const itens = db.all(
    `SELECT iv.*, p.nome, p.unidade, p.codigo_barras, p.ncm, p.origem
     FROM itens_venda iv JOIN produtos p ON iv.produto_id = p.id WHERE iv.venda_id = ?`,
    vendaId
  );
  venda.itens = itens;

  const config = db.get('SELECT * FROM config_fiscal WHERE id = 1');
  if (!config || !config.cnpj || !config.csc || !config.cert_path) {
    return { ok: false, erro: 'Configuração fiscal incompleta.' };
  }
  if (!fs.existsSync(config.cert_path)) {
    return { ok: false, erro: 'Arquivo de certificado não encontrado: ' + config.cert_path };
  }

  const semNCM = itens.filter(i => !(i.ncm || '').replace(/\D/g, ''));
  if (semNCM.length > 0) {
    return { ok: false, erro: 'Produtos sem NCM: ' + semNCM.map(i => i.nome).join(', '), semNCM: semNCM.map(i => ({ id: i.produto_id, nome: i.nome })) };
  }

  const existente = db.get('SELECT * FROM nfce WHERE venda_id = ? AND status IN (?, ?)', [vendaId, 'autorizada', 'contingencia']);
  if (existente) {
    return { ok: true, chave: existente.chave, protocolo: existente.protocolo, jaAutorizada: true, contingencia: existente.status === 'contingencia' };
  }

  const dhCont = config.dhCont || new Date().toISOString();
  const xJust  = config.xJust_cont || 'Contingência offline por indisponibilidade da SEFAZ';

  db.run('UPDATE config_fiscal SET nnf_atual = nnf_atual + 1 WHERE id = 1');
  const configAtualizado = db.get('SELECT nnf_atual, serie FROM config_fiscal WHERE id = 1');
  const nNF  = configAtualizado.nnf_atual;
  const cNF  = gerarCNF();
  const chave = gerarChaveAcesso(config, nNF, cNF, 9);

  let xmlAssinado;
  try {
    const xmlBase = montarXmlNfce(config, venda, nNF, chave, cNF, { tpEmis: 9, dhCont, xJust })
      .replace(/>\s+</g, '><').trim();
    const xmlAssinadoBase = assinarXmlNfce(xmlBase, config.cert_path, config.cert_senha || '');

    const digestMatch = xmlAssinadoBase.match(/<DigestValue>([^<]+)<\/DigestValue>/);
    const digestB64   = digestMatch ? digestMatch[1] : '';
    const urlQrCode   = gerarUrlQrCodeOffline(chave, config, venda.data_hora, venda.total, digestB64);
    const urlConsulta = SEFAZ[config.ambiente].consulta;
    const infNFeSupl  = `<infNFeSupl><qrCode>${xmlEscape(urlQrCode)}</qrCode><urlChave>${urlConsulta}</urlChave></infNFeSupl>`;
    xmlAssinado = xmlAssinadoBase.replace(/<Signature /, infNFeSupl + '<Signature ');
  } catch (err) {
    db.run('UPDATE config_fiscal SET nnf_atual = nnf_atual - 1 WHERE id = 1');
    return { ok: false, erro: 'Erro ao assinar XML de contingência: ' + err.message };
  }

  db.run(
    `INSERT OR REPLACE INTO nfce (venda_id, chave, numero, serie, xml_assinado, status, ambiente, data_emissao, tpEmis)
     VALUES (?, ?, ?, ?, ?, 'contingencia', ?, ?, 9)`,
    [vendaId, chave, nNF, config.serie, xmlAssinado, config.ambiente, new Date().toISOString()]
  );
  const nfceId = db.get('SELECT id FROM nfce WHERE chave = ?', chave).id;

  const urlQrCode = (xmlAssinado.match(/<qrCode>([^<]+)<\/qrCode>/)?.[1] || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

  return {
    ok: true,
    contingencia: true,
    nfceId,
    chave,
    numero: nNF,
    serie: config.serie,
    urlQrCode,
    urlConsulta: SEFAZ[config.ambiente].consulta,
    config,
    venda,
  };
}

module.exports = { emitirNfce, emitirContingencia, transmitirNfce, gerarChaveAcesso, gerarUrlQrCode, gerarUrlQrCodeOffline, assinarXml, xmlEscape, dhEmiISO };

const express = require('express');
const path = require('path');
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');
const db = require('../database/db');
const { emitirNfce, emitirContingencia, transmitirNfce, gerarUrlQrCode, assinarXml, xmlEscape, dhEmiISO } = require('../services/nfce');
const backup = require('../services/backup');

const router = express.Router();
const CERT_DIR = path.join(__dirname, '..', 'certs');

// GET /api/fiscal/config
router.get('/config', (req, res) => {
  const config = db.get('SELECT * FROM config_fiscal WHERE id = 1');
  if (!config) return res.json({});
  const { cert_senha, ...publico } = config;
  publico.tem_certificado = !!(config.cert_path && fs.existsSync(config.cert_path));
  res.json(publico);
});

// POST /api/fiscal/config
router.post('/config', (req, res) => {
  const campos = [
    'cnpj', 'ie', 'razao_social', 'fantasia',
    'logradouro', 'numero', 'complemento', 'bairro', 'cep',
    'municipio', 'cod_municipio', 'uf', 'telefone',
    'crt', 'csc', 'csc_id', 'ambiente', 'serie', 'nnf_atual',
  ];
  const set = campos.map(c => `${c} = ?`).join(', ');
  const vals = campos.map(c => req.body[c] ?? null);

  // Senha do certificado: só atualiza se enviada
  let senhaUpdate = '';
  if (req.body.cert_senha) {
    senhaUpdate = ', cert_senha = ?';
    vals.push(req.body.cert_senha);
  }

  db.run(`UPDATE config_fiscal SET ${set}${senhaUpdate} WHERE id = 1`, vals);
  res.json({ ok: true });
});

// POST /api/fiscal/config/cert — upload do .pfx (raw body application/octet-stream)
router.post('/config/cert', express.raw({ type: 'application/octet-stream', limit: '2mb' }), (req, res) => {
  if (!req.body || !req.body.length) {
    return res.status(400).json({ erro: 'Nenhum arquivo recebido' });
  }
  if (!fs.existsSync(CERT_DIR)) fs.mkdirSync(CERT_DIR, { recursive: true });
  const certPath = path.join(CERT_DIR, 'certificado.pfx');
  fs.writeFileSync(certPath, req.body);
  db.run('UPDATE config_fiscal SET cert_path = ? WHERE id = 1', certPath);
  res.json({ ok: true, cert_path: certPath });
});

// POST /api/fiscal/nfce/emitir/:vendaId
router.post('/nfce/emitir/:vendaId', async (req, res) => {
  const vendaId = parseInt(req.params.vendaId);
  try {
    const resultado = await emitirNfce(vendaId);
    res.json(resultado);
  } catch (err) {
    res.status(500).json({ ok: false, erro: err.message });
  }
});

// GET /api/fiscal/nfce
router.get('/nfce', (req, res) => {
  const lista = db.all(`
    SELECT n.id, n.venda_id, n.chave, n.numero, n.serie, n.status,
           n.protocolo, n.ambiente, n.data_emissao, n.data_autorizacao, n.mensagem,
           v.total, v.data_hora, v.forma_pagamento, o.nome AS operador_nome
    FROM nfce n
    JOIN vendas v ON n.venda_id = v.id
    JOIN operadores o ON v.operador_id = o.id
    ORDER BY n.id DESC LIMIT 50
  `);
  res.json(lista);
});

// GET /api/fiscal/nfce/:id
router.get('/nfce/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const nfce = db.get('SELECT * FROM nfce WHERE id = ?', id);
  if (!nfce) return res.status(404).json({ erro: 'NFC-e não encontrada' });
  res.json(nfce);
});

// POST /api/fiscal/nfce/:id/retransmitir
router.post('/nfce/:id/retransmitir', async (req, res) => {
  const id = parseInt(req.params.id);
  const nfce = db.get('SELECT * FROM nfce WHERE id = ?', id);
  if (!nfce) return res.status(404).json({ erro: 'NFC-e não encontrada' });
  if (nfce.status === 'autorizada') {
    return res.json({ ok: true, mensagem: 'NFC-e já está autorizada', protocolo: nfce.protocolo });
  }
  if (!nfce.xml_assinado) {
    return res.status(400).json({ erro: 'XML assinado não encontrado, reemita a venda.' });
  }
  try {
    const config = db.get('SELECT * FROM config_fiscal WHERE id = 1');
    // Retransmite o XML já assinado, sem gerar novo número
    const resultado = await transmitirNfce(nfce.xml_assinado, config);
    db.run(
      'UPDATE nfce SET status=?, protocolo=?, xml_retorno=?, mensagem=?, data_autorizacao=? WHERE id=?',
      [resultado.ok ? 'autorizada' : 'rejeitada', resultado.protocolo || null, resultado.xmlRetorno, resultado.motivo,
       resultado.ok ? new Date().toISOString() : null, id]
    );
    if (resultado.ok) backup.salvarXmlNfe(nfce.chave, nfce.xml_assinado, resultado.xmlRetorno);
    res.json({ ok: resultado.ok, cStat: resultado.cStat, motivo: resultado.motivo, protocolo: resultado.protocolo, chave: nfce.chave });
  } catch (err) {
    res.status(500).json({ ok: false, erro: err.message });
  }
});

// POST /api/fiscal/nfce/:id/cancelar
router.post('/nfce/:id/cancelar', async (req, res) => {
  const id = parseInt(req.params.id);
  const justificativa = (req.body.justificativa || '').trim();

  if (justificativa.length < 15) {
    return res.status(400).json({ ok: false, erro: 'Justificativa deve ter pelo menos 15 caracteres.' });
  }

  const nfce = db.get('SELECT * FROM nfce WHERE id = ?', id);
  if (!nfce) return res.status(404).json({ ok: false, erro: 'NFC-e não encontrada.' });
  if (nfce.status !== 'autorizada') {
    return res.status(400).json({ ok: false, erro: 'Apenas NFC-e autorizadas podem ser canceladas.' });
  }
  if (!nfce.protocolo) {
    return res.status(400).json({ ok: false, erro: 'Protocolo de autorização não encontrado.' });
  }
  if (nfce.data_autorizacao) {
    const elapsed = Date.now() - new Date(nfce.data_autorizacao).getTime();
    if (elapsed > 30 * 60 * 1000) {
      return res.status(400).json({ ok: false, erro: 'Prazo de cancelamento expirado. O cancelamento só é permitido em até 30 minutos após a autorização (SEFAZ-SP).' });
    }
  }

  const config = db.get('SELECT * FROM config_fiscal WHERE id = 1');
  if (!config || !config.cert_path || !fs.existsSync(config.cert_path)) {
    return res.status(400).json({ ok: false, erro: 'Certificado digital não configurado.' });
  }

  const tpAmb = nfce.ambiente;
  const cnpj = config.cnpj.replace(/\D/g, '');
  const chave = nfce.chave;
  const agora = new Date();
  const pad = n => String(n).padStart(2, '0');
  const dhEvento = `${agora.getFullYear()}-${pad(agora.getMonth()+1)}-${pad(agora.getDate())}T` +
    `${pad(agora.getHours())}:${pad(agora.getMinutes())}:${pad(agora.getSeconds())}-03:00`;
  const idEvento = `ID110111${chave}01`;

  const xmlEvento = `<envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><idLote>${String(Date.now()).padStart(15,'0')}</idLote><evento versao="1.00"><infEvento Id="${idEvento}"><cOrgao>35</cOrgao><tpAmb>${tpAmb}</tpAmb><CNPJ>${cnpj}</CNPJ><chNFe>${chave}</chNFe><dhEvento>${dhEvento}</dhEvento><tpEvento>110111</tpEvento><nSeqEvento>1</nSeqEvento><verEvento>1.00</verEvento><detEvento versao="1.00"><descEvento>Cancelamento</descEvento><nProt>${nfce.protocolo}</nProt><xJust>${xmlEscape(justificativa)}</xJust></detEvento></infEvento></evento></envEvento>`;

  let xmlAssinado;
  try {
    xmlAssinado = assinarXml(xmlEvento, 'infEvento', config.cert_path, config.cert_senha || '');
  } catch (err) {
    return res.status(500).json({ ok: false, erro: 'Erro ao assinar XML: ' + err.message });
  }

  const EP = {
    1: { host: 'nfce.fazenda.sp.gov.br',            path: '/ws/nferecepcaoevento4.asmx' },
    2: { host: 'homologacao.nfce.fazenda.sp.gov.br', path: '/ws/nferecepcaoevento4.asmx' },
  };
  const soapNs = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4';
  const ep = EP[tpAmb];
  const soapBody = `<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">` +
    `<soap12:Body><nfeDadosMsg xmlns="${soapNs}">${xmlAssinado}</nfeDadosMsg></soap12:Body></soap12:Envelope>`;

  try {
    const resposta = await new Promise((resolve, reject) => {
      const options = {
        hostname: ep.host, port: 443, path: ep.path, method: 'POST',
        headers: {
          'Content-Type': `application/soap+xml; charset=utf-8; action="${soapNs}/nfeRecepcaoEvento"`,
          'Content-Length': Buffer.byteLength(soapBody),
        },
        pfx: fs.readFileSync(config.cert_path),
        passphrase: config.cert_senha || '',
        rejectUnauthorized: false,
      };
      const r = https.request(options, resp => {
        let d = ''; resp.on('data', c => { d += c; }); resp.on('end', () => resolve(d));
      });
      r.on('error', reject);
      r.write(soapBody); r.end();
    });

    const nProtMatch = resposta.match(/<nProt>([^<]+)<\/nProt>/);
    // Pega o cStat/xMotivo do infEvento (resultado individual do evento)
    const infEventoMatch = resposta.match(/<infEvento>([\s\S]*?)<\/infEvento>/);
    const infEvento = infEventoMatch ? infEventoMatch[1] : resposta;
    const cStat = (infEvento.match(/<cStat>(\d+)<\/cStat>/) || [])[1] || '999';
    const motivo = (infEvento.match(/<xMotivo>([^<]+)<\/xMotivo>/) || [])[1] || 'Sem resposta';
    const protocolo = nProtMatch ? nProtMatch[1] : null;
    // 135 = registrado e vinculado | 573 = duplicidade (já cancelada na SEFAZ)
    const ok = cStat === '135' || cStat === '573';

    if (ok) {
      db.run(`UPDATE nfce SET status='cancelada', mensagem=? WHERE id=?`,
        [`Cancelada: ${motivo}`, id]);
      backup.salvarXmlCancelamento(nfce.chave, xmlAssinado);
    }

    res.json({ ok, cStat, motivo, protocolo });
  } catch (err) {
    res.status(500).json({ ok: false, erro: 'Erro ao comunicar cancelamento à SEFAZ: ' + err.message });
  }
});

// POST /api/fiscal/testar-csc
// Valida formato do CSC localmente e testa conectividade com SEFAZ via consulta de status.
// Nota: a validação real do CSC só ocorre ao emitir uma NFC-e — não existe webservice
// dedicado para isso na SEFAZ-SP.
router.post('/testar-csc', async (req, res) => {
  const config = db.get('SELECT * FROM config_fiscal WHERE id = 1');
  if (!config || !config.csc || !config.csc_id || !config.cnpj) {
    return res.json({ ok: false, etapa: 'formato', erro: 'CSC, ID Token e CNPJ precisam estar configurados.' });
  }

  // ── 1. Validação de formato ──────────────────────────────────────────────────
  const cscId = parseInt(config.csc_id, 10);
  if (!cscId || cscId < 1 || cscId > 999999) {
    return res.json({ ok: false, etapa: 'formato', erro: 'ID Token inválido. Deve ser um número entre 1 e 999999.' });
  }
  if (config.csc.length < 20) {
    return res.json({ ok: false, etapa: 'formato', erro: 'Token CSC muito curto. Verifique se copiou o valor completo.' });
  }

  // ── 2. Teste de conectividade via NFeStatusServico ───────────────────────────
  const tpAmb = config.ambiente;
  const HOSTS = {
    1: { host: 'nfce.fazenda.sp.gov.br',            path: '/ws/nfestatusservico4.asmx', ns: 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4' },
    2: { host: 'homologacao.nfce.fazenda.sp.gov.br', path: '/ws/nfestatusservico4.asmx', ns: 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4' },
  };
  const ep = HOSTS[tpAmb];
  const soapStatus = `<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">` +
    `<soap12:Body><nfeDadosMsg xmlns="${ep.ns}">` +
    `<consStatServ xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">` +
    `<tpAmb>${tpAmb}</tpAmb><cUF>35</cUF><xServ>STATUS</xServ>` +
    `</consStatServ></nfeDadosMsg></soap12:Body></soap12:Envelope>`;

  const reqOptions = {
    hostname: ep.host,
    port: 443,
    path: ep.path,
    method: 'POST',
    headers: {
      'Content-Type': `application/soap+xml; charset=utf-8; action="${ep.ns}/nfeStatusServicoNF"`,
      'Content-Length': Buffer.byteLength(soapStatus),
    },
    rejectUnauthorized: false,
    timeout: 12000,
  };
  if (config.cert_path && fs.existsSync(config.cert_path)) {
    reqOptions.pfx = fs.readFileSync(config.cert_path);
    reqOptions.passphrase = config.cert_senha || '';
  }

  try {
    const body = await new Promise((resolve, reject) => {
      const r = https.request(reqOptions, resp => {
        let d = '';
        resp.on('data', c => { d += c; });
        resp.on('end', () => resolve(d));
      });
      r.on('error', reject);
      r.on('timeout', () => { r.destroy(); reject(new Error('Timeout na conexão com SEFAZ')); });
      r.write(soapStatus);
      r.end();
    });

    const cStatMatch = body.match(/<cStat>(\d+)<\/cStat>/);
    const xMotivoMatch = body.match(/<xMotivo>([^<]+)<\/xMotivo>/);
    const cStat = cStatMatch ? cStatMatch[1] : null;
    const motivo = xMotivoMatch ? xMotivoMatch[1] : 'Sem resposta';

    if (!cStat) {
      return res.json({ ok: false, etapa: 'conectividade', erro: 'SEFAZ não retornou status. Verifique o certificado digital.' });
    }

    const ambiente = tpAmb === 1 ? 'Produção' : 'Homologação';
    const cscIdPad = String(config.csc_id).padStart(6, '0');
    const hashExemplo = crypto.createHash('sha1')
      .update('00000000000000000000000000000000000000000000' + cscIdPad + config.csc, 'utf8')
      .digest('hex').toUpperCase();

    return res.json({
      ok: true,
      etapa: 'conectividade',
      cStat,
      motivo,
      mensagem: `SEFAZ-SP ${ambiente} respondeu: ${motivo} (cStat ${cStat}). Certificado e conexão OK.`,
      aviso: 'O CSC só é validado no momento da emissão da NFC-e. Se receber rejeição 462, cadastre o CSC no portal de ' + ambiente + ' da SEFAZ-SP.',
      cscIdUsado: String(cscId),
      cscIdPadUsado: cscIdPad,
      hashExemplo,
    });
  } catch (err) {
    return res.json({ ok: false, etapa: 'conectividade', erro: 'Erro ao conectar na SEFAZ: ' + err.message });
  }
});

// GET /api/fiscal/inutilizacoes
router.get('/inutilizacoes', (req, res) => {
  res.json(db.all('SELECT * FROM nfce_inutilizacoes ORDER BY id DESC LIMIT 50'));
});

// POST /api/fiscal/inutilizar
router.post('/inutilizar', async (req, res) => {
  const { serie, nnf_ini, nnf_fin, justificativa } = req.body;
  const nIni = parseInt(nnf_ini);
  const nFin = parseInt(nnf_fin);

  if (!nIni || !nFin || nIni < 1 || nFin < nIni)
    return res.status(400).json({ ok: false, erro: 'Numeração inválida.' });
  if ((justificativa || '').trim().length < 15)
    return res.status(400).json({ ok: false, erro: 'Justificativa deve ter pelo menos 15 caracteres.' });

  const config = db.get('SELECT * FROM config_fiscal WHERE id = 1');
  if (!config || !config.cnpj || !config.cert_path || !fs.existsSync(config.cert_path))
    return res.status(400).json({ ok: false, erro: 'Certificado digital não configurado.' });

  const tpAmb  = config.ambiente;
  const cnpj   = config.cnpj.replace(/\D/g, '');
  const serieN = parseInt(serie || config.serie);
  const agora  = new Date();
  const aamm   = String(agora.getFullYear()).slice(2) + String(agora.getMonth() + 1).padStart(2, '0');
  const pad    = (v, n) => String(v).padStart(n, '0');
  const idInut = `ID35${aamm}${cnpj}65${pad(serieN,3)}${pad(nIni,9)}${pad(nFin,9)}`;

  const xmlInut = `<inutNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">` +
    `<infInut Id="${idInut}">` +
    `<tpAmb>${tpAmb}</tpAmb>` +
    `<xServ>INUTILIZAR</xServ>` +
    `<cUF>35</cUF>` +
    `<ano>${aamm.slice(0,2)}</ano>` +
    `<CNPJ>${cnpj}</CNPJ>` +
    `<mod>65</mod>` +
    `<serie>${serieN}</serie>` +
    `<nNFIni>${nIni}</nNFIni>` +
    `<nNFFin>${nFin}</nNFFin>` +
    `<xJust>${xmlEscape(justificativa.trim())}</xJust>` +
    `</infInut>` +
    `</inutNFe>`;

  let xmlAssinado;
  try {
    xmlAssinado = assinarXml(xmlInut, 'infInut', config.cert_path, config.cert_senha || '');
  } catch (err) {
    return res.status(500).json({ ok: false, erro: 'Erro ao assinar XML: ' + err.message });
  }

  const EP = {
    1: { host: 'nfce.fazenda.sp.gov.br',            path: '/ws/nfeinutilizacao4.asmx' },
    2: { host: 'homologacao.nfce.fazenda.sp.gov.br', path: '/ws/nfeinutilizacao4.asmx' },
  };
  const soapNs  = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeInutilizacao4';
  const ep      = EP[tpAmb];
  const soapBody = `<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">` +
    `<soap12:Body><nfeDadosMsg xmlns="${soapNs}">${xmlAssinado}</nfeDadosMsg></soap12:Body></soap12:Envelope>`;

  // Salvar como pendente
  db.run(
    `INSERT INTO nfce_inutilizacoes (serie, nnf_ini, nnf_fin, justificativa, status, ambiente, xml_assinado, data_inutilizacao)
     VALUES (?, ?, ?, ?, 'pendente', ?, ?, ?)`,
    [serieN, nIni, nFin, justificativa.trim(), tpAmb, xmlAssinado, new Date().toISOString()]
  );
  const inutId = db.get('SELECT last_insert_rowid() AS id').id;

  try {
    const resposta = await new Promise((resolve, reject) => {
      const options = {
        hostname: ep.host, port: 443, path: ep.path, method: 'POST',
        headers: {
          'Content-Type': `application/soap+xml; charset=utf-8; action="${soapNs}/nfeInutilizacaoNF"`,
          'Content-Length': Buffer.byteLength(soapBody),
        },
        pfx: fs.readFileSync(config.cert_path),
        passphrase: config.cert_senha || '',
        rejectUnauthorized: false,
      };
      const r = https.request(options, resp => {
        let d = ''; resp.on('data', c => { d += c; }); resp.on('end', () => resolve(d));
      });
      r.on('error', reject);
      r.write(soapBody); r.end();
    });

    const infInutRet = resposta.match(/<infInut>([\s\S]*?)<\/infInut>/);
    const infR = infInutRet ? infInutRet[1] : resposta;
    const cStat    = (infR.match(/<cStat>(\d+)<\/cStat>/) || [])[1] || '999';
    const motivo   = (infR.match(/<xMotivo>([^<]+)<\/xMotivo>/) || [])[1] || 'Sem resposta';
    const protocolo = (infR.match(/<nProt>([^<]+)<\/nProt>/) || [])[1] || null;
    const ok = cStat === '102'; // 102 = Inutilização homologada

    db.run(
      `UPDATE nfce_inutilizacoes SET status=?, protocolo=?, xml_retorno=?, mensagem=? WHERE id=?`,
      [ok ? 'homologada' : 'rejeitada', protocolo, resposta, motivo, inutId]
    );

    if (ok) backup.salvarXmlCancelamento('INUT_' + idInut, xmlAssinado);

    res.json({ ok, cStat, motivo, protocolo, serie: serieN, nnf_ini: nIni, nnf_fin: nFin });
  } catch (err) {
    db.run(`UPDATE nfce_inutilizacoes SET status='erro', mensagem=? WHERE id=?`, [err.message, inutId]);
    res.status(500).json({ ok: false, erro: 'Erro ao comunicar com SEFAZ: ' + err.message });
  }
});

// POST /api/fiscal/backup/exportar — salva todos os XMLs do banco em disco
router.post('/backup/exportar', (req, res) => {
  const resultado = backup.exportarTodos(db);
  res.json({ ok: true, ...resultado });
});

// ── Contingência offline ─────────────────────────────────────────────────────

// GET /api/fiscal/contingencia/status
router.get('/contingencia/status', (req, res) => {
  const config = db.get('SELECT modo_contingencia, dhCont, xJust_cont FROM config_fiscal WHERE id = 1');
  const pendentes = db.get('SELECT COUNT(*) AS total FROM nfce WHERE status = ?', 'contingencia').total;
  res.json({ ...config, pendentes });
});

// POST /api/fiscal/contingencia/ativar
router.post('/contingencia/ativar', (req, res) => {
  const justificativa = (req.body.justificativa || 'Contingência offline por indisponibilidade da SEFAZ').trim();
  const agora  = new Date();
  const pad    = n => String(n).padStart(2, '0');
  const dhCont = `${agora.getFullYear()}-${pad(agora.getMonth()+1)}-${pad(agora.getDate())}T` +
    `${pad(agora.getHours())}:${pad(agora.getMinutes())}:${pad(agora.getSeconds())}-03:00`;

  db.run(
    'UPDATE config_fiscal SET modo_contingencia = 1, dhCont = ?, xJust_cont = ? WHERE id = 1',
    [dhCont, justificativa]
  );
  res.json({ ok: true, dhCont, xJust_cont: justificativa });
});

// POST /api/fiscal/contingencia/desativar
router.post('/contingencia/desativar', (req, res) => {
  db.run('UPDATE config_fiscal SET modo_contingencia = 0 WHERE id = 1');
  res.json({ ok: true });
});

// GET /api/fiscal/contingencia/pendentes
router.get('/contingencia/pendentes', (req, res) => {
  const lista = db.all(`
    SELECT n.id, n.venda_id, n.chave, n.numero, n.serie, n.status,
           n.ambiente, n.data_emissao, n.mensagem,
           v.total, v.data_hora, v.forma_pagamento, o.nome AS operador_nome
    FROM nfce n
    JOIN vendas v ON n.venda_id = v.id
    JOIN operadores o ON v.operador_id = o.id
    WHERE n.status = 'contingencia'
    ORDER BY n.id ASC
  `);
  res.json(lista);
});

// POST /api/fiscal/contingencia/transmitir — transmite todas as NFC-es em contingência
router.post('/contingencia/transmitir', async (req, res) => {
  const config = db.get('SELECT * FROM config_fiscal WHERE id = 1');
  if (!config || !config.cert_path || !fs.existsSync(config.cert_path)) {
    return res.status(400).json({ ok: false, erro: 'Certificado digital não configurado.' });
  }

  const pendentes = db.all('SELECT * FROM nfce WHERE status = ? ORDER BY id ASC', 'contingencia');
  if (pendentes.length === 0) {
    return res.json({ ok: true, mensagem: 'Nenhuma NFC-e em contingência para transmitir.', transmitidas: 0, erros: 0 });
  }

  let transmitidas = 0;
  let erros = 0;
  const detalhes = [];

  for (const nfce of pendentes) {
    try {
      const resultado = await transmitirNfce(nfce.xml_assinado, config);
      db.run(
        'UPDATE nfce SET status=?, protocolo=?, xml_retorno=?, mensagem=?, data_autorizacao=? WHERE id=?',
        [resultado.ok ? 'autorizada' : 'rejeitada',
         resultado.protocolo || null,
         resultado.xmlRetorno,
         resultado.motivo,
         resultado.ok ? new Date().toISOString() : null,
         nfce.id]
      );
      if (resultado.ok) {
        backup.salvarXmlNfe(nfce.chave, nfce.xml_assinado, resultado.xmlRetorno);
        transmitidas++;
      } else {
        erros++;
      }
      detalhes.push({ id: nfce.id, chave: nfce.chave, ok: resultado.ok, cStat: resultado.cStat, motivo: resultado.motivo });
    } catch (err) {
      db.run('UPDATE nfce SET status=?, mensagem=? WHERE id=?', ['erro', err.message, nfce.id]);
      erros++;
      detalhes.push({ id: nfce.id, chave: nfce.chave, ok: false, motivo: err.message });
    }
  }

  res.json({ ok: true, transmitidas, erros, total: pendentes.length, detalhes });
});

module.exports = router;

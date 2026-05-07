const ESC = 0x1B;
const GS  = 0x1D;

function cmd(...bytes) { return Buffer.from(bytes); }

const INIT        = cmd(ESC, 0x40);
const CODEPAGE    = cmd(ESC, 0x74, 16); // WPC1252 — suporte a acentos
const FONT_B      = cmd(ESC, 0x4D, 1);  // Font B — menor, economiza papel
const FONT_A      = cmd(ESC, 0x4D, 0);  // Font A — normal
const BOLD_ON     = cmd(ESC, 0x45, 1);
const BOLD_OFF    = cmd(ESC, 0x45, 0);
const ALIGN_CT    = cmd(ESC, 0x61, 1);
const ALIGN_LT    = cmd(ESC, 0x61, 0);
const ALIGN_RT    = cmd(ESC, 0x61, 2);
const SIZE_NORMAL = cmd(GS, 0x21, 0x00);
const SIZE_2X     = cmd(GS, 0x21, 0x11);
const FEED3       = cmd(ESC, 0x64, 3);
const CUT         = cmd(GS, 0x56, 0x41, 0x03);
const CASHDRAW    = cmd(ESC, 0x70, 0x00, 0x19, 0xFA);

const LARGURA = 48;
const SEP  = '-'.repeat(LARGURA);
const SEP2 = '='.repeat(LARGURA);

function txt(s) { return Buffer.from(String(s) + '\n', 'latin1'); }
function moeda(v) { return 'R$ ' + Number(v).toFixed(2).replace('.', ','); }
function moedaCurta(v) { return Number(v).toFixed(2).replace('.', ','); }

function linha(esq, dir, larg = LARGURA) {
  const sp = larg - esq.length - dir.length;
  return esq + ' '.repeat(Math.max(1, sp)) + dir;
}

function formatarDataHora(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' ' +
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatarCNPJ(cnpj) {
  const c = (cnpj || '').replace(/\D/g, '').padStart(14, '0');
  return `${c.slice(0,2)}.${c.slice(2,5)}.${c.slice(5,8)}/${c.slice(8,12)}-${c.slice(12)}`;
}

function qrCodeEscPos(url, tamanho = 6) {
  const data = Buffer.from(url, 'latin1');
  const len = data.length + 3;
  const pL = len & 0xFF;
  const pH = (len >> 8) & 0xFF;
  return Buffer.concat([
    Buffer.from([GS, 0x28, 0x6B, 4, 0, 49, 65, 50, 0]),      // modelo 2
    Buffer.from([GS, 0x28, 0x6B, 3, 0, 49, 67, tamanho]),     // tamanho módulo
    Buffer.from([GS, 0x28, 0x6B, 3, 0, 49, 69, 48]),           // correção L
    Buffer.from([GS, 0x28, 0x6B, pL, pH, 49, 80, 48]),         // armazenar dados
    data,
    Buffer.from([GS, 0x28, 0x6B, 3, 0, 49, 81, 48]),           // imprimir
  ]);
}

function montarDanfeNfce(config, venda, nfceData) {
  const homolog = Number(config.ambiente ?? nfceData.ambiente) === 2;
  const partes = [INIT, CODEPAGE, FONT_B];

  // ── Cabeçalho homologação ────────────────────────────────────────────────────
  partes.push(ALIGN_CT);
  if (homolog) {
    partes.push(BOLD_ON, txt('*** HOMOLOGACAO ***'), txt('*** SEM VALOR FISCAL ***'), BOLD_OFF);
    partes.push(txt(SEP));
  }

  // ── Cabeçalho empresa ────────────────────────────────────────────────────────
  const SIZE_2H = cmd(GS, 0x21, 0x01); // altura dupla, largura normal
  partes.push(FONT_A, BOLD_ON, SIZE_2H);
  partes.push(txt((config.fantasia || config.razao_social || 'QUITANDA').toUpperCase().substring(0, 42)));
  partes.push(SIZE_NORMAL, BOLD_OFF, FONT_B);
  partes.push(txt('CNPJ: ' + formatarCNPJ(config.cnpj || '')));
  if (config.logradouro) {
    partes.push(txt((config.logradouro + ', ' + (config.numero || 'SN')).substring(0, LARGURA)));
    const endL2 = [config.bairro, config.municipio, config.uf].filter(Boolean).join(' - ');
    if (endL2) partes.push(txt(endL2.substring(0, LARGURA)));
  }
  if (config.ie) partes.push(txt('I.E.: ' + config.ie));
  if (config.telefone) partes.push(txt('Tel: ' + config.telefone));

  partes.push(txt(SEP));

  // ── Título NFC-e ─────────────────────────────────────────────────────────────
  partes.push(BOLD_ON);
  partes.push(txt('Documento Auxiliar Nota Fiscal'));
  partes.push(txt('de Consumidor Eletronica'));
  partes.push(BOLD_OFF);
  partes.push(txt(SEP));

  // ── Itens ────────────────────────────────────────────────────────────────────
  partes.push(ALIGN_LT);
  partes.push(txt('#  Cod    Descricao'));
  partes.push(txt(SEP));

  venda.itens.forEach((item, idx) => {
    const nItem = String(idx + 1).padStart(2);
    const cod = String(item.produto_id || '').padStart(6, '0');
    const nome = (item.nome || '').substring(0, 30);
    const qtdStr = item.unidade === 'kg'
      ? Number(item.quantidade).toFixed(3) + ' kg'
      : item.quantidade + ' un';
    partes.push(txt(`${nItem} ${cod} ${nome}`));
    partes.push(txt('    ' + linha(qtdStr + ' x ' + moeda(item.preco_unitario), moeda(item.subtotal), 36)));
  });

  partes.push(txt(SEP));

  // ── Totais ───────────────────────────────────────────────────────────────────
  const totalItens = venda.itens.reduce((s, i) => s + Number(i.quantidade), 0);
  partes.push(txt(`Qtd. total de itens  ${totalItens}`));
  partes.push(txt(SEP));

  partes.push(ALIGN_LT, BOLD_ON);
  partes.push(txt(linha('TOTAL', moeda(venda.total))));
  partes.push(BOLD_OFF);

  // ── Pagamento ────────────────────────────────────────────────────────────────
  const fp = venda.forma_pagamento;
  if (fp === 'dinheiro') {
    partes.push(txt(linha('Dinheiro:', moeda(venda.valor_recebido || venda.total))));
    if (Number(venda.troco) > 0) partes.push(txt(linha('Troco:', moeda(venda.troco))));
    if (venda.pagamento_2 === 'pix') partes.push(txt('+ PIX (restante)'));
    if (venda.pagamento_2 === 'cartao') partes.push(txt('+ Cartao (restante)'));
  } else if (fp === 'pix') {
    partes.push(txt(linha('PIX:', moeda(venda.total))));
  } else if (fp === 'cartao') {
    const tipo = venda.tipo_cartao === 'credito' ? 'Credito' : 'Debito';
    partes.push(txt(linha(`Cartao ${tipo}:`, moeda(venda.total))));
    if (venda.bandeira) partes.push(txt('Bandeira: ' + venda.bandeira));
  }

  partes.push(txt(SEP));

  // ── Chave de acesso ──────────────────────────────────────────────────────────
  const chave = nfceData.chave || '';
  const urlConsulta = nfceData.urlConsulta || '';
  partes.push(ALIGN_CT);
  partes.push(txt('Consulte pela Chave de Acesso em'));
  if (urlConsulta) partes.push(txt(urlConsulta.substring(0, LARGURA)));
  // Chave em blocos de 4 dígitos, 2 linhas de 24 chars
  if (chave) {
    const chaveFmt = chave.match(/.{1,4}/g).join(' ');
    partes.push(txt(chaveFmt.substring(0, 24)));
    partes.push(txt(chaveFmt.substring(24)));
  }

  partes.push(txt(SEP));

  // ── Info NFC-e ───────────────────────────────────────────────────────────────
  partes.push(txt('CONSUMIDOR NAO IDENTIFICADO'));
  const nfNum = String(nfceData.numero || '').padStart(6, '0');
  const nfSerie = String(nfceData.serie || config.serie || '1').padStart(3, '0');
  partes.push(txt(`NFCe ${nfNum} Serie ${nfSerie} ${formatarDataHora(venda.data_hora)}`));
  partes.push(txt('Via consumidor'));
  if (nfceData.protocolo) {
    partes.push(txt('Protocolo de autorizacao: ' + nfceData.protocolo));
    partes.push(txt('Data de autorizacao: ' + formatarDataHora(new Date().toISOString())));
  }

  partes.push(txt(SEP));

  // ── QR Code ──────────────────────────────────────────────────────────────────
  const urlQrCode = nfceData.urlQrCode || '';
  if (urlQrCode) {
    partes.push(ALIGN_CT);
    partes.push(qrCodeEscPos(urlQrCode, 6));
    partes.push(txt(''));
  }

  // ── Rodapé ───────────────────────────────────────────────────────────────────
  partes.push(ALIGN_CT);
  if (homolog) {
    partes.push(BOLD_ON);
    partes.push(txt(SEP2));
    partes.push(txt('EMITIDA EM HOMOLOGACAO'));
    partes.push(txt('*** SEM VALOR FISCAL ***'));
    partes.push(txt(SEP2));
    partes.push(BOLD_OFF);
  } else {
    partes.push(txt('Obrigado pela preferencia!'));
  }

  partes.push(FEED3, CUT, CASHDRAW);

  return Buffer.concat(partes);
}

module.exports = { montarDanfeNfce };

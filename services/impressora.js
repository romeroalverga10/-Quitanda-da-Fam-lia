const config = require('../config');
const db = require('../database/db');
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ESC = 0x1B;
const GS = 0x1D;

function cmd(...bytes) { return Buffer.from(bytes); }

const INIT        = cmd(ESC, 0x40);
const CODEPAGE    = cmd(ESC, 0x74, 16); // WPC1252 — suporte a acentos
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

function txt(str) {
  return Buffer.from(str + '\n', 'latin1');
}

function formatarMoeda(valor) {
  return 'R$ ' + Number(valor).toFixed(2).replace('.', ',');
}

function formatarLinha(esq, dir, largura = 40) {
  const espaco = largura - esq.length - dir.length;
  return esq + ' '.repeat(Math.max(1, espaco)) + dir;
}

function formatarData(isoStr) {
  const d = new Date(isoStr);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function montarBuffer(venda) {
  const fiscal = db.get('SELECT * FROM config_fiscal WHERE id = 1') || {};
  const nomeLoja = fiscal.fantasia || fiscal.razao_social || config.nomeLoja || 'Quitanda da Família';
  const sep = '-'.repeat(40);

  const cabecalho = [ALIGN_CT, BOLD_ON, txt(nomeLoja), BOLD_OFF];

  if (fiscal.razao_social && fiscal.razao_social !== nomeLoja)
    cabecalho.push(txt(fiscal.razao_social.substring(0, 40)));

  if (fiscal.cnpj)
    cabecalho.push(txt('CNPJ: ' + fiscal.cnpj));

  if (fiscal.ie)
    cabecalho.push(txt('IE: ' + fiscal.ie));

  const endereco = [fiscal.logradouro, fiscal.numero].filter(Boolean).join(', ');
  if (endereco) cabecalho.push(txt(endereco.substring(0, 40)));

  const enderecoL2 = [fiscal.bairro, fiscal.municipio, fiscal.uf].filter(Boolean).join(' - ');
  if (enderecoL2) cabecalho.push(txt(enderecoL2.substring(0, 40)));

  if (fiscal.telefone)
    cabecalho.push(txt('Tel: ' + fiscal.telefone));

  cabecalho.push(txt(''));

  const partes = [
    INIT, CODEPAGE,
    ...cabecalho,
    ALIGN_LT,
    txt(sep),
    txt('Data: ' + formatarData(venda.data_hora)),
    txt('Operador: ' + (venda.operador_nome || 'N/A')),
    txt('Venda #' + venda.id),
    txt(sep),
  ];

  for (const item of venda.itens) {
    const desc = item.nome.substring(0, 22);
    const qtdStr = item.unidade === 'kg'
      ? Number(item.quantidade).toFixed(3) + 'kg'
      : item.quantidade + 'x';
    partes.push(txt(desc));
    partes.push(txt(formatarLinha('  ' + qtdStr + ' x ' + formatarMoeda(item.preco_unitario), formatarMoeda(item.subtotal))));
  }

  partes.push(
    txt(sep),
    ALIGN_RT, BOLD_ON,
    txt('TOTAL: ' + formatarMoeda(venda.total)),
    BOLD_OFF, ALIGN_LT,
    txt(sep),
  );

  const fp = venda.forma_pagamento;
  if (fp === 'dinheiro') {
    partes.push(
      txt('Pagamento: Dinheiro'),
      txt('Recebido:  ' + formatarMoeda(venda.valor_recebido)),
      txt('Troco:     ' + formatarMoeda(venda.troco)),
    );
  } else if (fp === 'pix') {
    partes.push(txt('Pagamento: PIX'));
  } else if (fp === 'cartao') {
    partes.push(txt('Pagamento: Cartao ' + (venda.tipo_cartao === 'credito' ? 'Credito' : 'Debito')));
    if (venda.bandeira) partes.push(txt('Bandeira:  ' + venda.bandeira));
  }

  partes.push(
    txt(sep),
    ALIGN_CT,
    txt('Obrigado pela preferencia!'),
    txt(nomeLoja),
    FEED3,
    CUT,
    CASHDRAW,
  );

  return Buffer.concat(partes);
}

async function imprimirCupom(venda) {
  try {
    const impressora = config.impressora || 'EPSON TM-T20X Receipt6';
    const buf = montarBuffer(venda);
    const tmpFile = path.join(os.tmpdir(), 'cupom_' + Date.now() + '.bin');
    fs.writeFileSync(tmpFile, buf);

    const script = path.join(__dirname, '..', 'print_raw.ps1');
    execSync(`powershell -ExecutionPolicy Bypass -File "${script}" -PrinterName "${impressora}" -FilePath "${tmpFile}"`, { shell: 'cmd.exe' });
    fs.unlinkSync(tmpFile);

    return { ok: true };
  } catch (err) {
    console.warn('Erro ao imprimir:', err.message);
    return { ok: false, erro: err.message };
  }
}

module.exports = { imprimirCupom };

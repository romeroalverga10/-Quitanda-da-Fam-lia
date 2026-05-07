const express = require('express');
const { execSync } = require('child_process');
const fs = require('fs');
const { lerPeso } = require('../services/balanca');
const { imprimirCupom } = require('../services/impressora');
const { gerarQRCode } = require('../services/pix');

const router = express.Router();

router.get('/balanca/peso', async (req, res) => {
  try {
    const peso = await lerPeso();
    res.json({ ok: true, peso });
  } catch (err) {
    res.status(503).json({ ok: false, erro: err.message });
  }
});

router.post('/imprimir', async (req, res) => {
  const resultado = await imprimirCupom(req.body);
  res.json(resultado);
});

router.get('/impressora/listar', (req, res) => {
  try {
    const saida = execSync('powershell -Command "Get-Printer | Select-Object -ExpandProperty Name"', { shell: 'cmd.exe', encoding: 'latin1' });
    const impressoras = saida.split('\n').map(n => n.trim()).filter(Boolean);
    res.json({ ok: true, impressoras });
  } catch (err) {
    res.json({ ok: false, impressoras: [], erro: err.message });
  }
});

router.post('/impressora/testar', async (req, res) => {
  const config = require('../config');
  const path = require('path');
  const os = require('os');
  const { montarDanfeNfce } = require('../services/danfe_nfce');
  const db = require('../database/db');
  const { execSync } = require('child_process');

  const configFiscal = db.get('SELECT * FROM config_fiscal WHERE id = 1') || {};
  const vendaTeste = {
    id: 0,
    data_hora: new Date().toISOString(),
    operador_nome: 'Teste',
    total: 9.99,
    forma_pagamento: 'dinheiro',
    valor_recebido: 10,
    troco: 0.01,
    itens: [{ nome: 'TESTE DE IMPRESSAO', unidade: 'un', quantidade: 1, preco_unitario: 9.99, subtotal: 9.99 }]
  };
  const nfceTeste = {
    chave: '35260566057243000174650010000000001000000001',
    numero: 1,
    serie: 1,
    protocolo: '135260000000001',
    ambiente: configFiscal.ambiente || 2,
    urlQrCode: 'https://www.homologacao.nfce.fazenda.sp.gov.br/qrcode?p=TESTE',
    urlConsulta: 'https://www.homologacao.nfce.fazenda.sp.gov.br/consulta',
    venda: vendaTeste,
  };

  try {
    const buf = montarDanfeNfce(configFiscal, vendaTeste, nfceTeste);
    const impressora = config.impressora || 'EPSON TM-T20X Receipt6';
    const tmpFile = path.join(os.tmpdir(), 'teste_danfe_' + Date.now() + '.bin');
    fs.writeFileSync(tmpFile, buf);
    const script = path.join(__dirname, '..', 'print_raw.ps1');
    execSync(`powershell -ExecutionPolicy Bypass -File "${script}" -PrinterName "${impressora}" -FilePath "${tmpFile}"`, { shell: 'cmd.exe' });
    fs.unlinkSync(tmpFile);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, erro: err.message });
  }
});

router.get('/pix/qrcode', async (req, res) => {
  const valor = parseFloat(req.query.valor) || 0;
  if (valor <= 0) return res.status(400).json({ erro: 'Valor inválido' });
  try {
    const dados = await gerarQRCode(valor);
    res.json({ ok: true, ...dados });
  } catch (err) {
    res.status(500).json({ ok: false, erro: err.message });
  }
});

module.exports = router;

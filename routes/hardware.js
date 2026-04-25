const express = require('express');
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

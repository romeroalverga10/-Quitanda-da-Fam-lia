const express = require('express');
const { verificarLicenca, ativarLicenca, limparCache } = require('../services/licenca');

const router = express.Router();

router.get('/status', async (req, res) => {
  const status = await verificarLicenca();
  res.json(status);
});

router.post('/ativar', async (req, res) => {
  const { chave, cnpj } = req.body;
  if (!chave || !cnpj) return res.status(400).json({ ok: false, motivo: 'chave e cnpj obrigatórios' });
  const resultado = await ativarLicenca(chave, cnpj);
  res.json(resultado);
});

router.post('/reverificar', async (req, res) => {
  limparCache();
  const status = await verificarLicenca(true);
  res.json(status);
});

module.exports = router;

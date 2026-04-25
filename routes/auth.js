const express = require('express');
const crypto = require('crypto');
const db = require('../database/db');

const router = express.Router();

let operadorLogado = null;

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

router.post('/login', (req, res) => {
  const { nome, senha } = req.body;
  if (!nome || !senha) return res.json({ ok: false, erro: 'Dados obrigatórios' });

  const op = db.get('SELECT * FROM operadores WHERE nome = ?', nome);
  if (!op || op.senha !== sha256(senha)) {
    return res.json({ ok: false, erro: 'Nome ou senha incorretos' });
  }

  operadorLogado = { id: Number(op.id), nome: op.nome };
  res.json({ ok: true, operador: operadorLogado });
});

router.post('/logout', (req, res) => {
  operadorLogado = null;
  res.json({ ok: true });
});

router.get('/operador-atual', (req, res) => {
  res.json({ operador: operadorLogado });
});

router.get('/operadores', (req, res) => {
  const lista = db.all('SELECT id, nome FROM operadores ORDER BY nome');
  res.json(lista);
});

function getOperadorLogado() {
  return operadorLogado;
}

module.exports = router;
module.exports.getOperadorLogado = getOperadorLogado;

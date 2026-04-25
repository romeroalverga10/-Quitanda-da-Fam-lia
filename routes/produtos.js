const express = require('express');
const db = require('../database/db');

const router = express.Router();

const CATS_COM_VALIDADE = ['Hortifruti', 'Frios e Laticínios'];

function diasParaVencer(dataValidade) {
  if (!dataValidade) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const validade = new Date(dataValidade + 'T00:00:00');
  return Math.floor((validade - hoje) / (1000 * 60 * 60 * 24));
}

router.get('/', (req, res) => {
  const rows = db.all(`
    SELECT p.*, c.nome AS categoria_nome
    FROM produtos p
    JOIN categorias c ON p.categoria_id = c.id
    ORDER BY p.nome
  `);

  const produtos = rows.map(p => ({
    ...p,
    estoque_baixo: p.estoque_atual <= p.estoque_minimo,
    validade_dias: diasParaVencer(p.data_validade),
    validade_alerta: diasParaVencer(p.data_validade) !== null && diasParaVencer(p.data_validade) <= 3
  }));

  res.json(produtos);
});

router.get('/categorias', (req, res) => {
  const cats = db.all('SELECT * FROM categorias ORDER BY nome');
  res.json(cats);
});

router.get('/barcode/:codigo', (req, res) => {
  const p = db.get(`
    SELECT p.*, c.nome AS categoria_nome
    FROM produtos p
    JOIN categorias c ON p.categoria_id = c.id
    WHERE p.codigo_barras = ?
  `, req.params.codigo);

  if (!p) return res.status(404).json({ erro: 'Produto não encontrado' });
  res.json(p);
});

router.post('/', (req, res) => {
  const { nome, codigo_barras, categoria_id, preco, unidade, estoque_atual, estoque_minimo, data_validade } = req.body;
  if (!nome || !categoria_id || !preco || !unidade) {
    return res.status(400).json({ erro: 'Campos obrigatórios: nome, categoria, preço, unidade' });
  }

  const result = db.run(
    `INSERT INTO produtos (nome, codigo_barras, categoria_id, preco, unidade, estoque_atual, estoque_minimo, data_validade)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [nome, codigo_barras || null, categoria_id, preco, unidade, estoque_atual || 0, estoque_minimo || 0, data_validade || null]
  );
  res.json({ ok: true, id: Number(result.lastInsertRowid) });
});

router.put('/:id', (req, res) => {
  const { nome, codigo_barras, categoria_id, preco, unidade, estoque_atual, estoque_minimo, data_validade } = req.body;
  db.run(
    `UPDATE produtos SET nome=?, codigo_barras=?, categoria_id=?, preco=?, unidade=?,
     estoque_atual=?, estoque_minimo=?, data_validade=? WHERE id=?`,
    [nome, codigo_barras || null, categoria_id, preco, unidade, estoque_atual, estoque_minimo, data_validade || null, req.params.id]
  );
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.run('DELETE FROM produtos WHERE id = ?', req.params.id);
  res.json({ ok: true });
});

module.exports = router;

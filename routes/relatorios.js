const express = require('express');
const db = require('../database/db');

const router = express.Router();

router.get('/', (req, res) => {
  const data = req.query.data || new Date().toISOString().substring(0, 10);
  const inicio = data + 'T00:00:00.000Z';
  const fim = data + 'T23:59:59.999Z';

  const totalGeral = db.get(
    `SELECT COUNT(*) AS qtd_vendas, COALESCE(SUM(total), 0) AS total
     FROM vendas WHERE data_hora BETWEEN ? AND ? AND cancelada = 0`,
    [inicio, fim]
  );

  const porFormaPagamento = db.all(
    `SELECT forma_pagamento, COUNT(*) AS qtd, COALESCE(SUM(total), 0) AS total
     FROM vendas WHERE data_hora BETWEEN ? AND ?
     GROUP BY forma_pagamento`,
    [inicio, fim]
  );

  const top10 = db.all(
    `SELECT p.nome, SUM(iv.quantidade) AS total_qtd, SUM(iv.subtotal) AS total_valor
     FROM itens_venda iv
     JOIN vendas v ON iv.venda_id = v.id
     JOIN produtos p ON iv.produto_id = p.id
     WHERE v.data_hora BETWEEN ? AND ? AND v.cancelada = 0
     GROUP BY iv.produto_id
     ORDER BY total_valor DESC
     LIMIT 10`,
    [inicio, fim]
  );

  const porOperador = db.all(
    `SELECT o.nome AS operador, COUNT(*) AS qtd_vendas, COALESCE(SUM(v.total), 0) AS total
     FROM vendas v JOIN operadores o ON v.operador_id = o.id
     WHERE v.data_hora BETWEEN ? AND ? AND v.cancelada = 0
     GROUP BY v.operador_id
     ORDER BY total DESC`,
    [inicio, fim]
  );

  res.json({ data, totalGeral, porFormaPagamento, top10, porOperador });
});

module.exports = router;

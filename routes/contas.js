const db = require('../database/db');
const router = require('express').Router();

router.get('/resumo', (req, res) => {
  const hoje = new Date().toISOString().substring(0, 10);
  const totalPagar   = db.get(`SELECT COALESCE(SUM(valor),0) AS total FROM contas WHERE tipo='pagar' AND status='pendente'`);
  const totalReceber = db.get(`SELECT COALESCE(SUM(valor),0) AS total FROM contas WHERE tipo='receber' AND status='pendente'`);
  const totalVencido = db.get(`SELECT COALESCE(SUM(valor),0) AS total FROM contas WHERE tipo='pagar' AND status='pendente' AND data_vencimento<?`, hoje);
  res.json({
    total_pagar:   totalPagar.total,
    total_receber: totalReceber.total,
    total_vencido: totalVencido.total,
    saldo:         totalReceber.total - totalPagar.total
  });
});

router.get('/', (req, res) => {
  const { tipo, status, data_inicio, data_fim } = req.query;
  const hoje = new Date().toISOString().substring(0, 10);

  let sql = `
    SELECT c.*, f.nome AS fornecedor_nome
    FROM contas c
    LEFT JOIN fornecedores f ON c.fornecedor_id = f.id
    WHERE 1=1
  `;
  const params = [];

  if (tipo)        { sql += ' AND c.tipo=?';                  params.push(tipo); }
  if (data_inicio) { sql += ' AND c.data_vencimento>=?';      params.push(data_inicio); }
  if (data_fim)    { sql += ' AND c.data_vencimento<=?';      params.push(data_fim); }

  if (status === 'vencido') {
    sql += ' AND c.status=? AND c.data_vencimento<?';
    params.push('pendente', hoje);
  } else if (status) {
    sql += ' AND c.status=?';
    params.push(status);
  }

  sql += ' ORDER BY c.data_vencimento ASC';
  const rows = db.all(sql, params);

  const contas = rows.map(c => ({
    ...c,
    status_efetivo: c.status === 'pendente' && c.data_vencimento < hoje ? 'vencido' : c.status
  }));

  res.json(contas);
});

router.get('/:id', (req, res) => {
  const row = db.get('SELECT * FROM contas WHERE id=?', req.params.id);
  if (!row) return res.status(404).json({ erro: 'Conta não encontrada' });
  res.json(row);
});

router.post('/', (req, res) => {
  const { descricao, tipo, valor, data_vencimento, fornecedor_id, observacoes } = req.body;
  if (!descricao || !tipo || !valor || !data_vencimento)
    return res.status(400).json({ erro: 'Campos obrigatórios: descricao, tipo, valor, data_vencimento' });
  const r = db.run(
    `INSERT INTO contas (descricao,tipo,valor,data_vencimento,status,fornecedor_id,observacoes)
     VALUES (?,?,?,?,'pendente',?,?)`,
    [descricao, tipo, valor, data_vencimento, fornecedor_id || null, observacoes || null]
  );
  res.json({ ok: true, id: Number(r.lastInsertRowid) });
});

router.put('/:id/pagar', (req, res) => {
  const hoje = new Date().toISOString().substring(0, 10);
  db.run('UPDATE contas SET status=?,data_pagamento=? WHERE id=?', ['pago', hoje, req.params.id]);
  res.json({ ok: true });
});

router.put('/:id', (req, res) => {
  const { descricao, tipo, valor, data_vencimento, fornecedor_id, observacoes } = req.body;
  if (!descricao || !tipo || !valor || !data_vencimento)
    return res.status(400).json({ erro: 'Campos obrigatórios: descricao, tipo, valor, data_vencimento' });
  db.run(
    'UPDATE contas SET descricao=?,tipo=?,valor=?,data_vencimento=?,fornecedor_id=?,observacoes=? WHERE id=?',
    [descricao, tipo, valor, data_vencimento, fornecedor_id || null, observacoes || null, req.params.id]
  );
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  db.run('DELETE FROM contas WHERE id=?', req.params.id);
  res.json({ ok: true });
});

module.exports = router;

const db = require('../database/db');
const router = require('express').Router();

const err = (res, e) => res.json({ ok: false, erro: e.message || 'Erro interno' });

router.get('/', (req, res) => {
  const busca = req.query.busca ? `%${req.query.busca}%` : '%%';
  const rows = db.all(
    `SELECT * FROM fornecedores
     WHERE (nome LIKE ? OR cnpj_cpf LIKE ? OR telefone LIKE ?)
     ORDER BY nome`,
    [busca, busca, busca]
  );
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const row = db.get('SELECT * FROM fornecedores WHERE id=?', req.params.id);
  if (!row) return res.status(404).json({ erro: 'Fornecedor não encontrado' });
  res.json(row);
});

router.post('/', (req, res) => {
  const { nome, cnpj_cpf, telefone, email, endereco, observacoes } = req.body;
  if (!nome) return res.status(400).json({ erro: 'Nome é obrigatório' });
  try {
    const r = db.run(
      'INSERT INTO fornecedores (nome,cnpj_cpf,telefone,email,endereco,observacoes,ativo) VALUES(?,?,?,?,?,?,1)',
      [nome, cnpj_cpf || null, telefone || null, email || null, endereco || null, observacoes || null]
    );
    res.json({ ok: true, id: Number(r.lastInsertRowid) });
  } catch (e) { err(res, e); }
});

router.put('/:id/reativar', (req, res) => {
  try {
    db.run('UPDATE fornecedores SET ativo=1 WHERE id=?', req.params.id);
    res.json({ ok: true });
  } catch (e) { err(res, e); }
});

router.put('/:id', (req, res) => {
  const { nome, cnpj_cpf, telefone, email, endereco, observacoes } = req.body;
  if (!nome) return res.status(400).json({ erro: 'Nome é obrigatório' });
  try {
    db.run(
      'UPDATE fornecedores SET nome=?,cnpj_cpf=?,telefone=?,email=?,endereco=?,observacoes=? WHERE id=?',
      [nome, cnpj_cpf || null, telefone || null, email || null, endereco || null, observacoes || null, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) { err(res, e); }
});

router.delete('/:id', (req, res) => {
  try {
    db.run('UPDATE fornecedores SET ativo=0 WHERE id=?', req.params.id);
    res.json({ ok: true });
  } catch (e) { err(res, e); }
});

module.exports = router;

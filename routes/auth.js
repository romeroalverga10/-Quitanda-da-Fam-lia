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

  operadorLogado = { id: Number(op.id), nome: op.nome, perfil: op.perfil || 'operador' };

  // Registra abertura de caixa automaticamente
  try {
    const agora = (() => { const n = new Date(); return new Date(n - n.getTimezoneOffset() * 60000).toISOString().slice(0, -1); })();
    const aberta = db.get(
      `SELECT id FROM aberturas_caixa WHERE operador_id = ? AND DATE(data_hora) = DATE(?) AND fechada = 0`,
      [operadorLogado.id, agora]
    );
    if (!aberta) {
      db.run(`INSERT INTO aberturas_caixa (operador_id, data_hora, fechada) VALUES (?, ?, 0)`, [operadorLogado.id, agora]);
    }
  } catch {}

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
  try {
    const lista = db.all('SELECT id, nome, perfil, turno, codigo_barras FROM operadores ORDER BY turno, nome');
    const ehAdmin = operadorLogado?.perfil === 'admin';
    const resposta = lista.map(o => ({
      id: o.id,
      nome: o.nome,
      perfil: o.perfil,
      turno: o.turno || 'manha',
      codigo_barras: ehAdmin ? o.codigo_barras : (o.codigo_barras ? '***' : null)
    }));
    res.json(resposta);
  } catch (e) {
    console.error('Erro GET /operadores:', e.message);
    try {
      // Fallback: busca sem colunas que podem não existir
      const lista = db.all('SELECT id, nome, perfil FROM operadores ORDER BY nome');
      res.json(lista.map(o => ({ id: o.id, nome: o.nome, perfil: o.perfil, turno: 'manha', codigo_barras: null })));
    } catch (e2) {
      console.error('Erro fallback /operadores:', e2.message);
      res.json([]);
    }
  }
});

// Verifica se código pertence a um administrador (para autorizar cancelamento)
router.post('/operadores/verificar-admin', (req, res) => {
  const { codigo } = req.body;
  if (!codigo) return res.json({ ok: false });
  const op = db.get("SELECT id, nome FROM operadores WHERE codigo_barras = ? AND perfil = 'admin'", codigo);
  res.json(op ? { ok: true, nome: op.nome } : { ok: false });
});

router.post('/operadores', (req, res) => {
  const { nome, senha, perfil, turno, codigo_barras } = req.body;
  if (!nome || !senha) return res.json({ ok: false, erro: 'Nome e senha obrigatórios' });
  try {
    db.run('INSERT INTO operadores (nome, senha, perfil, turno, codigo_barras) VALUES (?, ?, ?, ?, ?)',
      [nome, sha256(senha), perfil || 'operador', turno || 'manha', codigo_barras || null]);
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, erro: 'Nome já existe' });
  }
});

router.put('/operadores/:id', (req, res) => {
  const { nome, senha, perfil, turno, codigo_barras } = req.body;
  if (senha) {
    db.run('UPDATE operadores SET nome=?, senha=?, perfil=?, turno=?, codigo_barras=? WHERE id=?',
      [nome, sha256(senha), perfil || 'operador', turno || 'manha', codigo_barras || null, req.params.id]);
  } else {
    db.run('UPDATE operadores SET nome=?, perfil=?, turno=?, codigo_barras=? WHERE id=?',
      [nome, perfil || 'operador', turno || 'manha', codigo_barras || null, req.params.id]);
  }
  res.json({ ok: true });
});

router.delete('/operadores/:id', (req, res) => {
  const op = db.get('SELECT * FROM operadores WHERE id = ?', req.params.id);
  if (!op) return res.json({ ok: false, erro: 'Operador não encontrado' });
  if (op.perfil === 'admin') {
    const qtdAdmins = db.get('SELECT COUNT(*) AS total FROM operadores WHERE perfil = ?', 'admin');
    if (qtdAdmins.total <= 1) return res.json({ ok: false, erro: 'Não é possível excluir o único administrador do sistema' });
  }
  const temVendas = db.get('SELECT COUNT(*) AS total FROM vendas WHERE operador_id = ?', req.params.id);
  if (temVendas.total > 0 && !req.query.forcar) {
    return res.json({ ok: false, temVendas: true, totalVendas: temVendas.total, nome: op.nome });
  }
  try {
    if (temVendas.total > 0) {
      const vendaIds = db.all('SELECT id FROM vendas WHERE operador_id = ?', req.params.id).map(v => v.id);
      for (const vid of vendaIds) {
        db.run('DELETE FROM itens_venda WHERE venda_id = ?', vid);
      }
      db.run('DELETE FROM vendas WHERE operador_id = ?', req.params.id);
      db.run('DELETE FROM aberturas_caixa WHERE operador_id = ?', req.params.id);
      db.run('DELETE FROM fechamentos_caixa WHERE operador_id = ?', req.params.id);
    }
    db.run('DELETE FROM operadores WHERE id = ?', req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, erro: 'Erro ao excluir operador: ' + e.message });
  }
});

function getOperadorLogado() {
  return operadorLogado;
}

module.exports = router;
module.exports.getOperadorLogado = getOperadorLogado;

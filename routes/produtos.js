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
    WHERE p.ativo = 1
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

router.get('/validade', (req, res) => {
  const rows = db.all(`
    SELECT p.*, c.nome AS categoria_nome
    FROM produtos p
    JOIN categorias c ON p.categoria_id = c.id
    WHERE p.data_validade IS NOT NULL AND p.data_validade != ''
    ORDER BY p.data_validade ASC
  `);

  const produtos = rows.map(p => {
    const dias = diasParaVencer(p.data_validade);
    let status = 'ok';
    if (dias < 0) status = 'vencido';
    else if (dias <= 1) status = 'critico';
    else if (dias <= 3) status = 'atencao';
    return { ...p, dias_para_vencer: dias, status };
  });

  res.json(produtos);
});

router.patch('/:id/validade', (req, res) => {
  try {
    const { data_validade } = req.body;
    db.run('UPDATE produtos SET data_validade = ? WHERE id = ?', [data_validade || null, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.json({ ok: false, erro: e.message }); }
});

router.get('/categorias', (req, res) => {
  const cats = db.all('SELECT * FROM categorias ORDER BY nome');
  res.json(cats);
});

router.post('/categorias', (req, res) => {
  const nome = (req.body.nome || '').trim();
  if (!nome) return res.status(400).json({ erro: 'Nome obrigatório.' });
  try {
    const result = db.run('INSERT INTO categorias (nome) VALUES (?)', nome);
    res.json({ ok: true, id: result.lastInsertRowid, nome });
  } catch (e) {
    res.status(400).json({ erro: 'Categoria já existe.' });
  }
});

router.delete('/categorias/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const emUso = db.get('SELECT COUNT(*) AS total FROM produtos WHERE categoria_id = ? AND ativo = 1', id).total;
  if (emUso > 0) {
    return res.status(400).json({ erro: `Não é possível excluir: ${emUso} produto(s) nessa categoria. Mova-os primeiro.` });
  }
  db.run('DELETE FROM categorias WHERE id = ?', id);
  res.json({ ok: true });
});

router.get('/barcode/:codigo', (req, res) => {
  const codigo = req.params.codigo;
  const p = db.get(`
    SELECT p.*, c.nome AS categoria_nome
    FROM produtos p
    JOIN categorias c ON p.categoria_id = c.id
    WHERE p.codigo_barras = ? OR CAST(p.id AS TEXT) = ?
  `, [codigo, codigo]);

  if (!p) return res.status(404).json({ erro: 'Produto não encontrado' });
  res.json(p);
});

function limparNCM(ncm) {
  const s = (ncm || '').replace(/\D/g, '');
  return s || null;
}

router.post('/', (req, res) => {
  const { nome, codigo_barras, categoria_id, preco, unidade, estoque_atual, estoque_minimo, data_validade, ncm, origem } = req.body;
  if (!nome) {
    return res.status(400).json({ erro: 'O nome do produto é obrigatório' });
  }

  try {
    const result = db.run(
      `INSERT INTO produtos (nome, codigo_barras, categoria_id, preco, unidade, estoque_atual, estoque_minimo, data_validade, ncm, origem)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [nome, codigo_barras || null, categoria_id || 1, preco || 0, unidade || 'unidade',
       estoque_atual || 0, estoque_minimo || 0, data_validade || null,
       limparNCM(ncm), origem || 0]
    );
    res.json({ ok: true, id: Number(result.lastInsertRowid) });
  } catch (e) {
    if (e.message && e.message.includes('UNIQUE')) {
      return res.json({ ok: false, erro: 'Código de barras já cadastrado em outro produto.' });
    }
    res.json({ ok: false, erro: e.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const { nome, codigo_barras, categoria_id, preco, unidade, estoque_atual, estoque_minimo, data_validade, ncm, origem } = req.body;
    db.run(
      `UPDATE produtos SET nome=?, codigo_barras=?, categoria_id=?, preco=?, unidade=?,
       estoque_atual=?, estoque_minimo=?, data_validade=?, ncm=?, origem=? WHERE id=?`,
      [nome, codigo_barras || null, categoria_id, preco, unidade,
       estoque_atual, estoque_minimo, data_validade || null,
       limparNCM(ncm), origem || 0, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) {
    if (e.message && e.message.includes('UNIQUE')) {
      return res.json({ ok: false, erro: 'Código de barras já cadastrado em outro produto.' });
    }
    res.json({ ok: false, erro: e.message });
  }
});

router.post('/zerar-estoque', (req, res) => {
  const { total } = db.get('SELECT COUNT(*) AS total FROM produtos WHERE ativo = 1');
  db.run('UPDATE produtos SET estoque_atual = 0 WHERE ativo = 1');
  res.json({ ok: true, total });
});

router.delete('/:id', (req, res) => {
  const temVendas = db.get('SELECT 1 FROM itens_venda WHERE produto_id = ? LIMIT 1', req.params.id);
  if (temVendas) {
    db.run('UPDATE produtos SET ativo = 0, codigo_barras = NULL WHERE id = ?', req.params.id);
    return res.json({ ok: true, desativado: true, msg: 'Produto desativado (possui vendas no histórico)' });
  }
  db.run('DELETE FROM produtos WHERE id = ?', req.params.id);
  res.json({ ok: true, desativado: false });
});

module.exports = router;

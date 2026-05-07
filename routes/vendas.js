const express = require('express');
const db = require('../database/db');
const { getOperadorLogado } = require('./auth');
const { imprimirCupom } = require('../services/impressora');
const { montarDanfeNfce } = require('../services/danfe_nfce');
const { emitirNfce } = require('../services/nfce');
const config = require('../config');

const router = express.Router();

function diasParaVencer(dataValidade) {
  if (!dataValidade) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const validade = new Date(dataValidade + 'T00:00:00');
  return Math.floor((validade - hoje) / (1000 * 60 * 60 * 24));
}

router.post('/', (req, res) => {
  const { itens, forma_pagamento, valor_recebido, tipo_cartao, bandeira, pagamento_2, valor_dinheiro, pagamentos, troco: trocoEnviado, cpf_cliente } = req.body;
  const operador = getOperadorLogado();

  if (!operador) return res.status(401).json({ erro: 'Operador não logado' });
  if (!itens || itens.length === 0) return res.status(400).json({ erro: 'Carrinho vazio' });

  const total = itens.reduce((s, i) => s + i.subtotal, 0);
  const troco = trocoEnviado != null ? Number(trocoEnviado) : (forma_pagamento === 'dinheiro' ? Math.max(0, Number(valor_recebido) - total) : 0);

  let vendaId;
  try {
    db.exec('BEGIN TRANSACTION');

    const vendaResult = db.run(
      `INSERT INTO vendas (operador_id, data_hora, total, forma_pagamento, valor_recebido, troco, tipo_cartao, bandeira, pagamento_2, valor_dinheiro, pagamentos_json, cpf_cliente)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [operador.id, (() => { const n = new Date(); return new Date(n - n.getTimezoneOffset() * 60000).toISOString().slice(0, -1); })(), total, forma_pagamento,
       valor_recebido || null, troco, tipo_cartao || null, bandeira || null, pagamento_2 || null, valor_dinheiro || null,
       pagamentos ? JSON.stringify(pagamentos) : null, cpf_cliente || null]
    );
    vendaId = Number(vendaResult.lastInsertRowid);

    for (const item of itens) {
      db.run(
        `INSERT INTO itens_venda (venda_id, produto_id, quantidade, preco_unitario, subtotal)
         VALUES (?, ?, ?, ?, ?)`,
        [vendaId, item.produto_id, item.quantidade, item.preco_unitario, item.subtotal]
      );
      db.run(
        'UPDATE produtos SET estoque_atual = estoque_atual - ? WHERE id = ?',
        [item.quantidade, item.produto_id]
      );
    }

    db.exec('COMMIT');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch {}
    return res.status(500).json({ erro: err.message });
  }

  const venda = db.get(
    `SELECT v.*, o.nome AS operador_nome
     FROM vendas v JOIN operadores o ON v.operador_id = o.id
     WHERE v.id = ?`,
    vendaId
  );

  const itensCompletos = db.all(
    `SELECT iv.*, p.nome, p.unidade
     FROM itens_venda iv JOIN produtos p ON iv.produto_id = p.id
     WHERE iv.venda_id = ?`,
    vendaId
  );

  res.json({ ok: true, venda: { ...venda, itens: itensCompletos } });

  // Emissão NFC-e assíncrona (não bloqueia a resposta ao frontend)
  emitirNfce(vendaId).then(resultado => {
    if (resultado.ok) {
      const { montarDanfeNfce } = require('../services/danfe_nfce');
      const { imprimirCupom: _imp } = require('../services/impressora');
      const fs = require('fs');
      const os = require('os');
      const path = require('path');
      const { execSync } = require('child_process');
      try {
        const configFiscal = resultado.config;
        const buf = montarDanfeNfce(configFiscal, resultado.venda, resultado);
        const impressora = config.impressora || 'EPSON TM-T20X Receipt6';
        const tmpFile = path.join(os.tmpdir(), 'danfe_' + Date.now() + '.bin');
        fs.writeFileSync(tmpFile, buf);
        const script = path.join(__dirname, '..', 'print_raw.ps1');
        execSync(`powershell -ExecutionPolicy Bypass -File "${script}" -PrinterName "${impressora}" -FilePath "${tmpFile}"`, { shell: 'cmd.exe' });
        fs.unlinkSync(tmpFile);
      } catch (e) {
        console.warn('Erro ao imprimir DANFE NFC-e:', e.message);
      }
    } else {
      console.warn('NFC-e não emitida para venda', vendaId, ':', resultado.erro || resultado.motivo);
    }
  }).catch(err => {
    console.warn('Falha NFC-e venda', vendaId, ':', err.message);
  });
});

router.get('/recentes', (req, res) => {
  const vendas = db.all(`
    SELECT v.id, v.data_hora, v.total, v.forma_pagamento, v.cancelada, o.nome AS operador_nome
    FROM vendas v JOIN operadores o ON v.operador_id = o.id
    ORDER BY v.id DESC LIMIT 30
  `);
  res.json(vendas);
});

router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const venda = db.get('SELECT * FROM vendas WHERE id = ?', id);
  if (!venda) return res.status(404).json({ erro: 'Venda não encontrada' });
  if (venda.cancelada) return res.status(400).json({ erro: 'Venda já cancelada' });

  try {
    db.exec('BEGIN TRANSACTION');
    const itens = db.all('SELECT * FROM itens_venda WHERE venda_id = ?', id);
    for (const item of itens) {
      db.run('UPDATE produtos SET estoque_atual = estoque_atual + ? WHERE id = ?', [item.quantidade, item.produto_id]);
    }
    db.run('UPDATE vendas SET cancelada = 1 WHERE id = ?', id);
    db.exec('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(500).json({ erro: err.message });
  }
});

router.get('/alertas', (req, res) => {
  const estoqueMin = db.all(`
    SELECT p.id, p.nome, p.estoque_atual, p.estoque_minimo, c.nome AS categoria_nome
    FROM produtos p JOIN categorias c ON p.categoria_id = c.id
    WHERE p.estoque_atual <= p.estoque_minimo
    ORDER BY p.nome
  `);

  const todasComValidade = db.all(`
    SELECT p.id, p.nome, p.data_validade, c.nome AS categoria_nome
    FROM produtos p JOIN categorias c ON p.categoria_id = c.id
    WHERE p.data_validade IS NOT NULL
    ORDER BY p.data_validade
  `);

  const validadeAlerta = todasComValidade
    .map(p => ({ ...p, dias: diasParaVencer(p.data_validade) }))
    .filter(p => p.dias <= 3);

  res.json({ estoque: estoqueMin, validade: validadeAlerta });
});

router.get('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const venda = db.get(
    `SELECT v.*, o.nome AS operador_nome FROM vendas v JOIN operadores o ON v.operador_id = o.id WHERE v.id = ?`,
    id
  );
  if (!venda) return res.status(404).json({ erro: 'Venda não encontrada' });
  const itens = db.all(
    `SELECT iv.*, p.nome, p.unidade FROM itens_venda iv JOIN produtos p ON iv.produto_id = p.id WHERE iv.venda_id = ?`,
    id
  );
  res.json({ ...venda, itens });
});

router.post('/:id/reimprimir', async (req, res) => {
  const id = parseInt(req.params.id);
  const venda = db.get(
    `SELECT v.*, o.nome AS operador_nome FROM vendas v JOIN operadores o ON v.operador_id = o.id WHERE v.id = ?`,
    id
  );
  if (!venda) return res.status(404).json({ erro: 'Venda não encontrada' });
  const itens = db.all(
    `SELECT iv.*, p.nome, p.unidade FROM itens_venda iv JOIN produtos p ON iv.produto_id = p.id WHERE iv.venda_id = ?`,
    id
  );
  const resultado = await imprimirCupom({ ...venda, itens });
  res.json(resultado);
});

module.exports = router;

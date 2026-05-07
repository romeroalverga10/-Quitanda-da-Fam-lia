const express = require('express');
const db = require('../database/db');
const router = express.Router();

// ── Abertura de Caixa ──────────────────────────────
router.post('/abertura', (req, res) => {
  const { operador_id } = req.body;
  if (!operador_id) return res.json({ ok: false, erro: 'Operador obrigatório' });
  const data_hora = hojeLocal();
  // Verifica se já tem abertura aberta hoje (sem fechamento)
  const aberta = db.get(
    `SELECT id FROM aberturas_caixa WHERE operador_id = ? AND DATE(data_hora) = DATE(?) AND fechada = 0`,
    [operador_id, data_hora]
  );
  if (aberta) return res.json({ ok: true, ja_aberto: true, id: aberta.id });
  db.run(
    `INSERT INTO aberturas_caixa (operador_id, data_hora, fechada) VALUES (?, ?, 0)`,
    [operador_id, data_hora]
  );
  res.json({ ok: true, data_hora });
});

router.get('/abertura/:operador_id', (req, res) => {
  const { operador_id } = req.params;
  const lista = db.all(
    `SELECT * FROM aberturas_caixa WHERE operador_id = ? AND fechada = 0 ORDER BY data_hora ASC`,
    [operador_id]
  );
  res.json(lista);
});

function hojeLocal() {
  const now = new Date();
  return new Date(now - now.getTimezoneOffset() * 60000).toISOString().slice(0, -1);
}

router.post('/', (req, res) => {
  const { operador_id, data_abertura, observacoes } = req.body;
  if (!operador_id || !data_abertura) return res.json({ ok: false, erro: 'Dados obrigatórios' });

  try {
    const data_fechamento = hojeLocal();

    // Busca todas as vendas do operador no mesmo dia da abertura
    const dataStr   = data_abertura.substring(0, 10);
    const inicioDia = dataStr + 'T00:00:00.000';
    const fimDia    = dataStr + 'T23:59:59.999';

    let vendas;
    try {
      vendas = db.all(
        `SELECT total, forma_pagamento, pagamentos_json FROM vendas
         WHERE operador_id = ? AND data_hora BETWEEN ? AND ? AND (cancelada = 0 OR cancelada IS NULL)`,
        [operador_id, inicioDia, fimDia]
      );
    } catch {
      vendas = db.all(
        `SELECT total, forma_pagamento, pagamentos_json FROM vendas
         WHERE operador_id = ? AND data_hora BETWEEN ? AND ?`,
        [operador_id, inicioDia, fimDia]
      );
    }

    let total_vendas = 0, total_dinheiro = 0, total_pix = 0, total_debito = 0, total_credito = 0;
    for (const v of vendas) {
      total_vendas += v.total;
      if (v.pagamentos_json) {
        try {
          const pags = JSON.parse(v.pagamentos_json);
          for (const p of pags) {
            if      (p.metodo === 'dinheiro') total_dinheiro += p.valor;
            else if (p.metodo === 'pix')      total_pix      += p.valor;
            else if (p.metodo === 'debito')   total_debito   += p.valor;
            else if (p.metodo === 'credito')  total_credito  += p.valor;
            else if (p.metodo === 'cartao')   total_debito   += p.valor; // fallback genérico → débito
          }
        } catch {}
      } else {
        const fp = v.forma_pagamento || '';
        if      (fp.includes('dinheiro')) total_dinheiro += v.total;
        else if (fp.includes('pix'))      total_pix      += v.total;
        else if (fp.includes('credito'))  total_credito  += v.total;
        else if (fp.includes('debito') || fp.includes('cartao')) total_debito += v.total;
      }
    }

    const totais = {
      total_vendas:   parseFloat(total_vendas.toFixed(2)),
      qtd_vendas:     vendas.length,
      total_dinheiro: parseFloat(total_dinheiro.toFixed(2)),
      total_pix:      parseFloat(total_pix.toFixed(2)),
      total_debito:   parseFloat(total_debito.toFixed(2)),
      total_credito:  parseFloat(total_credito.toFixed(2)),
      total_cartao:   parseFloat((total_debito + total_credito).toFixed(2))
    };

    db.run(
      `INSERT INTO fechamentos_caixa (operador_id, data_abertura, data_fechamento, total_vendas, qtd_vendas, total_dinheiro, total_pix, total_cartao, total_debito, total_credito, observacoes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [operador_id, data_abertura, data_fechamento,
       totais.total_vendas, totais.qtd_vendas,
       totais.total_dinheiro, totais.total_pix, totais.total_cartao,
       totais.total_debito, totais.total_credito,
       observacoes || null]
    );

    // Marca apenas a abertura específica como fechada
    try {
      db.run(
        `UPDATE aberturas_caixa SET fechada = 1 WHERE operador_id = ? AND data_hora = ? AND fechada = 0`,
        [operador_id, data_abertura]
      );
    } catch {}

    res.json({ ok: true, resumo: { ...totais, data_abertura, data_fechamento } });
  } catch (err) {
    console.error('Erro fechamento:', err.message);
    res.json({ ok: false, erro: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    db.run('DELETE FROM fechamentos_caixa WHERE id = ?', req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, erro: e.message });
  }
});


router.get('/', (req, res) => {
  const { operador_id, data } = req.query;
  let sql = `
    SELECT f.*, o.nome AS operador_nome, o.turno
    FROM fechamentos_caixa f
    JOIN operadores o ON f.operador_id = o.id
    WHERE 1=1
  `;
  const params = [];
  if (operador_id) { sql += ' AND f.operador_id = ?'; params.push(operador_id); }
  if (data) { sql += ' AND DATE(f.data_fechamento) = ?'; params.push(data); }
  sql += ' ORDER BY f.data_fechamento DESC LIMIT 100';
  res.json(db.all(sql, params));
});

module.exports = router;

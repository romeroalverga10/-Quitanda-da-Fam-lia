const express = require('express');
const db = require('../database/db');

const router = express.Router();

router.get('/', (req, res) => {
  function hojeLocal() {
    const now = new Date();
    return new Date(now - now.getTimezoneOffset() * 60000).toISOString().substring(0, 10);
  }
  const dataInicio = req.query.inicio || req.query.data || hojeLocal();
  const dataFim = req.query.fim || req.query.data || hojeLocal();
  const inicio = dataInicio + 'T00:00:00.000';
  const fim = dataFim + 'T23:59:59.999';
  const operadorId = req.query.operador_id || null;

  const filtroOp = operadorId ? ' AND operador_id = ?' : '';
  const paramsBase = operadorId ? [inicio, fim, operadorId] : [inicio, fim];

  const totalGeral = db.get(
    `SELECT COUNT(*) AS qtd_vendas, COALESCE(SUM(total), 0) AS total
     FROM vendas WHERE data_hora BETWEEN ? AND ? AND cancelada = 0${filtroOp}`,
    paramsBase
  );

  // Calcula totais por forma de pagamento lendo pagamentos_json quando disponível
  const vendasPagto = db.all(
    `SELECT total, forma_pagamento, pagamentos_json
     FROM vendas WHERE data_hora BETWEEN ? AND ? AND cancelada = 0${filtroOp}`,
    paramsBase
  );
  const totaisPagto = { dinheiro: 0, pix: 0, debito: 0, credito: 0 };
  for (const v of vendasPagto) {
    if (v.pagamentos_json) {
      try {
        for (const p of JSON.parse(v.pagamentos_json)) {
          if      (p.metodo === 'dinheiro') totaisPagto.dinheiro += p.valor;
          else if (p.metodo === 'pix')      totaisPagto.pix      += p.valor;
          else if (p.metodo === 'debito')   totaisPagto.debito   += p.valor;
          else if (p.metodo === 'credito')  totaisPagto.credito  += p.valor;
          else if (p.metodo === 'cartao')   totaisPagto.debito   += p.valor; // fallback genérico
        }
      } catch {}
    } else {
      const fp = (v.forma_pagamento || '').toLowerCase();
      if      (fp === 'dinheiro') totaisPagto.dinheiro += v.total;
      else if (fp === 'pix')      totaisPagto.pix      += v.total;
      else if (fp === 'debito')   totaisPagto.debito   += v.total;
      else if (fp === 'credito')  totaisPagto.credito  += v.total;
      else if (fp === 'cartao')   totaisPagto.debito   += v.total;
    }
  }
  const r2 = (n) => Math.round(n * 100) / 100;
  const porFormaPagamento = [
    { forma_pagamento: 'dinheiro', total: r2(totaisPagto.dinheiro) },
    { forma_pagamento: 'pix',      total: r2(totaisPagto.pix)      },
    { forma_pagamento: 'debito',   total: r2(totaisPagto.debito)   },
    { forma_pagamento: 'credito',  total: r2(totaisPagto.credito)  },
    { forma_pagamento: 'cartao',   total: r2(totaisPagto.debito + totaisPagto.credito) },
  ];

  const top10 = db.all(
    `SELECT p.nome, SUM(iv.quantidade) AS total_qtd, SUM(iv.subtotal) AS total_valor
     FROM itens_venda iv
     JOIN vendas v ON iv.venda_id = v.id
     JOIN produtos p ON iv.produto_id = p.id
     WHERE v.data_hora BETWEEN ? AND ? AND v.cancelada = 0${filtroOp}
     GROUP BY iv.produto_id
     ORDER BY total_valor DESC
     LIMIT 10`,
    paramsBase
  );

  const produtosVendidos = db.all(
    `SELECT p.nome, c.nome AS categoria, p.unidade,
            SUM(iv.quantidade) AS total_qtd,
            iv.preco_unitario AS preco,
            SUM(iv.subtotal) AS total_valor
     FROM itens_venda iv
     JOIN vendas v ON iv.venda_id = v.id
     JOIN produtos p ON iv.produto_id = p.id
     JOIN categorias c ON p.categoria_id = c.id
     WHERE v.data_hora BETWEEN ? AND ? AND v.cancelada = 0${filtroOp}
     GROUP BY iv.produto_id
     ORDER BY p.nome ASC`,
    paramsBase
  );

  const porOperador = db.all(
    `SELECT o.nome AS operador, o.turno, COUNT(*) AS qtd_vendas, COALESCE(SUM(v.total), 0) AS total
     FROM vendas v JOIN operadores o ON v.operador_id = o.id
     WHERE v.data_hora BETWEEN ? AND ? AND v.cancelada = 0${filtroOp}
     GROUP BY v.operador_id
     ORDER BY total DESC`,
    paramsBase
  );

  const totalProdutos = db.get(
    `SELECT COALESCE(SUM(iv.quantidade), 0) AS qtd_produtos
     FROM itens_venda iv
     JOIN vendas v ON iv.venda_id = v.id
     WHERE v.data_hora BETWEEN ? AND ? AND v.cancelada = 0${filtroOp}`,
    paramsBase
  );

  res.json({ totalGeral, porFormaPagamento, top10, porOperador, totalProdutos, produtosVendidos });
});

// Inventário: todos os produtos com estoque e valor total
router.get('/inventario', (req, res) => {
  const produtos = db.all(`
    SELECT p.id, p.nome, p.codigo_barras, c.nome AS categoria,
           p.unidade, p.preco, p.estoque_atual, p.estoque_minimo,
           p.ncm, p.data_validade, p.ativo,
           ROUND(p.preco * p.estoque_atual, 2) AS valor_total
    FROM produtos p
    JOIN categorias c ON p.categoria_id = c.id
    WHERE p.ativo = 1
    ORDER BY c.nome, p.nome
  `);

  const totalEstoque = produtos.reduce((s, p) => s + (p.valor_total || 0), 0);
  const totalItens   = produtos.length;

  res.json({ produtos, totalEstoque: Math.round(totalEstoque * 100) / 100, totalItens });
});

// CSV para download
router.get('/inventario/csv', (req, res) => {
  const produtos = db.all(`
    SELECT p.nome, p.codigo_barras, c.nome AS categoria,
           p.unidade, p.preco, p.estoque_atual,
           ROUND(p.preco * p.estoque_atual, 2) AS valor_total,
           p.ncm, p.data_validade
    FROM produtos p
    JOIN categorias c ON p.categoria_id = c.id
    WHERE p.ativo = 1
    ORDER BY c.nome, p.nome
  `);

  const agora = new Date().toLocaleString('pt-BR');
  const linhas = [
    `Inventário Quitanda da Família — ${agora}`,
    '',
    'Nome;Código;Categoria;Unidade;Preço Unit.;Estoque;Valor Total;NCM;Validade',
    ...produtos.map(p => [
      p.nome,
      p.codigo_barras || '',
      p.categoria,
      p.unidade,
      String(p.preco).replace('.', ','),
      String(p.estoque_atual).replace('.', ','),
      String(p.valor_total || 0).replace('.', ','),
      p.ncm || '',
      p.data_validade || ''
    ].join(';')),
    '',
    `TOTAL;;;;;;${String(produtos.reduce((s, p) => s + (p.valor_total || 0), 0).toFixed(2)).replace('.', ',')};;`
  ];

  const bom = '﻿'; // BOM para Excel reconhecer UTF-8
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="inventario_${new Date().toISOString().slice(0,10)}.csv"`);
  res.send(bom + linhas.join('\r\n'));
});

module.exports = router;

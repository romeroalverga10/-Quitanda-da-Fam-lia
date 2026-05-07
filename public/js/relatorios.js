function hoje() {
  const now = new Date();
  return new Date(now - now.getTimezoneOffset() * 60000).toISOString().substring(0, 10);
}
function fmt(v) { return 'R$ ' + Number(v).toFixed(2).replace('.', ','); }

async function carregarOperadores() {
  const ops = await fetch('/api/operadores').then(r => r.json());
  const sel = document.getElementById('filtroOperador');
  ops.forEach(o => {
    const opt = document.createElement('option');
    opt.value = o.id;
    opt.textContent = `${o.nome} (${o.turno === 'manha' ? 'Manhã' : 'Tarde'})`;
    sel.appendChild(opt);
  });
}

async function carregarRelatorio() {
  const inicio = document.getElementById('dataInicio').value || hoje();
  const fim = document.getElementById('dataFim').value || hoje();
  const opId = document.getElementById('filtroOperador').value;
  const url = `/api/relatorios?inicio=${inicio}&fim=${fim}${opId ? '&operador_id=' + opId : ''}`;
  const res = await fetch(url).then(r => r.json());

  document.getElementById('totalVendas').textContent = fmt(res.totalGeral.total);
  document.getElementById('qtdVendas').textContent = `${res.totalGeral.qtd_vendas} venda(s)`;
  document.getElementById('qtdProdutos').textContent = Number(res.totalProdutos.qtd_produtos).toFixed(0);

  const fp = res.porFormaPagamento;
  const getTotal = (forma) => fmt(fp.find(f => f.forma_pagamento === forma)?.total || 0);
  document.getElementById('totalDinheiro').textContent = getTotal('dinheiro');
  document.getElementById('totalPix').textContent = getTotal('pix');
  document.getElementById('totalDebito').textContent = getTotal('debito');
  document.getElementById('totalCredito').textContent = getTotal('credito');

  const corpoProd = document.getElementById('corpoProdutosVendidos');
  if (!res.produtosVendidos.length) {
    corpoProd.innerHTML = '<tr><td colspan="5" class="text-center" style="color:#aaa">Sem vendas no período</td></tr>';
  } else {
    corpoProd.innerHTML = res.produtosVendidos.map(p => `
      <tr>
        <td>${p.nome}</td>
        <td>${p.categoria}</td>
        <td>${fmt(p.preco)}</td>
        <td>${Number(p.total_qtd).toFixed(3).replace(/\.?0+$/, '')} ${p.unidade}</td>
        <td>${fmt(p.total_valor)}</td>
      </tr>
    `).join('');
  }

  const corpoTop = document.getElementById('corpoTop10');
  if (!res.top10.length) {
    corpoTop.innerHTML = '<tr><td colspan="4" class="text-center" style="color:#aaa">Sem vendas no período</td></tr>';
  } else {
    corpoTop.innerHTML = res.top10.map((p, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${p.nome}</td>
        <td>${Number(p.total_qtd).toFixed(2)}</td>
        <td>${fmt(p.total_valor)}</td>
      </tr>
    `).join('');
  }

  const corpoOp = document.getElementById('corpoOperadores');
  if (!res.porOperador.length) {
    corpoOp.innerHTML = '<tr><td colspan="3" class="text-center" style="color:#aaa">Sem vendas no período</td></tr>';
  } else {
    corpoOp.innerHTML = res.porOperador.map(o => `
      <tr>
        <td>${o.operador}</td>
        <td>${o.qtd_vendas}</td>
        <td>${fmt(o.total)}</td>
      </tr>
    `).join('');
  }
}

document.getElementById('dataInicio').value = hoje();
document.getElementById('dataFim').value = hoje();
carregarOperadores();
carregarRelatorio();

function hoje() {
  return new Date().toISOString().substring(0, 10);
}
function fmt(v) { return 'R$ ' + Number(v).toFixed(2).replace('.', ','); }

async function carregarRelatorio() {
  const data = document.getElementById('seletorData').value || hoje();
  const res = await fetch(`/api/relatorios?data=${data}`).then(r => r.json());

  document.getElementById('totalVendas').textContent = fmt(res.totalGeral.total);
  document.getElementById('qtdVendas').textContent = `${res.totalGeral.qtd_vendas} venda(s)`;

  const fp = res.porFormaPagamento;
  const getTotal = (forma) => fmt(fp.find(f => f.forma_pagamento === forma)?.total || 0);
  document.getElementById('totalDinheiro').textContent = getTotal('dinheiro');
  document.getElementById('totalPix').textContent = getTotal('pix');
  document.getElementById('totalCartao').textContent = getTotal('cartao');

  const corpoTop = document.getElementById('corpoTop10');
  if (!res.top10.length) {
    corpoTop.innerHTML = '<tr><td colspan="4" class="text-center" style="color:#aaa">Sem vendas no dia</td></tr>';
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
    corpoOp.innerHTML = '<tr><td colspan="3" class="text-center" style="color:#aaa">Sem vendas no dia</td></tr>';
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

document.getElementById('seletorData').value = hoje();
carregarRelatorio();

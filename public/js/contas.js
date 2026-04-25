let todasContas = [];
let fornecedores = [];

function fmt(v) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarDataBR(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.substring(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function toast(msg, tipo) {
  const t = document.createElement('div');
  t.className = 'toast ' + (tipo || '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

function fecharModal(id) {
  document.getElementById(id).classList.remove('ativo');
}

function badgeStatus(s) {
  const map = {
    pendente: ['badge-pendente', 'Pendente'],
    pago:     ['badge-pago',     'Pago'],
    vencido:  ['badge-vencido',  'Vencido']
  };
  const [cls, label] = map[s] || map.pendente;
  return `<span class="${cls}">${label}</span>`;
}

function badgeTipo(t) {
  return t === 'pagar'
    ? `<span class="badge-vencido">Pagar</span>`
    : `<span class="badge-pago">Receber</span>`;
}

async function init() {
  const [resFornecedores] = await Promise.all([
    fetch('/api/fornecedores'),
    aplicarFiltros(),
    carregarResumo()
  ]);
  fornecedores = (await resFornecedores.json()).filter(f => f.ativo === 1);
  const sel = document.getElementById('cFornecedor');
  while (sel.options.length > 1) sel.remove(1);
  fornecedores.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = f.nome;
    sel.appendChild(opt);
  });
}

async function carregarResumo() {
  try {
    const res = await fetch('/api/contas/resumo');
    const d = await res.json();
    document.getElementById('cardPagar').textContent   = fmt(d.total_pagar);
    document.getElementById('cardVencido').textContent = fmt(d.total_vencido);
    document.getElementById('cardReceber').textContent = fmt(d.total_receber);
    document.getElementById('cardSaldo').textContent   = fmt(d.saldo);
    const box = document.getElementById('cardSaldoBox');
    box.classList.remove('verde-escuro', 'vermelho-escuro');
    box.classList.add(d.saldo >= 0 ? 'verde-escuro' : 'vermelho-escuro');
  } catch (e) {
    console.error(e);
  }
}

async function aplicarFiltros() {
  const tipo         = document.getElementById('filtroTipo').value;
  const status       = document.getElementById('filtroStatus').value;
  const data_inicio  = document.getElementById('filtroDataInicio').value;
  const data_fim     = document.getElementById('filtroDataFim').value;

  const params = new URLSearchParams();
  if (tipo)        params.set('tipo', tipo);
  if (status)      params.set('status', status);
  if (data_inicio) params.set('data_inicio', data_inicio);
  if (data_fim)    params.set('data_fim', data_fim);

  try {
    const res = await fetch('/api/contas?' + params.toString());
    todasContas = await res.json();
    renderTabela(todasContas);
  } catch (e) {
    toast('Erro ao carregar contas', 'erro');
  }
}

function limparFiltros() {
  document.getElementById('filtroTipo').value = '';
  document.getElementById('filtroStatus').value = '';
  document.getElementById('filtroDataInicio').value = '';
  document.getElementById('filtroDataFim').value = '';
  aplicarFiltros();
}

function renderTabela(lista) {
  const tbody = document.getElementById('corpoContas');
  if (!lista.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#aaa;padding:24px">Nenhuma conta encontrada</td></tr>';
    return;
  }
  tbody.innerHTML = lista.map(c => `
    <tr>
      <td><strong>${c.descricao}</strong>${c.observacoes ? `<br><small style="color:#aaa">${c.observacoes}</small>` : ''}</td>
      <td>${badgeTipo(c.tipo)}</td>
      <td><strong>${fmt(c.valor)}</strong></td>
      <td>${formatarDataBR(c.data_vencimento)}</td>
      <td>${formatarDataBR(c.data_pagamento)}</td>
      <td>${badgeStatus(c.status_efetivo)}</td>
      <td style="font-size:13px">${c.fornecedor_nome || '—'}</td>
      <td>
        <button class="btn btn-sm btn-outline" onclick="editarConta(${c.id})" title="Editar">✏️</button>
        ${c.status_efetivo !== 'pago'
          ? `<button class="btn btn-sm btn-pagar" onclick="marcarPago(${c.id})" title="Marcar como pago">✅</button>`
          : ''}
        <button class="btn btn-sm btn-outline" onclick="excluirConta(${c.id})" title="Excluir" style="color:#c62828">🗑️</button>
      </td>
    </tr>
  `).join('');
}

function toggleFornecedor() {
  const tipo = document.getElementById('cTipo').value;
  document.getElementById('campoFornecedor').style.display = tipo === 'pagar' ? '' : 'none';
}

function abrirModalNovo() {
  document.getElementById('cId').value = '';
  document.getElementById('cDescricao').value = '';
  document.getElementById('cTipo').value = '';
  document.getElementById('cValor').value = '';
  document.getElementById('cVencimento').value = '';
  document.getElementById('cFornecedor').value = '';
  document.getElementById('cObs').value = '';
  toggleFornecedor();
  document.getElementById('modalContaTitulo').textContent = 'Nova Conta';
  document.getElementById('modalConta').classList.add('ativo');
  document.getElementById('cDescricao').focus();
}

function editarConta(id) {
  const c = todasContas.find(x => x.id === id);
  if (!c) return;
  document.getElementById('cId').value = c.id;
  document.getElementById('cDescricao').value = c.descricao;
  document.getElementById('cTipo').value = c.tipo;
  document.getElementById('cValor').value = c.valor;
  document.getElementById('cVencimento').value = c.data_vencimento;
  document.getElementById('cFornecedor').value = c.fornecedor_id || '';
  document.getElementById('cObs').value = c.observacoes || '';
  toggleFornecedor();
  document.getElementById('modalContaTitulo').textContent = 'Editar Conta';
  document.getElementById('modalConta').classList.add('ativo');
}

async function salvarConta(e) {
  e.preventDefault();
  const id = document.getElementById('cId').value;
  const payload = {
    descricao:       document.getElementById('cDescricao').value.trim(),
    tipo:            document.getElementById('cTipo').value,
    valor:           parseFloat(document.getElementById('cValor').value),
    data_vencimento: document.getElementById('cVencimento').value,
    fornecedor_id:   document.getElementById('cFornecedor').value || null,
    observacoes:     document.getElementById('cObs').value.trim()
  };
  try {
    const url = id ? `/api/contas/${id}` : '/api/contas';
    const method = id ? 'PUT' : 'POST';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.erro || 'Erro ao salvar');
    toast(id ? 'Conta atualizada!' : 'Conta criada!', 'sucesso');
    fecharModal('modalConta');
    await aplicarFiltros();
    await carregarResumo();
  } catch (err) {
    toast(err.message, 'erro');
  }
}

async function marcarPago(id) {
  if (!confirm('Marcar esta conta como paga?')) return;
  await fetch(`/api/contas/${id}/pagar`, { method: 'PUT' });
  toast('Conta marcada como paga!', 'sucesso');
  await aplicarFiltros();
  await carregarResumo();
}

async function excluirConta(id) {
  if (!confirm('Excluir esta conta permanentemente?')) return;
  await fetch(`/api/contas/${id}`, { method: 'DELETE' });
  toast('Conta excluída', 'sucesso');
  await aplicarFiltros();
  await carregarResumo();
}

document.getElementById('modalConta').addEventListener('click', function(e) {
  if (e.target === this) fecharModal('modalConta');
});

init();

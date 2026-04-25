let todosFornecedores = [];

function fmt(v) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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

async function init() {
  await recarregar();
}

async function recarregar() {
  try {
    const res = await fetch('/api/fornecedores');
    todosFornecedores = await res.json();
    filtrar();
  } catch (e) {
    toast('Erro ao carregar fornecedores', 'erro');
  }
}

function filtrar() {
  const busca = document.getElementById('busca').value.toLowerCase();
  const mostrarInativos = document.getElementById('mostrarInativos').checked;
  const lista = todosFornecedores.filter(f => {
    const matchBusca = !busca
      || f.nome.toLowerCase().includes(busca)
      || (f.cnpj_cpf || '').toLowerCase().includes(busca)
      || (f.telefone || '').includes(busca);
    const matchAtivo = mostrarInativos || f.ativo === 1;
    return matchBusca && matchAtivo;
  });
  renderTabela(lista);
}

function renderTabela(lista) {
  const tbody = document.getElementById('corpoFornecedores');
  if (!lista.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#aaa;padding:24px">Nenhum fornecedor encontrado</td></tr>';
    return;
  }
  tbody.innerHTML = lista.map(f => `
    <tr style="${f.ativo === 0 ? 'opacity:0.55' : ''}">
      <td><strong>${f.nome}</strong></td>
      <td>${f.cnpj_cpf || '—'}</td>
      <td>${f.telefone || '—'}</td>
      <td>${f.email || '—'}</td>
      <td><span class="${f.ativo === 1 ? 'badge-ativo' : 'badge-inativo'}">${f.ativo === 1 ? 'Ativo' : 'Inativo'}</span></td>
      <td>
        <button class="btn btn-sm btn-outline" onclick="editarFornecedor(${f.id})" title="Editar">✏️</button>
        ${f.ativo === 1
          ? `<button class="btn btn-sm btn-outline" onclick="desativarFornecedor(${f.id})" title="Desativar">🚫</button>`
          : `<button class="btn btn-sm btn-outline" onclick="reativarFornecedor(${f.id})" title="Reativar">♻️</button>`
        }
      </td>
    </tr>
  `).join('');
}

function abrirModalNovo() {
  document.getElementById('fId').value = '';
  document.getElementById('fNome').value = '';
  document.getElementById('fCnpj').value = '';
  document.getElementById('fTelefone').value = '';
  document.getElementById('fEmail').value = '';
  document.getElementById('fEndereco').value = '';
  document.getElementById('fObs').value = '';
  document.getElementById('modalTitulo').textContent = 'Novo Fornecedor';
  document.getElementById('modalFornecedor').classList.add('ativo');
  document.getElementById('fNome').focus();
}

function editarFornecedor(id) {
  const f = todosFornecedores.find(x => x.id === id);
  if (!f) return;
  document.getElementById('fId').value = f.id;
  document.getElementById('fNome').value = f.nome;
  document.getElementById('fCnpj').value = f.cnpj_cpf || '';
  document.getElementById('fTelefone').value = f.telefone || '';
  document.getElementById('fEmail').value = f.email || '';
  document.getElementById('fEndereco').value = f.endereco || '';
  document.getElementById('fObs').value = f.observacoes || '';
  document.getElementById('modalTitulo').textContent = 'Editar Fornecedor';
  document.getElementById('modalFornecedor').classList.add('ativo');
}

async function salvarFornecedor(e) {
  e.preventDefault();
  const id = document.getElementById('fId').value;
  const payload = {
    nome:        document.getElementById('fNome').value.trim(),
    cnpj_cpf:    document.getElementById('fCnpj').value.trim(),
    telefone:    document.getElementById('fTelefone').value.trim(),
    email:       document.getElementById('fEmail').value.trim(),
    endereco:    document.getElementById('fEndereco').value.trim(),
    observacoes: document.getElementById('fObs').value.trim()
  };
  try {
    const url = id ? `/api/fornecedores/${id}` : '/api/fornecedores';
    const method = id ? 'PUT' : 'POST';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.erro || 'Erro ao salvar');
    toast(id ? 'Fornecedor atualizado!' : 'Fornecedor criado!', 'sucesso');
    fecharModal('modalFornecedor');
    await recarregar();
  } catch (err) {
    toast(err.message, 'erro');
  }
}

async function desativarFornecedor(id) {
  if (!confirm('Desativar este fornecedor?')) return;
  await fetch(`/api/fornecedores/${id}`, { method: 'DELETE' });
  toast('Fornecedor desativado', 'sucesso');
  await recarregar();
}

async function reativarFornecedor(id) {
  await fetch(`/api/fornecedores/${id}/reativar`, { method: 'PUT' });
  toast('Fornecedor reativado', 'sucesso');
  await recarregar();
}

document.getElementById('modalFornecedor').addEventListener('click', function(e) {
  if (e.target === this) fecharModal('modalFornecedor');
});

init();

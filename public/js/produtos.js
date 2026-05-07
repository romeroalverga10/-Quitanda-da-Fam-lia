let todosProdutos = [];
let categorias = [];
const CATS_VALIDADE = ['Hortifruti', 'Frios e Laticínios'];

async function init() {
  const [prods, cats] = await Promise.all([
    fetch('/api/produtos').then(r => r.json()),
    fetch('/api/produtos/categorias').then(r => r.json())
  ]);
  todosProdutos = prods;
  categorias = cats;

  const selCat = document.getElementById('filtroCategoria');
  const pCat = document.getElementById('pCategoria');
  cats.forEach(c => {
    selCat.innerHTML += `<option value="${c.id}">${c.nome}</option>`;
    pCat.innerHTML += `<option value="${c.id}">${c.nome}</option>`;
  });

  renderTabela(todosProdutos);
}

function filtrar() {
  const busca = document.getElementById('busca').value.toLowerCase();
  const cat = document.getElementById('filtroCategoria').value;
  const filtrados = todosProdutos.filter(p => {
    const matchBusca = p.nome.toLowerCase().includes(busca) || (p.codigo_barras || '').includes(busca);
    const matchCat = !cat || String(p.categoria_id) === String(cat);
    return matchBusca && matchCat;
  });
  renderTabela(filtrados);
}

function renderTabela(lista) {
  const tbody = document.getElementById('corpoProdutos');
  if (!lista.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="text-center" style="color:#aaa;padding:20px">Nenhum produto encontrado.</td></tr>';
    return;
  }
  tbody.innerHTML = lista.map(p => {
    let cls = '';
    if (p.validade_alerta) cls = 'linha-alerta-validade';
    else if (p.estoque_baixo) cls = 'linha-alerta-estoque';
    const valStr = p.data_validade ? formatarDataBR(p.data_validade) : '—';
    const diasStr = p.validade_dias !== null
      ? (p.validade_dias < 0
          ? ' <span style="color:red">(VENCIDO)</span>'
          : p.validade_dias <= 3
            ? ` <span style="color:#f57c00">(${p.validade_dias}d)</span>`
            : '')
      : '';
    const ncmBadge = p.ncm
      ? `<span style="font-size:11px;color:#555">${p.ncm}</span>`
      : `<span style="font-size:11px;background:#fff3e0;color:#e65100;padding:1px 6px;border-radius:4px">Sem NCM</span>`;
    return `
      <tr class="${cls}">
        <td>${p.nome}</td>
        <td>${p.codigo_barras || '—'}</td>
        <td>${p.categoria_nome}</td>
        <td>R$ ${fmt(p.preco)}</td>
        <td>${unidadeLabel(p.unidade)}</td>
        <td>${p.estoque_atual}${p.estoque_baixo ? ' ⚠️' : ''}</td>
        <td>${p.estoque_minimo}</td>
        <td>${valStr}${diasStr}</td>
        <td>${ncmBadge}</td>
        <td>
          <button class="btn btn-verde btn-sm" onclick="editarProduto(${p.id})">✏️</button>
          <button class="btn btn-vermelho btn-sm" onclick="excluirProduto(${p.id})">🗑️</button>
        </td>
      </tr>
    `;
  }).join('');
}

function unidadeLabel(u) {
  return { unidade: 'Unidade', kg: 'Kg', litro: 'Litro', caixa: 'Caixa', duzia: 'Dúzia' }[u] || u;
}

function abrirModalNovo() {
  document.getElementById('modalTitulo').textContent = 'Novo Produto';
  document.getElementById('formProduto').reset();
  document.getElementById('prodId').value = '';
  toggleValidade();
  document.getElementById('modalProduto').classList.add('ativo');
}

function editarProduto(id) {
  const p = todosProdutos.find(x => x.id === id);
  if (!p) return;
  document.getElementById('modalTitulo').textContent = 'Editar Produto';
  document.getElementById('prodId').value = p.id;
  document.getElementById('pNome').value = p.nome;
  document.getElementById('pCodigo').value = p.codigo_barras || '';
  document.getElementById('pCategoria').value = p.categoria_id;
  document.getElementById('pPreco').value = p.preco;
  document.getElementById('pUnidade').value = p.unidade;
  document.getElementById('pEstoqueAtual').value = p.estoque_atual;
  document.getElementById('pEstoqueMin').value = p.estoque_minimo;
  document.getElementById('pValidade').value = p.data_validade || '';
  document.getElementById('pNCM').value = p.ncm || '';
  document.getElementById('pOrigem').value = p.origem || 0;
  toggleValidade();
  document.getElementById('modalProduto').classList.add('ativo');
}

async function salvarProduto(e) {
  if (e && e.preventDefault) e.preventDefault();
  const id = document.getElementById('prodId').value;
  const catId = document.getElementById('pCategoria').value;

  const payload = {
    nome: document.getElementById('pNome').value.trim(),
    codigo_barras: document.getElementById('pCodigo').value || null,
    categoria_id: catId || 1,
    preco: parseFloat(document.getElementById('pPreco').value) || 0,
    unidade: document.getElementById('pUnidade').value || 'unidade',
    estoque_atual: parseFloat(document.getElementById('pEstoqueAtual').value) || 0,
    estoque_minimo: parseFloat(document.getElementById('pEstoqueMin').value) || 0,
    data_validade: document.getElementById('pValidade').value || null,
    ncm: document.getElementById('pNCM').value || null,
    origem: parseInt(document.getElementById('pOrigem').value) || 0,
  };

  if (!payload.nome) { alert('Digite o nome do produto.'); return; }

  const url = id ? `/api/produtos/${id}` : '/api/produtos';
  const method = id ? 'PUT' : 'POST';

  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(r => r.json());
  } catch (err) {
    alert('Erro: ' + err.message);
    return;
  }

  if (res.ok || res.id) {
    toast(id ? 'Produto atualizado!' : 'Produto cadastrado!', 'sucesso');
    fecharModal();
    await recarregar();
  } else {
    alert('Erro ao salvar: ' + (res.erro || JSON.stringify(res)));
  }
}

async function excluirProduto(id) {
  if (!confirm('Excluir este produto?')) return;
  const res = await fetch(`/api/produtos/${id}`, { method: 'DELETE' }).then(r => r.json());
  if (res.desativado) {
    toast(res.msg, 'aviso');
  } else {
    toast('Produto excluído', 'sucesso');
  }
  await recarregar();
}

async function recarregar() {
  todosProdutos = await fetch('/api/produtos').then(r => r.json());
  filtrar();
}

function toggleValidade() {
  document.getElementById('campoValidade').style.display = 'block';
}

function fecharModal() {
  document.getElementById('modalProduto').classList.remove('ativo');
}

function formatarDataBR(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function fmt(v) { return Number(v).toFixed(2).replace('.', ','); }
function toast(msg, tipo) {
  const el = document.createElement('div');
  el.className = 'toast ' + (tipo || '');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

async function abrirModalCategorias() {
  await renderCategorias();
  document.getElementById('novaCatNome').value = '';
  document.getElementById('catErro').style.display = 'none';
  document.getElementById('modalCategorias').classList.add('ativo');
}

async function renderCategorias() {
  const cats = await fetch('/api/produtos/categorias').then(r => r.json());
  const div = document.getElementById('listaCategorias');
  if (!cats.length) { div.innerHTML = '<p style="color:#aaa;font-size:13px">Nenhuma categoria.</p>'; return; }
  div.innerHTML = cats.map(c => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 4px;border-bottom:1px solid #f0f0f0">
      <span style="font-size:14px">${c.nome}</span>
      <button class="btn btn-vermelho btn-sm" onclick="deletarCategoria(${c.id}, '${c.nome.replace(/'/g, "\\'")}')">🗑️</button>
    </div>`).join('');
}

async function criarCategoria() {
  const nome = document.getElementById('novaCatNome').value.trim();
  const erroEl = document.getElementById('catErro');
  if (!nome) { erroEl.textContent = 'Digite um nome.'; erroEl.style.display = 'block'; return; }
  const res = await fetch('/api/produtos/categorias', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome }),
  }).then(r => r.json());
  if (res.ok) {
    document.getElementById('novaCatNome').value = '';
    erroEl.style.display = 'none';
    await renderCategorias();
    await recarregarCategorias();
  } else {
    erroEl.textContent = res.erro || 'Erro ao criar.';
    erroEl.style.display = 'block';
  }
}

async function deletarCategoria(id, nome) {
  if (!confirm(`Excluir a categoria "${nome}"?\n\nSó é possível se não houver produtos nela.`)) return;
  const res = await fetch(`/api/produtos/categorias/${id}`, { method: 'DELETE' }).then(r => r.json());
  if (res.ok) {
    await renderCategorias();
    await recarregarCategorias();
  } else {
    alert(res.erro || 'Erro ao excluir.');
  }
}

async function zerarEstoque() {
  if (!confirm('Zerar o estoque de TODOS os produtos?\n\nEsta ação define estoque_atual = 0 em todos os produtos. Não afeta vendas nem NFC-e.\n\nContinuar?')) return;
  const res = await fetch('/api/produtos/zerar-estoque', { method: 'POST' }).then(r => r.json());
  if (res.ok) {
    toast(`Estoque zerado — ${res.total} produto(s) atualizados.`, 'sucesso');
    await recarregar();
  } else {
    toast('Erro ao zerar estoque.', 'erro');
  }
}

async function recarregarCategorias() {
  const cats = await fetch('/api/produtos/categorias').then(r => r.json());
  categorias = cats;
  const selCat = document.getElementById('filtroCategoria');
  const pCat = document.getElementById('pCategoria');
  selCat.innerHTML = '<option value="">Todas as categorias</option>';
  pCat.innerHTML = '';
  cats.forEach(c => {
    selCat.innerHTML += `<option value="${c.id}">${c.nome}</option>`;
    pCat.innerHTML += `<option value="${c.id}">${c.nome}</option>`;
  });
}

// Fechar modal só com ESC — clique fora não fecha
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    fecharModal();
    document.getElementById('modalCategorias').classList.remove('ativo');
  }
});

// Scanner manda Enter no campo código — impede submeter o form
document.getElementById('pCodigo').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') e.preventDefault();
});

init();

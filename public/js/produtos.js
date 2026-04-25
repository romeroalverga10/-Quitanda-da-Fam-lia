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
    tbody.innerHTML = '<tr><td colspan="9" class="text-center" style="color:#aaa;padding:20px">Nenhum produto encontrado.</td></tr>';
    return;
  }
  tbody.innerHTML = lista.map(p => {
    let cls = '';
    if (p.validade_alerta) cls = 'linha-alerta-validade';
    else if (p.estoque_baixo) cls = 'linha-alerta-estoque';
    const valStr = p.data_validade ? formatarDataBR(p.data_validade) : '—';
    const diasStr = p.validade_dias !== null
      ? (p.validade_dias < 0 ? ' <span style="color:red">(VENCIDO)</span>' : p.validade_dias <= 3 ? ` <span style="color:#f57c00">(${p.validade_dias}d)</span>` : '')
      : '';
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
  toggleValidade();
  document.getElementById('modalProduto').classList.add('ativo');
}

async function salvarProduto(e) {
  e.preventDefault();
  const id = document.getElementById('prodId').value;
  const catId = document.getElementById('pCategoria').value;
  const catNome = categorias.find(c => String(c.id) === String(catId))?.nome || '';

  const payload = {
    nome: document.getElementById('pNome').value,
    codigo_barras: document.getElementById('pCodigo').value || null,
    categoria_id: catId,
    preco: parseFloat(document.getElementById('pPreco').value),
    unidade: document.getElementById('pUnidade').value,
    estoque_atual: parseFloat(document.getElementById('pEstoqueAtual').value) || 0,
    estoque_minimo: parseFloat(document.getElementById('pEstoqueMin').value) || 0,
    data_validade: CATS_VALIDADE.includes(catNome) ? (document.getElementById('pValidade').value || null) : null
  };

  const url = id ? `/api/produtos/${id}` : '/api/produtos';
  const method = id ? 'PUT' : 'POST';
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).then(r => r.json());

  if (res.ok || res.id) {
    toast(id ? 'Produto atualizado!' : 'Produto cadastrado!', 'sucesso');
    fecharModal();
    await recarregar();
  } else {
    toast(res.erro || 'Erro ao salvar', 'erro');
  }
}

async function excluirProduto(id) {
  if (!confirm('Excluir este produto?')) return;
  await fetch(`/api/produtos/${id}`, { method: 'DELETE' });
  toast('Produto excluído', 'sucesso');
  await recarregar();
}

async function recarregar() {
  todosProdutos = await fetch('/api/produtos').then(r => r.json());
  filtrar();
}

function toggleValidade() {
  const catId = document.getElementById('pCategoria').value;
  const catNome = categorias.find(c => String(c.id) === String(catId))?.nome || '';
  const campo = document.getElementById('campoValidade');
  campo.style.display = CATS_VALIDADE.includes(catNome) ? 'block' : 'none';
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

document.getElementById('modalProduto').addEventListener('click', (e) => {
  if (e.target === document.getElementById('modalProduto')) fecharModal();
});

init();

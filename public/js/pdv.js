// ── Dados demo (usados quando a API não está disponível) ────
const PRODUTOS_DEMO = [
  { id: 1, nome: 'Banana Prata',      codigo_barras: '101', categoria_nome: 'Hortifruti',        preco: 4.99,  unidade: 'kg',      estoque_atual: 25 },
  { id: 2, nome: 'Maçã Fuji',         codigo_barras: '102', categoria_nome: 'Hortifruti',        preco: 8.90,  unidade: 'kg',      estoque_atual: 15 },
  { id: 3, nome: 'Tomate',            codigo_barras: '103', categoria_nome: 'Hortifruti',        preco: 6.50,  unidade: 'kg',      estoque_atual: 10 },
  { id: 4, nome: 'Alface',            codigo_barras: '104', categoria_nome: 'Hortifruti',        preco: 2.50,  unidade: 'unidade', estoque_atual: 30 },
  { id: 5, nome: 'Leite Integral 1L', codigo_barras: '105', categoria_nome: 'Frios e Laticínios',preco: 5.99,  unidade: 'unidade', estoque_atual: 20 },
  { id: 6, nome: 'Queijo Mussarela',  codigo_barras: '106', categoria_nome: 'Frios e Laticínios',preco: 45.90, unidade: 'kg',      estoque_atual: 5  },
  { id: 7, nome: 'Arroz Branco 5kg',  codigo_barras: '107', categoria_nome: 'Mercearia',         preco: 28.90, unidade: 'unidade', estoque_atual: 12 },
  { id: 8, nome: 'Feijão Carioca 1kg',codigo_barras: '108', categoria_nome: 'Mercearia',         preco: 9.90,  unidade: 'unidade', estoque_atual: 18 },
  { id: 9, nome: 'Laranja Bahia',     codigo_barras: '109', categoria_nome: 'Hortifruti',        preco: 3.99,  unidade: 'kg',      estoque_atual: 20 },
  { id:10, nome: 'Refrigerante 2L',   codigo_barras: '110', categoria_nome: 'Bebidas',           preco: 8.50,  unidade: 'unidade', estoque_atual: 24 },
];

const VENDAS_DEMO = [
  { id: 42, data_hora: new Date(Date.now() - 3600000).toISOString(),  operador_nome: 'Maria', forma_pagamento: 'dinheiro', total: 35.47, cancelada: false },
  { id: 41, data_hora: new Date(Date.now() - 7200000).toISOString(),  operador_nome: 'João',  forma_pagamento: 'pix',      total: 12.99, cancelada: false },
  { id: 40, data_hora: new Date(Date.now() - 86400000).toISOString(), operador_nome: 'Ana',   forma_pagamento: 'cartao',   total: 87.30, cancelada: true  },
];

// ── Estado ────────────────────────────────────────
let carrinho = [];
let produtoAtual = null;
let indiceEditando = null;
let tabAtiva = 'dinheiro';
let linhaVazia = null;

// ── Inicialização ──────────────────────────────────
async function init() {
  let operador = null;
  try {
    const res = await fetch('/api/operador-atual').then(r => r.json());
    operador = res.operador;
  } catch {}

  if (!operador) {
    const demoNome = localStorage.getItem('demoOperador');
    if (!demoNome) { window.location.href = '/login.html'; return; }
    operador = { nome: demoNome };
  }

  document.getElementById('nomeOperador').textContent = operador.nome;
  document.getElementById('inputBarras').focus();
  verificarAlertas();
  setInterval(verificarAlertas, 60000);
}

// ── Alertas ────────────────────────────────────────
async function verificarAlertas() {
  let data = { estoque: [], validade: [] };
  try {
    const res = await fetch('/api/vendas/alertas');
    if (res.ok) data = await res.json();
  } catch {
    data = {
      estoque: [{ nome: 'Queijo Mussarela', estoque_atual: 2, estoque_minimo: 5 }],
      validade: [{ nome: 'Alface', data_validade: new Date(Date.now() + 86400000).toISOString().substring(0,10), dias: 1 }]
    };
  }
  const total = (data.estoque?.length || 0) + (data.validade?.length || 0);
  const badge = document.getElementById('badgeAlertas');
  if (total > 0) {
    badge.textContent = total;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
  window._alertasData = data;
}

function mostrarAlertas() {
  const d = window._alertasData || {};
  let html = '';
  if (d.estoque?.length) {
    html += '<h3 style="color:#d32f2f;margin-bottom:8px">📦 Estoque Mínimo Atingido</h3>';
    html += '<table><thead><tr><th>Produto</th><th>Estoque</th><th>Mínimo</th></tr></thead><tbody>';
    d.estoque.forEach(p => {
      html += `<tr><td>${p.nome}</td><td>${p.estoque_atual}</td><td>${p.estoque_minimo}</td></tr>`;
    });
    html += '</tbody></table>';
  }
  if (d.validade?.length) {
    html += '<h3 style="color:#f57c00;margin:16px 0 8px">📅 Validade Próxima (≤ 3 dias)</h3>';
    html += '<table><thead><tr><th>Produto</th><th>Validade</th><th>Dias</th></tr></thead><tbody>';
    d.validade.forEach(p => {
      const diasStr = p.dias < 0 ? '<span style="color:red">VENCIDO</span>' : p.dias + ' dia(s)';
      html += `<tr><td>${p.nome}</td><td>${formatarDataBR(p.data_validade)}</td><td>${diasStr}</td></tr>`;
    });
    html += '</tbody></table>';
  }
  if (!html) html = '<p style="color:#aaa;text-align:center;padding:20px">Nenhum alerta no momento.</p>';
  document.getElementById('conteudoAlertas').innerHTML = html;
  abrirModal('modalAlertas');
}

// ── Busca por código de barras ─────────────────────
document.getElementById('inputBarras').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); buscarPorCodigo(); }
});

async function buscarPorCodigo() {
  const codigo = document.getElementById('inputBarras').value.trim();
  if (!codigo) return;

  let produto = null;
  try {
    const res = await fetch(`/api/produtos/barcode/${encodeURIComponent(codigo)}`);
    if (res.ok) produto = await res.json();
  } catch {}

  if (!produto) {
    produto = PRODUTOS_DEMO.find(p =>
      p.codigo_barras === codigo ||
      p.nome.toLowerCase().includes(codigo.toLowerCase())
    ) || null;
  }

  if (!produto) { toast('Produto não encontrado: ' + codigo, 'erro'); limparCampoBarras(); return; }

  produtoAtual = produto;
  mostrarInfoProduto(produto);

  if (produto.unidade === 'kg') {
    abrirModalPesagem(produto);
  } else {
    abrirModalQtdUnit(produto);
  }
}

function mostrarInfoProduto(p) {
  document.getElementById('painelVazio').style.display = 'none';
  document.getElementById('painelProduto').style.display = 'block';
  document.getElementById('prodNome').textContent = p.nome;
  document.getElementById('prodCat').textContent = p.categoria_nome;
  document.getElementById('prodPreco').textContent = 'R$ ' + formatarMoeda(p.preco) + (p.unidade === 'kg' ? '/kg' : '');
  document.getElementById('prodEstoque').textContent = `Estoque: ${p.estoque_atual} ${p.unidade}`;
}

// ── Modal Quantidade Unitária ──────────────────────
function abrirModalQtdUnit(produto) {
  document.getElementById('unitNomeProd').textContent = produto.nome;
  document.getElementById('unitPrecoProd').textContent = 'R$ ' + formatarMoeda(produto.preco) + ' / unidade';
  document.getElementById('inputQtdUnit').value = 1;
  atualizarValorUnit();
  abrirModal('modalQtdUnit');
  setTimeout(() => {
    const input = document.getElementById('inputQtdUnit');
    input.focus();
    input.select();
  }, 100);
}

function atualizarValorUnit() {
  const qtd = parseInt(document.getElementById('inputQtdUnit').value) || 0;
  const el = document.getElementById('valorUnit');
  if (qtd > 0 && produtoAtual) {
    const subtotal = qtd * produtoAtual.preco;
    el.textContent = `${qtd}x × R$ ${formatarMoeda(produtoAtual.preco)} = R$ ${formatarMoeda(subtotal)}`;
  } else {
    el.textContent = '';
  }
}

function confirmarQtdUnit() {
  const qtd = parseInt(document.getElementById('inputQtdUnit').value);
  if (!qtd || qtd < 1) { toast('Quantidade inválida', 'erro'); return; }
  adicionarAoCarrinho(produtoAtual, qtd);
  fecharModal('modalQtdUnit');
  limparCampoBarras();
}

// ── Modal Pesagem ──────────────────────────────────
let _pollBalanca = null;

function abrirModalPesagem(produto) {
  document.getElementById('pesNomeProd').textContent = produto.nome;
  document.getElementById('inputPeso').value = '';
  document.getElementById('valorPesado').classList.add('hidden');
  document.getElementById('statusBalanca').textContent = 'Aguardando peso...';
  abrirModal('modalPesagem');

  document.getElementById('inputPeso').addEventListener('input', atualizarValorPesado);

  iniciarPollBalanca();
}

function iniciarPollBalanca() {
  pararPollBalanca();
  _pollBalanca = setInterval(capturarBalanca, 800);
  capturarBalanca();
}

function pararPollBalanca() {
  if (_pollBalanca) { clearInterval(_pollBalanca); _pollBalanca = null; }
}

function atualizarValorPesado() {
  const peso = parseFloat(document.getElementById('inputPeso').value) || 0;
  const el = document.getElementById('valorPesado');
  if (peso > 0 && produtoAtual) {
    const valor = peso * produtoAtual.preco;
    el.textContent = `${peso.toFixed(3)} kg × R$ ${formatarMoeda(produtoAtual.preco)} = R$ ${formatarMoeda(valor)}`;
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
}

async function capturarBalanca() {
  const status = document.getElementById('statusBalanca');
  try {
    const res = await fetch('/api/balanca/peso').then(r => r.json());
    if (res.ok && res.peso > 0) {
      document.getElementById('inputPeso').value = res.peso.toFixed(3);
      atualizarValorPesado();
      status.textContent = `Peso: ${res.peso.toFixed(3)} kg`;
    } else if (res.ok && res.peso === 0) {
      status.textContent = 'Aguardando peso...';
    } else {
      status.textContent = 'Erro: ' + res.erro;
    }
  } catch {
    status.textContent = 'Balança não disponível — digite o peso manualmente';
  }
}

function confirmarPesagem() {
  const peso = parseFloat(document.getElementById('inputPeso').value);
  if (!peso || peso <= 0) { toast('Informe o peso', 'erro'); return; }
  pararPollBalanca();
  adicionarAoCarrinho(produtoAtual, peso);
  fecharModal('modalPesagem');
  limparCampoBarras();
}

// ── Carrinho ───────────────────────────────────────
function adicionarAoCarrinho(produto, quantidade) {
  const existente = produto.unidade !== 'kg'
    ? carrinho.findIndex(i => i.produto_id === produto.id)
    : -1;

  if (existente >= 0) {
    carrinho[existente].quantidade += quantidade;
    carrinho[existente].subtotal = carrinho[existente].quantidade * carrinho[existente].preco_unitario;
  } else {
    carrinho.push({
      produto_id: produto.id,
      nome: produto.nome,
      unidade: produto.unidade,
      quantidade,
      preco_unitario: produto.preco,
      subtotal: quantidade * produto.preco
    });
  }
  renderCarrinho();
  toast(`${produto.nome} adicionado`, 'sucesso');
}

function corIcone(nome) {
  const cores = ['#E74C3C','#E67E22','#F39C12','#27AE60','#2980B9','#8E44AD','#16A085','#C0392B','#D35400','#1ABC9C'];
  let hash = 0;
  for (const c of nome) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return cores[hash % cores.length];
}

function renderCarrinho() {
  const corpo = document.getElementById('corpoCarrinho');
  if (!linhaVazia) linhaVazia = document.getElementById('linhaVazia');

  if (carrinho.length === 0) {
    corpo.innerHTML = '';
    corpo.appendChild(linhaVazia);
    linhaVazia.style.display = '';
    document.getElementById('totalVenda').textContent = '0,00';
    document.getElementById('qtdItens').textContent = '0 produtos';
    document.getElementById('resumoSubtotal').textContent = 'R$ 0,00';
    document.getElementById('resumoUltimo').textContent = 'R$ 0,00';
    document.getElementById('btnFinalizar').disabled = true;
    return;
  }

  if (linhaVazia.parentNode) linhaVazia.style.display = 'none';
  corpo.innerHTML = '';

  carrinho.forEach((item, idx) => {
    const qtdStr = item.unidade === 'kg'
      ? `${item.quantidade.toFixed(3)} kg`
      : `${item.quantidade}x`;
    const div = document.createElement('div');
    div.className = 'item-carrinho';
    div.innerHTML = `
      <div class="item-icone" style="background:${corIcone(item.nome)}">${item.nome.charAt(0).toUpperCase()}</div>
      <div class="item-info">
        <div class="item-nome">${item.nome}</div>
        <div class="item-desc" onclick="editarQtd(${idx})" title="Clique para editar quantidade">${qtdStr} × R$ ${formatarMoeda(item.preco_unitario)}</div>
      </div>
      <div class="item-preco">R$ ${formatarMoeda(item.subtotal)}</div>
      <div class="item-acoes">
        <button class="btn-item-dec" onclick="decrementarItem(${idx})" title="Diminuir">−</button>
        <button class="btn-item-rem" onclick="removerItem(${idx})" title="Remover">✕</button>
      </div>
    `;
    corpo.appendChild(div);
  });

  const total = carrinho.reduce((s, i) => s + i.subtotal, 0);
  const qtdTotal = carrinho.reduce((s, i) => s + (i.unidade === 'kg' ? 1 : i.quantidade), 0);
  document.getElementById('totalVenda').textContent = formatarMoeda(total);
  document.getElementById('qtdItens').textContent = qtdTotal + (qtdTotal === 1 ? ' produto' : ' produtos');
  document.getElementById('resumoSubtotal').textContent = 'R$ ' + formatarMoeda(total);
  document.getElementById('resumoUltimo').textContent = 'R$ ' + formatarMoeda(carrinho[carrinho.length - 1].subtotal);
  document.getElementById('btnFinalizar').disabled = false;
}

function removerItem(idx) {
  carrinho.splice(idx, 1);
  renderCarrinho();
}

function decrementarItem(idx) {
  const item = carrinho[idx];
  if (item.unidade === 'kg') { toast('Para kg, use ✕ e adicione novamente', 'erro'); return; }
  if (item.quantidade <= 1) { removerItem(idx); return; }
  item.quantidade -= 1;
  item.subtotal = item.quantidade * item.preco_unitario;
  renderCarrinho();
}

async function abrirCancelarVenda() {
  abrirModal('modalCancelarVenda');
  const div = document.getElementById('listaVendasRecentes');
  div.innerHTML = '<div style="text-align:center;padding:20px;color:#aaa">Carregando...</div>';

  let vendas = VENDAS_DEMO;
  try {
    const res = await fetch('/api/vendas/recentes');
    if (res.ok) vendas = await res.json();
  } catch {}

  if (!vendas.length) { div.innerHTML = '<p style="text-align:center;color:#aaa">Nenhuma venda encontrada.</p>'; return; }
  div.innerHTML = `
    <table>
      <thead><tr><th>#</th><th>Data/Hora</th><th>Operador</th><th>Pagamento</th><th>Total</th><th></th></tr></thead>
      <tbody>
        ${vendas.map(v => `
          <tr style="${v.cancelada ? 'opacity:0.4;text-decoration:line-through' : ''}">
            <td>#${v.id}</td>
            <td style="font-size:12px">${new Date(v.data_hora).toLocaleString('pt-BR')}</td>
            <td>${v.operador_nome}</td>
            <td>${v.forma_pagamento}</td>
            <td>R$ ${Number(v.total).toFixed(2).replace('.', ',')}</td>
            <td>${v.cancelada ? '<span style="color:#aaa;font-size:12px">Cancelada</span>' : `<button class="btn btn-vermelho btn-sm" onclick="confirmarCancelamento(${v.id})">Cancelar</button>`}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function confirmarCancelamento(id) {
  if (!confirm(`Cancelar venda #${id}? O estoque será restaurado.`)) return;
  try {
    const res = await fetch(`/api/vendas/${id}`, { method: 'DELETE' }).then(r => r.json());
    if (res.ok) {
      toast(`Venda #${id} cancelada. Estoque restaurado.`, 'sucesso');
      abrirCancelarVenda();
      return;
    }
  } catch {}
  toast(`Venda #${id} cancelada (demo).`, 'sucesso');
  fecharModal('modalCancelarVenda');
}

function cancelarVenda() {
  if (carrinho.length === 0 || confirm('Cancelar a venda atual?')) {
    carrinho = [];
    produtoAtual = null;
    renderCarrinho();
    document.getElementById('painelProduto').style.display = 'none';
    document.getElementById('painelVazio').style.display = 'block';
  }
}

// ── Editar quantidade ──────────────────────────────
function editarQtd(idx) {
  if (carrinho[idx].unidade === 'kg') { toast('Para kg, remova e leia novamente', 'erro'); return; }
  indiceEditando = idx;
  document.getElementById('qtdNomeProd').textContent = carrinho[idx].nome;
  document.getElementById('inputNovaQtd').value = carrinho[idx].quantidade;
  abrirModal('modalQtd');
}

function confirmarQtd() {
  const novaQtd = parseInt(document.getElementById('inputNovaQtd').value);
  if (!novaQtd || novaQtd < 1) { toast('Quantidade inválida', 'erro'); return; }
  carrinho[indiceEditando].quantidade = novaQtd;
  carrinho[indiceEditando].subtotal = novaQtd * carrinho[indiceEditando].preco_unitario;
  fecharModal('modalQtd');
  renderCarrinho();
}

// ── Pagamento ──────────────────────────────────────
function abrirPagamento() {
  const total = carrinho.reduce((s, i) => s + i.subtotal, 0);
  document.getElementById('pagTotal').textContent = formatarMoeda(total);
  document.getElementById('inputRecebido').value = '';
  document.getElementById('displayTroco').classList.add('hidden');
  ativarTab('dinheiro');
  abrirModal('modalPagamento');
}

function ativarTab(tab) {
  tabAtiva = tab;
  ['dinheiro', 'pix', 'cartao'].forEach(t => {
    document.getElementById('tab-' + t).classList.toggle('ativo', t === tab);
    document.getElementById('content-' + t).classList.toggle('ativo', t === tab);
  });
  if (tab === 'pix') carregarQRCode();
}

function calcularTroco() {
  const total = carrinho.reduce((s, i) => s + i.subtotal, 0);
  const recebido = parseFloat(document.getElementById('inputRecebido').value) || 0;
  const el = document.getElementById('displayTroco');
  if (recebido > 0) {
    const troco = recebido - total;
    el.textContent = troco >= 0 ? `Troco: R$ ${formatarMoeda(troco)}` : `Falta: R$ ${formatarMoeda(Math.abs(troco))}`;
    el.className = 'troco-display' + (troco < 0 ? ' troco-negativo' : '');
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
}

async function carregarQRCode() {
  const total = carrinho.reduce((s, i) => s + i.subtotal, 0);
  const wrap = document.getElementById('qrcodeWrap');
  wrap.innerHTML = '<div class="spinner"></div>';
  try {
    const res = await fetch(`/api/pix/qrcode?valor=${total.toFixed(2)}`).then(r => r.json());
    if (res.ok) {
      wrap.innerHTML = `
        <img src="${res.dataUrl}" alt="QR Code PIX">
        <div class="chave-pix">Chave PIX: ${res.chave}</div>
        <div style="font-size:13px;margin-top:4px">Valor: R$ ${formatarMoeda(res.valor)}</div>
      `;
      return;
    }
  } catch {}
  // Demo: QR Code gerado via serviço público
  const valor = total.toFixed(2).replace('.', ',');
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=PIX%3AquitandadafamiliaR%24${total.toFixed(2)}`;
  wrap.innerHTML = `
    <img src="${qrUrl}" alt="QR Code PIX Demo" style="border-radius:8px">
    <div class="chave-pix">Chave PIX: quitanda@familia.com</div>
    <div style="font-size:13px;margin-top:4px">Valor: R$ ${valor}</div>
    <div style="font-size:11px;color:#aaa;margin-top:4px">(modo demonstração)</div>
  `;
}

async function confirmarPagamento() {
  const total = carrinho.reduce((s, i) => s + i.subtotal, 0);
  const btn = document.getElementById('btnConfirmarPag');

  if (tabAtiva === 'dinheiro') {
    const recebido = parseFloat(document.getElementById('inputRecebido').value) || 0;
    if (recebido < total) { toast('Valor recebido menor que o total', 'erro'); return; }
  }

  btn.disabled = true;
  btn.textContent = 'Processando...';

  let payload = { itens: carrinho, forma_pagamento: tabAtiva, total };
  if (tabAtiva === 'dinheiro') payload.valor_recebido = parseFloat(document.getElementById('inputRecebido').value);
  if (tabAtiva === 'cartao') {
    payload.tipo_cartao = document.querySelector('input[name="tipoCartao"]:checked').value;
    payload.bandeira = document.getElementById('selBandeira').value;
  }

  let sucesso = false;
  try {
    const res = await fetch('/api/vendas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(r => r.json());

    if (res.ok) {
      sucesso = true;
      await fetch('/api/imprimir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(res.venda)
      }).catch(() => {});
    }
  } catch {}

  // Demo: simula sucesso mesmo sem API
  toast('Venda finalizada com sucesso!', 'sucesso');
  fecharModal('modalPagamento');
  carrinho = [];
  produtoAtual = null;
  renderCarrinho();
  document.getElementById('painelProduto').style.display = 'none';
  document.getElementById('painelVazio').style.display = 'block';
  btn.disabled = false;
  btn.textContent = '✅ Confirmar Venda';
  verificarAlertas();
}

// ── Trocar operador ────────────────────────────────
async function trocarOperador() {
  try { await fetch('/api/logout', { method: 'POST' }); } catch {}
  localStorage.removeItem('demoOperador');
  window.location.href = '/login.html';
}

// ── Utilitários ────────────────────────────────────
function abrirModal(id) {
  document.getElementById(id).classList.add('ativo');
}
function fecharModal(id) {
  document.getElementById(id).classList.remove('ativo');
  if (id !== 'modalAlertas' && id !== 'modalQtd') {
    setTimeout(() => document.getElementById('inputBarras').focus(), 100);
  }
}
function limparCampoBarras() {
  document.getElementById('inputBarras').value = '';
  document.getElementById('inputBarras').focus();
}
function formatarMoeda(v) {
  return Number(v).toFixed(2).replace('.', ',');
}
function formatarDataBR(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function toast(msg, tipo) {
  const el = document.createElement('div');
  el.className = 'toast ' + (tipo || '');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) fecharModal(overlay.id);
  });
});

document.addEventListener('keydown', (e) => {
  const modalAberto = document.querySelector('.modal-overlay.ativo');
  if (modalAberto) return;
  const tag = document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  const input = document.getElementById('inputBarras');
  input.focus();
});

init();

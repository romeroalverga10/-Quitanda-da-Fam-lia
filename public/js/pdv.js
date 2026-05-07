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
let cpfCliente = null;
let produtoAtual = null;
let indiceEditando = null;
let tabAtiva = 'dinheiro';
let linhaVazia = null;
let perfilAtual = 'operador';
let _idxCancelar = null;

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

  const perfil = operador.perfil || localStorage.getItem('perfil') || 'operador';
  perfilAtual = perfil;
  if (perfil !== 'admin') {
    document.querySelectorAll('.btn-admin-only').forEach(el => el.style.display = 'none');
  }

  const carrinhoSalvo = localStorage.getItem('pdv_carrinho');
  if (carrinhoSalvo) {
    try {
      carrinho = JSON.parse(carrinhoSalvo);
      if (carrinho.length > 0) renderCarrinho();
    } catch { carrinho = []; }
  }

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

// ── Scanner de código de barras ────────────────────
let _timerBarras = null;
let _buscando = false;
let _scanBuf = '';
let _scanT = 0;

// Captura global: redireciona scanner para inputBarras mesmo com modal aberto
document.addEventListener('keydown', (e) => {
  const now = Date.now();
  const rapido = (now - _scanT) < 60;
  _scanT = now;

  if (e.key === 'Enter') {
    // Deixa o Enter ser tratado pelo próprio campo quando foco está em modal
    const modalInputs = ['inputQtdUnit', 'inputNovaQtd', 'inputPeso'];
    if (modalInputs.includes(document.activeElement?.id)) return;

    const inp = document.getElementById('inputBarras');
    // Usa o valor do campo ou o buffer do scanner, o que tiver conteúdo
    const valorCampo = inp.value.trim();
    const codigo = _scanBuf.length >= 3 ? _scanBuf : (valorCampo || _scanBuf);

    if (codigo.length >= 1) {
      const modalAberto = document.querySelector('.modal-overlay.ativo');
      if (modalAberto && modalAberto.id === 'modalAutorizarCancel') {
        document.getElementById('inputCodigoAdmin').value = codigo;
        _scanBuf = '';
        e.preventDefault();
        verificarAdminECancelar();
        return;
      }
      if (modalAberto && modalAberto.id === 'modalAutorizarSessao') {
        document.getElementById('inputCodigoAdminSessao').value = codigo;
        _scanBuf = '';
        e.preventDefault();
        verificarAdminESessao();
        return;
      }
      if (modalAberto && !['modalPagamento', 'modalAlertas'].includes(modalAberto.id)) {
        if (modalAberto.id === 'modalPesagem') pararPollBalanca();
        fecharModal(modalAberto.id);
      }
      clearTimeout(_timerBarras);
      inp.value = codigo;
      _scanBuf = '';
      e.preventDefault();
      buscarPorCodigo();
    } else {
      _scanBuf = '';
    }
    return;
  }

  if (e.key.length === 1) {
    _scanBuf = rapido ? _scanBuf + e.key : e.key;
  }
}, true);

// Scanner sem Enter: fallback apenas para input muito rápido (> 4 chars em < 150ms)
document.getElementById('inputBarras').addEventListener('input', () => {
  clearTimeout(_timerBarras);
  const v = document.getElementById('inputBarras').value.trim();
  const agora = Date.now();
  const foidigitacaoRapida = (agora - _scanT) < 150 && v.length >= 6;
  if (foidigitacaoRapida) _timerBarras = setTimeout(() => { _scanBuf = ''; buscarPorCodigo(); }, 80);
});

async function buscarPorCodigo() {
  if (_buscando) return;
  const codigo = document.getElementById('inputBarras').value.trim();
  if (!codigo) return;
  _buscando = true;
  try {
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

    if (!produto) { abrirCadastroProduto(codigo); limparCampoBarras(); return; }

    produtoAtual = produto;
    mostrarInfoProduto(produto);
    if (produto.unidade === 'kg') {
      abrirModalPesagem(produto);
    } else {
      abrirModalQtdUnit(produto);
    }
  } finally {
    _buscando = false;
  }
}

async function abrirCadastroProduto(codigoBarras) {
  // Carrega categorias no select se ainda não carregadas
  const sel = document.getElementById('cpCategoria');
  if (!sel.options.length) {
    try {
      const cats = await fetch('/api/produtos/categorias').then(r => r.json());
      sel.innerHTML = cats.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
    } catch {}
  }
  document.getElementById('cpNome').value = '';
  document.getElementById('cpCodigo').value = codigoBarras || '';
  document.getElementById('cpPreco').value = '0';
  document.getElementById('cpUnidade').value = 'unidade';
  document.getElementById('cpErro').style.display = 'none';
  document.getElementById('modalCadastroProduto').classList.add('ativo');
  setTimeout(() => document.getElementById('cpNome').focus(), 100);
}

async function salvarProdutoRapido() {
  const nome  = document.getElementById('cpNome').value.trim();
  const preco = parseFloat(document.getElementById('cpPreco').value) || 0;
  const erroEl = document.getElementById('cpErro');

  if (!nome) { erroEl.textContent = 'Digite o nome do produto.'; erroEl.style.display = 'block'; return; }
  if (preco <= 0) { erroEl.textContent = 'Informe um preço maior que zero.'; erroEl.style.display = 'block'; return; }
  erroEl.style.display = 'none';

  const payload = {
    nome,
    codigo_barras: document.getElementById('cpCodigo').value || null,
    categoria_id:  parseInt(document.getElementById('cpCategoria').value) || 1,
    preco,
    unidade:       document.getElementById('cpUnidade').value,
    estoque_atual: 0,
    estoque_minimo: 0,
  };

  try {
    const res = await fetch('/api/produtos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(r => r.json());

    if (!res.ok && !res.id) {
      erroEl.textContent = res.erro || 'Erro ao salvar produto.';
      erroEl.style.display = 'block';
      return;
    }

    fecharModal('modalCadastroProduto');

    // Busca o produto recém-criado e adiciona ao carrinho
    const produto = await fetch(`/api/produtos/barcode/${encodeURIComponent(payload.codigo_barras || String(res.id))}`).then(r => r.ok ? r.json() : null)
      || { id: res.id, nome, preco, unidade: payload.unidade, categoria_nome: '', estoque_atual: 0, codigo_barras: payload.codigo_barras };

    produtoAtual = produto;
    mostrarInfoProduto(produto);
    if (produto.unidade === 'kg') {
      abrirModalPesagem(produto);
    } else {
      abrirModalQtdUnit(produto);
    }
  } catch (err) {
    erroEl.textContent = 'Erro: ' + err.message;
    erroEl.style.display = 'block';
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
    input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); confirmarQtdUnit(); } };
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

  const elPeso = document.getElementById('inputPeso');
  elPeso.removeEventListener('input', atualizarValorPesado);
  elPeso.addEventListener('input', atualizarValorPesado);

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
  const cores = ['#E74C3C','#E67E22','#F39C12','#E8816D','#2980B9','#8E44AD','#16A085','#E8816D','#D35400','#1ABC9C'];
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
    document.getElementById('btnCpf').disabled = true;
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
        <button class="btn-item-rem" onclick="pedirAutorizacaoCancelar(${idx})" title="Remover">✕</button>
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
  document.getElementById('btnCpf').disabled = false;
  localStorage.setItem('pdv_carrinho', JSON.stringify(carrinho));
}

function _removerUmaUnidade(idx) {
  const item = carrinho[idx];
  if (item.unidade === 'kg' || item.quantidade <= 1) {
    carrinho.splice(idx, 1);
  } else {
    item.quantidade -= 1;
    item.subtotal = item.quantidade * item.preco_unitario;
  }
  renderCarrinho();
}

function pedirAutorizacaoCancelar(idx) {
  if (perfilAtual === 'admin') {
    _removerUmaUnidade(idx);
    return;
  }
  _idxCancelar = idx;
  document.getElementById('cancelItemNome').textContent = carrinho[idx].nome;
  document.getElementById('inputCodigoAdmin').value = '';
  document.getElementById('cancelErro').textContent = '';
  abrirModal('modalAutorizarCancel');
  setTimeout(() => document.getElementById('inputCodigoAdmin').focus(), 100);
}

async function verificarAdminECancelar() {
  const codigo = document.getElementById('inputCodigoAdmin').value.trim();
  if (!codigo) { document.getElementById('cancelErro').textContent = 'Escaneie ou digite o código do administrador.'; return; }

  const res = await fetch('/api/operadores/verificar-admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codigo })
  }).then(r => r.json()).catch(() => ({ ok: false }));

  if (!res.ok) {
    document.getElementById('cancelErro').textContent = '❌ Código inválido ou não é administrador.';
    document.getElementById('inputCodigoAdmin').value = '';
    document.getElementById('inputCodigoAdmin').focus();
    return;
  }

  fecharModal('modalAutorizarCancel');
  _removerUmaUnidade(_idxCancelar);
  _idxCancelar = null;
  toast(`Cancelamento autorizado por ${res.nome}`, 'sucesso');
}

function removerItem(idx) {
  carrinho.splice(idx, 1);
  renderCarrinho();
}

function decrementarItem(idx) {
  const item = carrinho[idx];
  if (item.unidade === 'kg') { toast('Para kg, use ✕ e adicione novamente', 'erro'); return; }
  if (perfilAtual === 'admin') {
    _removerUmaUnidade(idx);
    return;
  }
  _idxCancelar = idx;
  document.getElementById('cancelItemNome').textContent = carrinho[idx].nome;
  document.getElementById('inputCodigoAdmin').value = '';
  document.getElementById('cancelErro').textContent = '';
  abrirModal('modalAutorizarCancel');
  setTimeout(() => document.getElementById('inputCodigoAdmin').focus(), 100);
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

async function abrirReimprimirCupom() {
  abrirModal('modalReimprimir');
  const div = document.getElementById('listaVendasReimprimir');
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
          <tr style="${v.cancelada ? 'opacity:0.4' : ''}">
            <td>#${v.id}</td>
            <td style="font-size:12px">${new Date(v.data_hora).toLocaleString('pt-BR')}</td>
            <td>${v.operador_nome}</td>
            <td>${v.forma_pagamento}</td>
            <td>R$ ${Number(v.total).toFixed(2).replace('.', ',')}</td>
            <td><button class="btn btn-verde btn-sm" onclick="reimprimirCupom(${v.id}, this)">🖨️ Imprimir</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function reimprimirCupom(id, btn) {
  btn.disabled = true;
  btn.textContent = '...';
  try {
    const res = await fetch(`/api/vendas/${id}/reimprimir`, { method: 'POST' }).then(r => r.json());
    if (res.ok) {
      toast(`Cupom #${id} enviado para impressora!`, 'sucesso');
    } else {
      toast('Erro ao imprimir: ' + (res.erro || 'falha'), 'erro');
    }
  } catch {
    toast('Impressora não disponível', 'erro');
  }
  btn.disabled = false;
  btn.textContent = '🖨️ Imprimir';
}

function cancelarVenda() {
  if (carrinho.length === 0 || confirm('Cancelar a venda atual?')) {
    carrinho = [];
    localStorage.removeItem('pdv_carrinho');
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
let _pagamentos = []; // [{metodo, valor, bandeira}]

const LABEL_PAG = { dinheiro: '💵 Dinheiro', debito: '💳 Débito', credito: '💳 Crédito', pix: '📱 PIX' };
const BANDEIRAS = ['Visa', 'Mastercard', 'Elo', 'Hipercard', 'American Express', 'Outro'];

function abrirPagamento() {
  const total = carrinho.reduce((s, i) => s + i.subtotal, 0);
  document.getElementById('pagTotal').textContent = formatarMoeda(total);
  _pagamentos = [];
  renderPagamentos();
  document.getElementById('pixWrap').style.display = 'none';
  document.getElementById('btnConfirmarPag').disabled = true;
  abrirModal('modalPagamento');
}

function adicionarPagamento(metodo) {
  const total = carrinho.reduce((s, i) => s + i.subtotal, 0);
  const pago = _pagamentos.reduce((s, p) => s + p.valor, 0);
  const restante = Math.max(0, parseFloat((total - pago).toFixed(2)));
  _pagamentos.push({ metodo, valor: restante > 0 ? restante : 0, bandeira: '' });
  renderPagamentos();
  if (metodo === 'pix') atualizarPixQR();
}

function removerPagamento(idx) {
  _pagamentos.splice(idx, 1);
  renderPagamentos();
  atualizarPixQR();
}

function renderPagamentos() {
  const lista = document.getElementById('listaPagamentos');
  if (!_pagamentos.length) {
    lista.innerHTML = '<div style="text-align:center;color:#aaa;padding:16px;font-size:13px">Selecione uma forma de pagamento acima</div>';
    document.getElementById('resumoPagamento').innerHTML = '';
    document.getElementById('btnConfirmarPag').disabled = true;
    return;
  }

  lista.innerHTML = _pagamentos.map((p, i) => {
    const bandeiraOpts = p.metodo === 'debito' || p.metodo === 'credito'
      ? `<select onchange="_pagamentos[${i}].bandeira=this.value;renderPagamentos()" style="margin-top:4px;font-size:12px;padding:2px 4px;border:1px solid #ccc;border-radius:4px">
           <option value="">Bandeira (opcional)</option>
           ${BANDEIRAS.map(b => `<option${p.bandeira===b?' selected':''}>${b}</option>`).join('')}
         </select>` : '';
    return `
      <div style="display:flex;align-items:center;gap:8px;background:#f9f9f9;border:1px solid #e0e0e0;border-radius:6px;padding:8px 10px;margin-bottom:6px">
        <div style="flex:1">
          <div style="font-weight:bold;font-size:13px">${LABEL_PAG[p.metodo]}</div>
          ${bandeiraOpts}
        </div>
        <div>
          <div style="font-size:11px;color:#888;margin-bottom:2px">Valor (R$)</div>
          <input type="number" step="0.01" min="0" value="${p.valor.toFixed(2)}"
            style="width:90px;text-align:right;font-size:15px;font-weight:bold;border:1px solid #ccc;border-radius:4px;padding:2px 4px"
            oninput="_pagamentos[${i}].valor=parseFloat(this.value)||0;atualizarResumo();if(_pagamentos[${i}].metodo==='pix')atualizarPixQR()">
        </div>
        <button class="btn btn-vermelho btn-sm" onclick="removerPagamento(${i})" style="padding:4px 8px;font-size:16px;line-height:1">✕</button>
      </div>`;
  }).join('');

  atualizarResumo();
}

function atualizarResumo() {
  const total = carrinho.reduce((s, i) => s + i.subtotal, 0);
  const pago  = _pagamentos.reduce((s, p) => s + p.valor, 0);
  const diff  = parseFloat((pago - total).toFixed(2));
  const el    = document.getElementById('resumoPagamento');
  const btn   = document.getElementById('btnConfirmarPag');

  if (diff < -0.01) {
    el.innerHTML = `<span style="color:#e65100;font-weight:bold">Faltam: R$ ${formatarMoeda(-diff)}</span>`;
    btn.disabled = true;
  } else if (diff > 0.01) {
    el.innerHTML = `<span style="color:#E8816D;font-weight:bold">✅ Pago — Troco: R$ ${formatarMoeda(diff)}</span>`;
    btn.disabled = false;
  } else {
    el.innerHTML = `<span style="color:#E8816D;font-weight:bold">✅ Pagamento completo</span>`;
    btn.disabled = false;
  }
}

async function atualizarPixQR() {
  const pixEntry = _pagamentos.find(p => p.metodo === 'pix');
  const wrap = document.getElementById('pixWrap');
  if (!pixEntry || pixEntry.valor <= 0) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  wrap.innerHTML = '<div class="spinner"></div>';
  const valor = pixEntry.valor;
  try {
    const res = await fetch(`/api/pix/qrcode?valor=${valor.toFixed(2)}`).then(r => r.json());
    if (res.ok) {
      wrap.innerHTML = `<img src="${res.dataUrl}" alt="QR PIX"><div class="chave-pix">Chave: ${res.chave}</div><div style="font-size:13px;margin-top:4px">Valor: R$ ${formatarMoeda(valor)}</div>`;
      return;
    }
  } catch {}
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=PIX:R$${valor.toFixed(2)}`;
  wrap.innerHTML = `<img src="${qrUrl}" style="border-radius:8px"><div class="chave-pix">Valor PIX: R$ ${formatarMoeda(valor)}</div>`;
}

async function confirmarPagamento() {
  const total = carrinho.reduce((s, i) => s + i.subtotal, 0);
  const pago  = _pagamentos.reduce((s, p) => s + p.valor, 0);
  if (!_pagamentos.length) { toast('Adicione uma forma de pagamento', 'erro'); return; }
  if (pago < total - 0.01) { toast('Valor pago insuficiente', 'erro'); return; }

  const btn = document.getElementById('btnConfirmarPag');
  btn.disabled = true;
  btn.textContent = 'Processando...';

  const metodos = [...new Set(_pagamentos.map(p => p.metodo))];
  const forma = metodos.length === 1 ? metodos[0] : metodos.join('+');
  const dinheiroTotal = _pagamentos.filter(p => p.metodo === 'dinheiro').reduce((s, p) => s + p.valor, 0);
  const cartao = _pagamentos.find(p => p.metodo === 'debito' || p.metodo === 'credito');

  let payload = {
    itens: carrinho,
    forma_pagamento: forma,
    total,
    valor_recebido: dinheiroTotal || null,
    valor_dinheiro: dinheiroTotal || null,
    troco: Math.max(0, parseFloat((pago - total).toFixed(2))),
    tipo_cartao: cartao ? cartao.metodo : null,
    bandeira: cartao ? cartao.bandeira : null,
    pagamentos: _pagamentos,
    cpf_cliente: cpfCliente || null,
  };

  let sucesso = false;
  try {
    const res = await fetch('/api/vendas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(r => r.json());

    if (res.ok) {
      sucesso = true;
      const printRes = await fetch('/api/imprimir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(res.venda)
      }).then(r => r.json()).catch(() => null);
      if (!printRes || !printRes.ok) {
        toast('Erro ao imprimir: ' + (printRes?.erro || 'impressora não disponível'), 'erro');
      }
    } else {
      toast(res.erro || 'Erro ao registrar venda', 'erro');
    }
  } catch (e) {
    toast('Erro de conexão ao registrar venda', 'erro');
  }

  if (!sucesso) {
    btn.disabled = false;
    btn.textContent = '✅ Confirmar Venda';
    return;
  }

  toast('Venda finalizada com sucesso!', 'sucesso');
  fecharModal('modalPagamento');
  carrinho = [];
  cpfCliente = null;
  localStorage.removeItem('pdv_carrinho');
  produtoAtual = null;
  renderCarrinho();
  document.getElementById('painelProduto').style.display = 'none';
  document.getElementById('painelVazio').style.display = 'block';
  btn.disabled = false;
  btn.textContent = '✅ Confirmar Venda';
  verificarAlertas();
}

// ── CPF na Nota ────────────────────────────────────
function pedirCpf() {
  const atual = cpfCliente ? cpfCliente : '';
  const entrada = prompt('CPF do cliente (somente números):', atual);
  if (entrada === null) return; // cancelou
  const cpf = entrada.replace(/\D/g, '');
  if (cpf === '') {
    cpfCliente = null;
    document.getElementById('btnCpf').textContent = 'CPF na Nota';
    document.getElementById('btnCpf').style.background = '#555';
    toast('CPF removido', 'info');
    return;
  }
  if (cpf.length !== 11) { toast('CPF inválido — informe 11 dígitos', 'erro'); return; }
  cpfCliente = cpf;
  document.getElementById('btnCpf').textContent = 'CPF: ' + cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  document.getElementById('btnCpf').style.background = '#2a7a3b';
  toast('CPF incluído na nota', 'sucesso');
}

// ── Menu operador ──────────────────────────────────
function toggleMenuOperador() {
  const menu = document.getElementById('menuOperador');
  menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

document.addEventListener('click', (e) => {
  const wrap = document.getElementById('menuOperadorWrap');
  if (wrap && !wrap.contains(e.target)) {
    document.getElementById('menuOperador').style.display = 'none';
  }
});

let _acaoPendenteSessao = null;

function pedirAutorizacaoSessao(acao, descricao) {
  document.getElementById('menuOperador').style.display = 'none';
  if (perfilAtual === 'admin') { acao(); return; }
  _acaoPendenteSessao = acao;
  document.getElementById('sessaoDescricao').textContent = descricao;
  document.getElementById('inputCodigoAdminSessao').value = '';
  document.getElementById('sessaoErro').textContent = '';
  abrirModal('modalAutorizarSessao');
  setTimeout(() => document.getElementById('inputCodigoAdminSessao').focus(), 100);
}

async function verificarAdminESessao() {
  const codigo = document.getElementById('inputCodigoAdminSessao').value.trim();
  if (!codigo) { document.getElementById('sessaoErro').textContent = 'Escaneie ou digite o código do administrador.'; return; }
  const res = await fetch('/api/operadores/verificar-admin', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codigo })
  }).then(r => r.json()).catch(() => ({ ok: false }));
  if (!res.ok) {
    document.getElementById('sessaoErro').textContent = '❌ Código inválido ou não é administrador.';
    document.getElementById('inputCodigoAdminSessao').value = '';
    document.getElementById('inputCodigoAdminSessao').focus();
    return;
  }
  fecharModal('modalAutorizarSessao');
  if (_acaoPendenteSessao) { _acaoPendenteSessao(); _acaoPendenteSessao = null; }
}

async function trocarOperador() {
  pedirAutorizacaoSessao(async () => {
    try { await fetch('/api/logout', { method: 'POST' }); } catch {}
    localStorage.removeItem('demoOperador');
    window.location.href = '/login.html';
  }, 'Para trocar de usuário é necessária autorização do administrador.');
}

async function sairSistema() {
  pedirAutorizacaoSessao(async () => {
    if (carrinho.length > 0 && !confirm('Há produtos no carrinho. Deseja sair mesmo assim?')) return;
    try { await fetch('/api/logout', { method: 'POST' }); } catch {}
    localStorage.removeItem('demoOperador');
    localStorage.removeItem('pdv_carrinho');
    window.location.href = '/login.html';
  }, 'Para sair do sistema é necessária autorização do administrador.');
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

async function abrirTestarImpressora() {
  abrirModal('modalTestarImpressora');
  const sel = document.getElementById('selImpressora');
  const statusTeste = document.getElementById('statusTesteImpressora');
  sel.innerHTML = '<option>Carregando...</option>';
  statusTeste.textContent = '';
  try {
    const res = await fetch('/api/impressora/listar').then(r => r.json());
    if (res.ok && res.impressoras.length) {
      sel.innerHTML = res.impressoras.map(n => `<option value="${n}">${n}</option>`).join('');
    } else {
      sel.innerHTML = '<option>Nenhuma impressora encontrada</option>';
    }
  } catch {
    sel.innerHTML = '<option>Erro ao listar impressoras</option>';
  }
}

async function salvarImpressora() {
  const nome = document.getElementById('selImpressora').value;
  if (!nome || nome.startsWith('Nenhuma') || nome.startsWith('Erro') || nome === 'Carregando...') return;
  await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ impressora: nome }) });
  toast('Impressora salva: ' + nome, 'sucesso');
}

async function testarImpressora() {
  const btn = document.getElementById('btnTestarImpr');
  const statusTeste = document.getElementById('statusTesteImpressora');
  btn.disabled = true;
  btn.textContent = '...';
  statusTeste.textContent = '';
  await salvarImpressora();
  try {
    const res = await fetch('/api/impressora/testar', { method: 'POST' }).then(r => r.json());
    if (res.ok) {
      statusTeste.style.color = 'green';
      statusTeste.textContent = '✅ Página de teste enviada com sucesso!';
    } else {
      statusTeste.style.color = '#d32f2f';
      statusTeste.textContent = '❌ Erro: ' + (res.erro || 'falha desconhecida');
    }
  } catch {
    statusTeste.style.color = '#d32f2f';
    statusTeste.textContent = '❌ Servidor indisponível';
  }
  btn.disabled = false;
  btn.textContent = '🖨️ Testar Impressão';
}

document.addEventListener('keydown', (e) => {
  const modalAberto = document.querySelector('.modal-overlay.ativo');
  if (e.key === 'Escape' && modalAberto) { fecharModal(modalAberto.id); return; }
  if (modalAberto) return;
  const tag = document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  document.getElementById('inputBarras').focus();
});

init();

(async () => {
  const DEMO_OPERADORES = [
    { nome: 'Maria' },
    { nome: 'João' },
    { nome: 'Ana' }
  ];

  const sel = document.getElementById('selOperador');

  let ops = DEMO_OPERADORES;
  try {
    const r = await fetch('/api/operadores');
    if (r.ok) ops = await r.json();
  } catch {}

  ops.forEach(op => {
    const opt = document.createElement('option');
    opt.value = op.nome;
    opt.textContent = op.nome;
    sel.appendChild(opt);
  });

  document.getElementById('formLogin').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = sel.value;
    const senha = document.getElementById('inputSenha').value;
    const erroEl = document.getElementById('erroLogin');

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, senha })
      }).then(r => r.json());

      if (res.ok) {
        window.location.href = '/pdv.html';
      } else {
        erroEl.textContent = res.erro || 'Erro ao fazer login';
        erroEl.classList.remove('hidden');
      }
    } catch {
      // Modo demo: qualquer senha de 4+ dígitos é aceita
      if (senha.length >= 4) {
        localStorage.setItem('demoOperador', nome);
        window.location.href = '/pdv.html';
      } else {
        erroEl.textContent = 'Demo: use qualquer senha com 4 ou mais caracteres';
        erroEl.classList.remove('hidden');
      }
    }
  });
})();

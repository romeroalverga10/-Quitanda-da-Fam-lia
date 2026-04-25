(async () => {
  const sel = document.getElementById('selOperador');
  const ops = await fetch('/api/operadores').then(r => r.json());
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
  });
})();

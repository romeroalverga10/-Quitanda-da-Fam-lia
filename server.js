const express = require('express');
const path = require('path');
const config = require('./config');
const { initDB } = require('./database/schema');
const { iniciarBalanca } = require('./services/balanca');

const authRouter = require('./routes/auth');
const produtosRouter = require('./routes/produtos');
const vendasRouter = require('./routes/vendas');
const relatoriosRouter = require('./routes/relatorios');
const hardwareRouter = require('./routes/hardware');

const app = express();

app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => res.redirect('/login.html'));

app.use('/api', authRouter);
app.use('/api/produtos', produtosRouter);
app.use('/api/vendas', vendasRouter);
app.use('/api/relatorios', relatoriosRouter);
app.use('/api/fornecedores', require('./routes/fornecedores'));
app.use('/api/contas',       require('./routes/contas'));
app.use('/api', hardwareRouter);

initDB();
iniciarBalanca();

const porta = config.porta || 3000;
app.listen(porta, () => {
  console.log(`\n========================================`);
  console.log(`  PDV Quitanda da Família iniciado!`);
  console.log(`  Acesse: http://localhost:${porta}`);
  console.log(`========================================\n`);
});

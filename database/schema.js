const crypto = require('crypto');
const db = require('./db');

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS operadores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL UNIQUE,
      senha TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categorias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS produtos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      codigo_barras TEXT UNIQUE,
      categoria_id INTEGER NOT NULL,
      preco REAL NOT NULL,
      unidade TEXT NOT NULL DEFAULT 'unidade',
      estoque_atual REAL NOT NULL DEFAULT 0,
      estoque_minimo REAL NOT NULL DEFAULT 0,
      data_validade TEXT,
      FOREIGN KEY (categoria_id) REFERENCES categorias(id)
    );

    CREATE TABLE IF NOT EXISTS vendas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operador_id INTEGER NOT NULL,
      data_hora TEXT NOT NULL,
      total REAL NOT NULL,
      forma_pagamento TEXT NOT NULL,
      valor_recebido REAL,
      troco REAL,
      tipo_cartao TEXT,
      bandeira TEXT,
      FOREIGN KEY (operador_id) REFERENCES operadores(id)
    );

    CREATE TABLE IF NOT EXISTS itens_venda (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venda_id INTEGER NOT NULL,
      produto_id INTEGER NOT NULL,
      quantidade REAL NOT NULL,
      preco_unitario REAL NOT NULL,
      subtotal REAL NOT NULL,
      FOREIGN KEY (venda_id) REFERENCES vendas(id),
      FOREIGN KEY (produto_id) REFERENCES produtos(id)
    );

    CREATE TABLE IF NOT EXISTS fornecedores (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      nome        TEXT    NOT NULL,
      cnpj_cpf    TEXT,
      telefone    TEXT,
      email       TEXT,
      endereco    TEXT,
      observacoes TEXT,
      ativo       INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS contas (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      descricao        TEXT    NOT NULL,
      tipo             TEXT    NOT NULL CHECK(tipo IN ('pagar','receber')),
      valor            REAL    NOT NULL,
      data_vencimento  TEXT    NOT NULL,
      data_pagamento   TEXT,
      status           TEXT    NOT NULL DEFAULT 'pendente' CHECK(status IN ('pendente','pago')),
      fornecedor_id    INTEGER,
      observacoes      TEXT,
      FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id)
    );
  `);

  try {
    db.exec('ALTER TABLE produtos ADD COLUMN fornecedor_id INTEGER REFERENCES fornecedores(id)');
  } catch (e) { /* coluna já existe */ }

  const categorias = [
    'Hortifruti',
    'Frios e Laticínios',
    'Bebidas',
    'Mercearia',
    'Doces e Salgadinhos'
  ];
  for (const cat of categorias) {
    db.run('INSERT OR IGNORE INTO categorias (nome) VALUES (?)', cat);
  }

  const operadores = [
    { nome: 'Admin', senha: sha256('admin123') },
    { nome: 'Operador', senha: sha256('op123') }
  ];
  for (const op of operadores) {
    db.run('INSERT OR IGNORE INTO operadores (nome, senha) VALUES (?, ?)', [op.nome, op.senha]);
  }

  console.log('Banco de dados inicializado.');
}

module.exports = { initDB };

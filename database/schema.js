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
      senha TEXT NOT NULL,
      perfil TEXT NOT NULL DEFAULT 'operador'
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

  try {
    db.exec('ALTER TABLE produtos ADD COLUMN ativo INTEGER NOT NULL DEFAULT 1');
  } catch (e) { /* coluna já existe */ }

  try {
    db.exec('ALTER TABLE vendas ADD COLUMN pagamento_2 TEXT');
  } catch (e) { /* coluna já existe */ }

  try {
    db.exec('ALTER TABLE vendas ADD COLUMN valor_dinheiro REAL');
  } catch (e) { /* coluna já existe */ }

  const categorias = [
    'Hortifruti',
    'Frios e Laticínios',
    'Bebidas',
    'Mercearia',
    'Doces e Salgadinhos',
    'Carnes e Aves',
    'Padaria e Confeitaria',
    'Limpeza',
    'Higiene e Beleza',
    'Congelados',
    'Grãos e Cereais',
    'Enlatados',
  ];
  for (const cat of categorias) {
    db.run('INSERT OR IGNORE INTO categorias (nome) VALUES (?)', cat);
  }

  const colunasOp = db.all('PRAGMA table_info(operadores)').map(c => c.name);
  if (!colunasOp.includes('perfil'))
    db.exec("ALTER TABLE operadores ADD COLUMN perfil TEXT NOT NULL DEFAULT 'operador'");
  if (!colunasOp.includes('turno'))
    db.exec("ALTER TABLE operadores ADD COLUMN turno TEXT NOT NULL DEFAULT 'manha'");

  db.exec(`
    CREATE TABLE IF NOT EXISTS fechamentos_caixa (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operador_id INTEGER NOT NULL,
      data_abertura TEXT NOT NULL,
      data_fechamento TEXT NOT NULL,
      total_vendas REAL NOT NULL DEFAULT 0,
      qtd_vendas INTEGER NOT NULL DEFAULT 0,
      total_dinheiro REAL NOT NULL DEFAULT 0,
      total_pix REAL NOT NULL DEFAULT 0,
      total_cartao REAL NOT NULL DEFAULT 0,
      observacoes TEXT,
      FOREIGN KEY (operador_id) REFERENCES operadores(id)
    );
  `);

  const colunasFech = db.all('PRAGMA table_info(fechamentos_caixa)').map(c => c.name);
  if (!colunasFech.includes('total_debito'))
    db.exec('ALTER TABLE fechamentos_caixa ADD COLUMN total_debito REAL NOT NULL DEFAULT 0');
  if (!colunasFech.includes('total_credito'))
    db.exec('ALTER TABLE fechamentos_caixa ADD COLUMN total_credito REAL NOT NULL DEFAULT 0');

  db.exec(`
    CREATE TABLE IF NOT EXISTS config_fiscal (
      id INTEGER PRIMARY KEY DEFAULT 1,
      cnpj TEXT,
      ie TEXT,
      razao_social TEXT,
      fantasia TEXT,
      logradouro TEXT,
      numero TEXT,
      complemento TEXT,
      bairro TEXT,
      cep TEXT,
      municipio TEXT,
      cod_municipio TEXT,
      uf TEXT NOT NULL DEFAULT 'SP',
      telefone TEXT,
      crt INTEGER NOT NULL DEFAULT 1,
      csc TEXT,
      csc_id TEXT,
      ambiente INTEGER NOT NULL DEFAULT 2,
      serie INTEGER NOT NULL DEFAULT 1,
      nnf_atual INTEGER NOT NULL DEFAULT 0,
      cert_path TEXT,
      cert_senha TEXT
    );

    CREATE TABLE IF NOT EXISTS nfce (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venda_id INTEGER NOT NULL UNIQUE,
      chave TEXT NOT NULL UNIQUE,
      numero INTEGER NOT NULL,
      serie INTEGER NOT NULL,
      xml_assinado TEXT,
      xml_retorno TEXT,
      protocolo TEXT,
      status TEXT NOT NULL DEFAULT 'pendente',
      ambiente INTEGER,
      data_emissao TEXT,
      mensagem TEXT,
      FOREIGN KEY (venda_id) REFERENCES vendas(id)
    );
  `);

  try { db.exec('ALTER TABLE vendas ADD COLUMN pagamentos_json TEXT'); } catch (e) {}
  try { db.exec('ALTER TABLE nfce ADD COLUMN data_autorizacao TEXT'); } catch (e) {}
  try { db.exec('ALTER TABLE nfce ADD COLUMN tpEmis INTEGER NOT NULL DEFAULT 1'); } catch (e) {}
  try { db.exec('ALTER TABLE config_fiscal ADD COLUMN modo_contingencia INTEGER NOT NULL DEFAULT 0'); } catch (e) {}
  try { db.exec('ALTER TABLE config_fiscal ADD COLUMN dhCont TEXT'); } catch (e) {}
  try { db.exec("ALTER TABLE config_fiscal ADD COLUMN xJust_cont TEXT NOT NULL DEFAULT 'Contingência offline por indisponibilidade da SEFAZ'"); } catch (e) {}

  db.exec(`
    CREATE TABLE IF NOT EXISTS nfce_inutilizacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      serie INTEGER NOT NULL,
      nnf_ini INTEGER NOT NULL,
      nnf_fin INTEGER NOT NULL,
      justificativa TEXT NOT NULL,
      protocolo TEXT,
      status TEXT NOT NULL DEFAULT 'pendente',
      ambiente INTEGER,
      xml_assinado TEXT,
      xml_retorno TEXT,
      mensagem TEXT,
      data_inutilizacao TEXT NOT NULL
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS aberturas_caixa (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operador_id INTEGER NOT NULL,
      data_hora TEXT NOT NULL,
      fechada INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (operador_id) REFERENCES operadores(id)
    );
  `);
  try { db.exec('ALTER TABLE vendas ADD COLUMN cancelada INTEGER NOT NULL DEFAULT 0'); } catch (e) {}
  if (!colunasOp.includes('codigo_barras'))
    db.exec('ALTER TABLE operadores ADD COLUMN codigo_barras TEXT');
  try { db.exec('ALTER TABLE produtos ADD COLUMN ncm TEXT'); } catch (e) {}
  try { db.exec('ALTER TABLE produtos ADD COLUMN origem INTEGER NOT NULL DEFAULT 0'); } catch (e) {}
  try { db.exec('ALTER TABLE produtos ADD COLUMN cest TEXT'); } catch (e) {}
  try { db.exec('ALTER TABLE produtos ADD COLUMN codigo_produto TEXT UNIQUE'); } catch (e) {}

  const cfExiste = db.get('SELECT id FROM config_fiscal WHERE id = 1');
  if (!cfExiste) db.run('INSERT INTO config_fiscal (id) VALUES (1)');

  const operadores = [
    { nome: 'Admin', senha: sha256('admin123'), perfil: 'admin' },
    { nome: 'Operador', senha: sha256('op123'), perfil: 'operador' }
  ];
  for (const op of operadores) {
    db.run('INSERT OR IGNORE INTO operadores (nome, senha, perfil) VALUES (?, ?, ?)', [op.nome, op.senha, op.perfil]);
  }
  db.run('UPDATE operadores SET perfil = ? WHERE nome = ?', ['admin', 'Admin']);
  db.run("UPDATE operadores SET codigo_barras = '124578' WHERE nome = 'Admin'")

  // Seed: legumes e verduras comuns
  const catHorti = db.get("SELECT id FROM categorias WHERE nome = 'Hortifruti'");
  if (catHorti) {
    const hId = catHorti.id;
    const produtosHorti = [
      // Verduras folhosas (unidade = maço)
      { nome: 'Alface Crespa',        ncm: '0705.11.00', preco: 2.99,  unidade: 'unidade', min: 5  },
      { nome: 'Alface Americana',     ncm: '0705.11.00', preco: 3.49,  unidade: 'unidade', min: 5  },
      { nome: 'Alface Roxa',          ncm: '0705.11.00', preco: 3.49,  unidade: 'unidade', min: 3  },
      { nome: 'Rúcula',               ncm: '0705.29.00', preco: 2.99,  unidade: 'unidade', min: 3  },
      { nome: 'Agrião',               ncm: '0705.29.00', preco: 2.99,  unidade: 'unidade', min: 3  },
      { nome: 'Espinafre',            ncm: '0709.70.00', preco: 3.49,  unidade: 'unidade', min: 3  },
      { nome: 'Acelga',               ncm: '0704.90.90', preco: 3.49,  unidade: 'unidade', min: 3  },
      { nome: 'Couve Manteiga',       ncm: '0704.90.90', preco: 2.99,  unidade: 'unidade', min: 5  },
      { nome: 'Repolho Verde',        ncm: '0704.90.10', preco: 3.99,  unidade: 'unidade', min: 5  },
      { nome: 'Repolho Roxo',         ncm: '0704.90.10', preco: 4.49,  unidade: 'unidade', min: 3  },
      { nome: 'Almeirão',             ncm: '0705.29.00', preco: 2.49,  unidade: 'unidade', min: 3  },
      { nome: 'Chicória',             ncm: '0705.29.00', preco: 2.49,  unidade: 'unidade', min: 3  },
      { nome: 'Escarola',             ncm: '0705.29.00', preco: 2.49,  unidade: 'unidade', min: 3  },
      { nome: 'Mostarda',             ncm: '0704.90.90', preco: 2.49,  unidade: 'unidade', min: 2  },
      // Temperos/ervas (maço)
      { nome: 'Salsa',                ncm: '0709.99.10', preco: 1.99,  unidade: 'unidade', min: 5  },
      { nome: 'Cebolinha',            ncm: '0709.99.10', preco: 1.99,  unidade: 'unidade', min: 5  },
      { nome: 'Coentro',              ncm: '0709.99.10', preco: 1.99,  unidade: 'unidade', min: 5  },
      { nome: 'Hortelã',              ncm: '0709.99.10', preco: 1.99,  unidade: 'unidade', min: 2  },
      // Legumes (kg)
      { nome: 'Tomate',               ncm: '0702.00.00', preco: 6.99,  unidade: 'kg',      min: 5  },
      { nome: 'Tomate Cereja',        ncm: '0702.00.00', preco: 12.99, unidade: 'kg',      min: 2  },
      { nome: 'Cebola',               ncm: '0703.10.19', preco: 4.99,  unidade: 'kg',      min: 5  },
      { nome: 'Cebola Roxa',          ncm: '0703.10.19', preco: 6.49,  unidade: 'kg',      min: 3  },
      { nome: 'Alho',                 ncm: '0703.20.00', preco: 29.90, unidade: 'kg',      min: 2  },
      { nome: 'Alho-Poró',            ncm: '0703.90.00', preco: 9.99,  unidade: 'unidade', min: 3  },
      { nome: 'Batata Inglesa',       ncm: '0701.90.00', preco: 4.99,  unidade: 'kg',      min: 10 },
      { nome: 'Batata-Doce',          ncm: '0714.20.00', preco: 5.49,  unidade: 'kg',      min: 5  },
      { nome: 'Batata Baroa (Mandioquinha)', ncm: '0714.20.00', preco: 7.99, unidade: 'kg', min: 3 },
      { nome: 'Cenoura',              ncm: '0706.10.10', preco: 4.49,  unidade: 'kg',      min: 5  },
      { nome: 'Beterraba',            ncm: '0706.10.90', preco: 4.49,  unidade: 'kg',      min: 5  },
      { nome: 'Mandioca (Aipim)',     ncm: '0714.10.00', preco: 4.99,  unidade: 'kg',      min: 5  },
      { nome: 'Inhame',               ncm: '0714.30.00', preco: 5.99,  unidade: 'kg',      min: 3  },
      { nome: 'Cará',                 ncm: '0714.30.00', preco: 5.99,  unidade: 'kg',      min: 3  },
      { nome: 'Abobrinha Verde',      ncm: '0709.99.90', preco: 4.99,  unidade: 'kg',      min: 5  },
      { nome: 'Abobrinha Italiana',   ncm: '0709.99.90', preco: 5.49,  unidade: 'kg',      min: 3  },
      { nome: 'Berinjela',            ncm: '0709.30.00', preco: 4.99,  unidade: 'kg',      min: 3  },
      { nome: 'Pepino',               ncm: '0707.00.00', preco: 4.49,  unidade: 'kg',      min: 5  },
      { nome: 'Pimentão Verde',       ncm: '0709.60.00', preco: 6.99,  unidade: 'kg',      min: 3  },
      { nome: 'Pimentão Vermelho',    ncm: '0709.60.00', preco: 8.99,  unidade: 'kg',      min: 3  },
      { nome: 'Pimentão Amarelo',     ncm: '0709.60.00', preco: 8.99,  unidade: 'kg',      min: 2  },
      { nome: 'Chuchu',               ncm: '0709.99.90', preco: 3.99,  unidade: 'kg',      min: 5  },
      { nome: 'Jiló',                 ncm: '0709.99.90', preco: 5.99,  unidade: 'kg',      min: 3  },
      { nome: 'Quiabo',               ncm: '0709.99.90', preco: 6.99,  unidade: 'kg',      min: 3  },
      { nome: 'Maxixe',               ncm: '0709.99.90', preco: 5.99,  unidade: 'kg',      min: 2  },
      { nome: 'Vagem',                ncm: '0708.20.00', preco: 7.99,  unidade: 'kg',      min: 3  },
      { nome: 'Ervilha Torta',        ncm: '0708.10.00', preco: 9.99,  unidade: 'kg',      min: 2  },
      { nome: 'Milho Verde',          ncm: '0709.99.90', preco: 2.99,  unidade: 'unidade', min: 10 },
      { nome: 'Nabo',                 ncm: '0706.90.00', preco: 4.49,  unidade: 'kg',      min: 2  },
      { nome: 'Rabanete',             ncm: '0706.90.00', preco: 3.99,  unidade: 'unidade', min: 3  },
      { nome: 'Brócolis',             ncm: '0704.10.00', preco: 5.99,  unidade: 'unidade', min: 5  },
      { nome: 'Couve-Flor',           ncm: '0704.20.00', preco: 5.99,  unidade: 'unidade', min: 5  },
      { nome: 'Cogumelo Shimeji',     ncm: '0709.51.00', preco: 14.99, unidade: 'kg',      min: 2  },
      { nome: 'Cogumelo Shiitake',    ncm: '0709.51.00', preco: 19.99, unidade: 'kg',      min: 1  },
    ];
    for (const p of produtosHorti) {
      const existe = db.get('SELECT id FROM produtos WHERE nome = ?', p.nome);
      if (!existe) {
        db.run(
          `INSERT INTO produtos (nome, categoria_id, preco, unidade, estoque_atual, estoque_minimo, ncm, origem)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
          [p.nome, hId, p.preco, p.unidade, p.min * 2, p.min, p.ncm]
        );
      }
    }
    console.log('Legumes e verduras cadastrados.');
  }

  console.log('Banco de dados inicializado.');
}

module.exports = { initDB };

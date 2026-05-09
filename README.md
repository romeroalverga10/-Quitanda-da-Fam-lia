# 🛒 PDV Quitanda da Família

Sistema de ponto de venda (PDV) completo desenvolvido para uso em mercearias e quitandas, com emissão de NFC-e, controle de estoque, múltiplas formas de pagamento e gestão de operadores.

## Funcionalidades

### PDV (Caixa)
- Leitura de código de barras via scanner USB
- Busca de produtos por nome, código de barras ou código interno
- Autocomplete de produtos no campo de busca
- Suporte a produtos por unidade e por peso (integração com balança)
- Múltiplas formas de pagamento numa mesma venda (dinheiro, débito, crédito, PIX)
- Geração de QR Code PIX automático
- Impressão de cupom não fiscal na impressora térmica
- Cadastro rápido de produto direto do caixa quando não encontrado
- Controle de sessão por operador com autorização de admin para remoções

### Fiscal
- Emissão de NFC-e (Nota Fiscal de Consumidor Eletrônica)
- Modo de contingência offline com envio posterior à SEFAZ
- Inutilização de numeração
- Configuração de certificado digital A1
- Suporte a NCM, CEST e origem dos produtos

### Estoque e Produtos
- Cadastro completo de produtos com NCM, código de barras e código interno
- Controle de estoque mínimo com alertas visuais
- Alerta de validade (produtos vencidos ou a vencer em até 3 dias)
- Categorias personalizáveis
- Inventário periódico
- Impressão de tabela de preços e etiquetas

### Gestão
- Relatórios de vendas por período
- Fechamento de caixa com resumo por forma de pagamento
- Cadastro de fornecedores
- Contas a pagar e a receber
- Múltiplos operadores com perfis (admin / operador)
- Cancelamento de vendas com restauração automática de estoque

## Tecnologias

| Camada | Tecnologia |
|---|---|
| Backend | Node.js + Express |
| Banco de dados | SQLite (node-sqlite3-wasm) |
| Frontend | HTML, CSS e JavaScript puro |
| Fiscal | XML assinado com certificado A1, SEFAZ SP |
| Impressão | Impressora térmica via Windows |
| Pagamento | PIX via QR Code |

## Como rodar

**Requisitos:** Node.js 18 ou superior, Windows (para integração com impressora e balança)

```bash
# Instalar dependências
npm install

# Iniciar o servidor
npm start
```

Acesse em `http://localhost:3000`

**Credenciais padrão:**
- Admin: `Admin` / `admin123`
- Operador: `Operador` / `op123`

## Estrutura do projeto

```
├── server.js              # Entrada da aplicação
├── database/
│   ├── db.js              # Conexão com SQLite
│   └── schema.js          # Criação e migração das tabelas
├── routes/                # Rotas da API REST
│   ├── produtos.js
│   ├── vendas.js
│   ├── operadores.js
│   └── ...
├── services/
│   ├── balanca.js         # Integração com balança
│   └── pix.js             # Geração de QR Code PIX
└── public/                # Frontend (HTML/CSS/JS)
    ├── pdv.html            # Tela do caixa
    ├── produtos.html       # Gestão de produtos
    ├── relatorios.html     # Relatórios
    └── ...
```

## Autor

**Romero Alverga Pereira da Silva**  
Desenvolvedor Fullstack  
romero.alverga@gmail.com

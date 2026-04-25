const { Database: DatabaseSync } = require('node-sqlite3-wasm');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'quitanda.db');
const db = new DatabaseSync(dbPath);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

module.exports = db;

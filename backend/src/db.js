'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

// Migrações em ordem. Para mudar o banco no futuro, acrescente uma nova entrada; nunca edite as antigas.
const MIGRATIONS = [
  `CREATE TABLE usuarios (
     id TEXT PRIMARY KEY,
     nome TEXT NOT NULL,
     email TEXT NOT NULL UNIQUE,
     senha_hash TEXT NOT NULL,
     tipo TEXT NOT NULL DEFAULT 'aluno' CHECK (tipo IN ('aluno','admin')),
     status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','bloqueado')),
     email_verificado_em TEXT,
     criado_em TEXT NOT NULL,
     ultimo_acesso TEXT,
     atualizado_em TEXT NOT NULL
   );
   CREATE TABLE sessoes (
     token_hash TEXT PRIMARY KEY,
     usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
     criado_em INTEGER NOT NULL,
     expira_em INTEGER NOT NULL,
     lembrar INTEGER NOT NULL DEFAULT 0,
     ip TEXT,
     agente TEXT
   );
   CREATE INDEX idx_sessoes_usuario ON sessoes(usuario_id);
   CREATE TABLE tokens (
     token_hash TEXT PRIMARY KEY,
     usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
     finalidade TEXT NOT NULL CHECK (finalidade IN ('verificar_email','redefinir_senha')),
     expira_em INTEGER NOT NULL,
     usado_em INTEGER
   );
   CREATE TABLE tentativas (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     chave TEXT NOT NULL,
     tipo TEXT NOT NULL,
     ok INTEGER NOT NULL,
     em INTEGER NOT NULL
   );
   CREATE INDEX idx_tentativas ON tentativas(tipo, chave, em);
   CREATE TABLE auditoria (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     admin_id TEXT NOT NULL,
     alvo_id TEXT NOT NULL,
     acao TEXT NOT NULL,
     detalhe TEXT,
     em TEXT NOT NULL
   );`
];

function open(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  const v = db.prepare('PRAGMA user_version').get().user_version;
  for (let i = v; i < MIGRATIONS.length; i++) {
    db.exec('BEGIN');
    try { db.exec(MIGRATIONS[i]); db.exec(`PRAGMA user_version = ${i + 1}`); db.exec('COMMIT'); }
    catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  return db;
}
module.exports = { open };

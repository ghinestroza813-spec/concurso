'use strict';
const { loadEnv, config } = require('./env');
loadEnv();
const { open } = require('./db');
const [cmd, email] = process.argv.slice(2);
if (cmd !== 'make-admin' || !email) { console.log('Uso: npm run make-admin -- email@exemplo.com'); process.exit(1); }
const db = open(config().dbPath);
const r = db.prepare("UPDATE usuarios SET tipo='admin', atualizado_em=? WHERE email=?").run(new Date().toISOString(), email.trim().toLowerCase());
console.log(r.changes ? 'Pronto: ' + email + ' agora é administrador.' : 'Nenhum usuário com esse e-mail.');

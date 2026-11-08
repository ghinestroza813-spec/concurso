'use strict';
// Lê o arquivo .env (se existir) sem depender de pacotes.
const fs = require('node:fs');
const path = require('node:path');
function loadEnv(file = path.join(__dirname, '..', '.env')) {
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch (e) { /* sem .env: usa o ambiente */ }
}
function config(over = {}) {
  const e = process.env;
  return Object.assign({
    port: Number(e.PORT || 3000),
    prod: e.NODE_ENV === 'production',
    baseUrl: (e.BASE_URL || 'http://localhost:3000').replace(/\/$/, ''),
    dbPath: e.DB_PATH || path.join(__dirname, '..', 'data', 'gabarito.db'),
    adminEmail: (e.ADMIN_EMAIL || '').trim().toLowerCase(),
    requireVerified: e.REQUIRE_VERIFIED === '1',
    resendKey: e.RESEND_API_KEY || '',
    mailFrom: e.MAIL_FROM || 'Gabarito <nao-responda@localhost>',
    appUrl: e.APP_URL || '',
    outboxDir: path.join(__dirname, '..', 'outbox'),
  }, over);
}
module.exports = { loadEnv, config };

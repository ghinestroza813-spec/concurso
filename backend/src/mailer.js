'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Envia e-mail pela API da Resend (sem pacote). Sem chave, grava o e-mail em outbox/ e no console,
// o que serve para testar o fluxo no seu computador.
async function sendMail(cfg, { to, subject, text }) {
  if (cfg.resendKey) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + cfg.resendKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: cfg.mailFrom, to: [to], subject, text }),
    });
    if (!r.ok) throw new Error('Falha ao enviar e-mail: ' + r.status);
    return;
  }
  fs.mkdirSync(cfg.outboxDir, { recursive: true });
  const file = path.join(cfg.outboxDir, Date.now() + '-' + Math.random().toString(36).slice(2, 6) + '.txt');
  fs.writeFileSync(file, `Para: ${to}\nAssunto: ${subject}\n\n${text}\n`);
  if (!cfg.quiet) console.log(`[e-mail simulado] ${subject} -> ${to}\n${text}\n`);
}
module.exports = { sendMail };

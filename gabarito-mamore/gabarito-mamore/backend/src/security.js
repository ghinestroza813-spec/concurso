'use strict';
const crypto = require('node:crypto');

/* ---------- Senhas: scrypt (nativo do Node), com sal único e comparação em tempo constante ---------- */
const SCRYPT = { N: 1 << 15, r: 8, p: 1, keylen: 64, maxmem: 128 * 1024 * 1024 };
function scrypt(pw, salt, o) {
  return new Promise((res, rej) => crypto.scrypt(pw.normalize('NFKC'), salt, o.keylen, { N: o.N, r: o.r, p: o.p, maxmem: SCRYPT.maxmem }, (e, k) => e ? rej(e) : res(k)));
}
async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pw, salt, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$');
}
async function verifyPassword(pw, stored) {
  try {
    const [alg, N, r, p, salt, key] = stored.split('$');
    if (alg !== 'scrypt') return false;
    const want = Buffer.from(key, 'base64');
    const got = await scrypt(pw, Buffer.from(salt, 'base64'), { N: +N, r: +r, p: +p, keylen: want.length });
    return crypto.timingSafeEqual(got, want);
  } catch (e) { return false; }
}
let DUMMY = null; // gasta o mesmo tempo quando o e-mail não existe, para não revelar quem tem conta
async function fakeVerify(pw) { DUMMY = DUMMY || await hashPassword('dummy-Password-1'); await verifyPassword(pw, DUMMY); }

/* Regras de senha iguais às do app: 8+ caracteres, maiúscula, minúscula e número */
function passwordProblem(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (pw.length > 128) return 'A senha pode ter no máximo 128 caracteres.';
  if (!/[a-z]/.test(pw)) return 'Use pelo menos uma letra minúscula.';
  if (!/[A-Z]/.test(pw)) return 'Use pelo menos uma letra maiúscula.';
  if (!/[0-9]/.test(pw)) return 'Use pelo menos um número.';
  return null;
}

/* ---------- Tokens: o valor vai ao usuário; no banco fica só o hash ---------- */
const newToken = () => crypto.randomBytes(32).toString('base64url');
const sha = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const newId = () => crypto.randomUUID();
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;
const normEmail = (e) => String(e || '').trim().toLowerCase();
const cleanName = (n) => String(n || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim();

module.exports = { hashPassword, verifyPassword, fakeVerify, passwordProblem, newToken, sha, newId, safeEq, EMAIL_RE, normEmail, cleanName };

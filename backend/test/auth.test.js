'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { config } = require('../src/env');
const { createApp } = require('../src/app');

const outbox = fs.mkdtempSync(path.join(os.tmpdir(), 'gab-'));
let app, base;
const baseCfg = (over = {}) => config(Object.assign({ dbPath: ':memory:', outboxDir: outbox, quiet: true, adminEmail: 'chefe@teste.com', baseUrl: 'http://x' }, over));
async function boot(over) {
  app = createApp(baseCfg(over));
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + app.server.address().port;
}

/* Cliente com "jar" de cookies, como um navegador */
function client() {
  const jar = {};
  const cookieHeader = () => Object.entries(jar).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; ');
  const absorb = (r) => { for (const c of r.headers.getSetCookie()) { const [kv, ...attrs] = c.split(';'), i = kv.indexOf('='), k = kv.slice(0, i), v = decodeURIComponent(kv.slice(i + 1)); if (/max-age=0/i.test(attrs.join(';'))) delete jar[k]; else jar[k] = v; } };
  async function call(method, url, body, opts = {}) {
    const headers = { cookie: cookieHeader() };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (method !== 'GET' && opts.csrf !== false) { if (!jar.csrf) { absorb(await fetch(base + '/api/csrf', { headers })); } headers['x-csrf-token'] = jar.csrf; headers.cookie = cookieHeader(); }
    if (opts.origin) headers.origin = opts.origin;
    const r = await fetch(base + url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
    absorb(r);
    let data = null; try { data = await r.clone().json(); } catch (e) { }
    return { status: r.status, data, headers: r.headers, jar };
  }
  return { jar, get: (u, o) => call('GET', u, undefined, o), post: (u, b, o) => call('POST', u, b ?? {}, o), patch: (u, b, o) => call('PATCH', u, b, o) };
}
const lastMail = (to) => { const f = fs.readdirSync(outbox).sort().reverse().map(n => fs.readFileSync(path.join(outbox, n), 'utf8')).find(t => t.includes('Para: ' + to)); return f; };
const tokenFrom = (mail) => mail.match(/token=([A-Za-z0-9_-]+)/)[1];
const novo = (email, extra = {}) => Object.assign({ nome: 'Maria da Silva', email, senha: 'Senha123x', maior18: true, aceito: true }, extra);

test.before(() => boot());
test.after(() => app.close());

test('1. cadastro de novo usuário (e login automático)', async () => {
  const c = client();
  const r = await c.post('/api/auth/register', novo('aluno1@teste.com'));
  assert.equal(r.status, 201); assert.equal(r.data.usuario.tipo, 'aluno');
  assert.ok(c.jar.sid, 'cria sessão');
  const row = app.db.prepare('SELECT senha_hash FROM usuarios WHERE email=?').get('aluno1@teste.com');
  assert.match(row.senha_hash, /^scrypt\$/); assert.ok(!row.senha_hash.includes('Senha123x'), 'senha nunca em texto puro');
  const dup = await client().post('/api/auth/register', novo('ALUNO1@teste.com'));
  assert.equal(dup.status, 409, 'e-mail único, sem diferenciar maiúsculas');
});

test('1b. validação no servidor', async () => {
  const c = client();
  assert.equal((await c.post('/api/auth/register', novo('x@teste.com', { senha: 'curta1A' }))).status, 400);
  assert.equal((await c.post('/api/auth/register', novo('x@teste.com', { senha: 'semnumeroAAAA' }))).status, 400);
  assert.equal((await c.post('/api/auth/register', novo('email-ruim'))).status, 400);
  assert.equal((await c.post('/api/auth/register', novo('y@teste.com', { aceito: false }))).status, 400);
  assert.equal((await c.post('/api/auth/register', novo('y@teste.com', { nome: '<b>' }))).status, 400);
});

test('2. login com credenciais corretas e 7. persistência da sessão', async () => {
  const c = client();
  const r = await c.post('/api/auth/login', { email: 'Aluno1@Teste.com', senha: 'Senha123x' });
  assert.equal(r.status, 200); assert.equal(r.data.usuario.nome, 'Maria da Silva');
  const set = r.headers.getSetCookie().find(x => x.startsWith('sid='));
  assert.match(set, /HttpOnly/); assert.match(set, /SameSite=Lax/); assert.ok(!/Max-Age=\d+/.test(set), 'sem "continuar conectado": cookie de sessão');
  const me = await c.get('/api/auth/me'); assert.equal(me.status, 200); assert.equal(me.data.usuario.email, 'aluno1@teste.com');
  assert.ok(!JSON.stringify(me.data).includes('senha'), 'nunca expõe hash');
  const c2 = client(); const r2 = await c2.post('/api/auth/login', { email: 'aluno1@teste.com', senha: 'Senha123x', lembrar: true });
  assert.match(r2.headers.getSetCookie().find(x => x.startsWith('sid=')), /Max-Age=2592000/);
});

test('3. senha incorreta e 4. usuário inexistente dão a mesma resposta', async () => {
  const a = await client().post('/api/auth/login', { email: 'aluno1@teste.com', senha: 'Errada123' });
  const b = await client().post('/api/auth/login', { email: 'ninguem@teste.com', senha: 'Errada123' });
  assert.equal(a.status, 401); assert.equal(b.status, 401); assert.equal(a.data.erro, b.data.erro);
});

test('bloqueio por tentativas excessivas', async () => {
  const e = 'forca@teste.com'; await client().post('/api/auth/register', novo(e));
  const c = client();
  for (let i = 0; i < 5; i++) assert.equal((await c.post('/api/auth/login', { email: e, senha: 'Errada123' })).status, 401);
  const r = await c.post('/api/auth/login', { email: e, senha: 'Senha123x' });
  assert.equal(r.status, 429, 'bloqueia mesmo com a senha certa'); assert.ok(+r.headers.get('retry-after') > 0);
});

test('5. recuperação de senha (token de uso único, encerra sessões)', async () => {
  const e = 'recupera@teste.com'; const logado = client(); await logado.post('/api/auth/register', novo(e));
  const c = client();
  const f = await c.post('/api/auth/forgot', { email: e }); assert.equal(f.status, 200);
  const g = await c.post('/api/auth/forgot', { email: 'naoexiste@teste.com' }); assert.equal(g.status, 200); assert.equal(f.data.mensagem, g.data.mensagem, 'não revela quem tem conta');
  await new Promise(r => setTimeout(r, 200));
  const tk = tokenFrom(lastMail(e));
  assert.equal((await c.post('/api/auth/reset', { token: tk, senha: 'fraca' })).status, 400);
  assert.equal((await c.post('/api/auth/reset', { token: 'x'.repeat(43), senha: 'NovaSenha9' })).status, 400, 'token inválido');
  assert.equal((await c.post('/api/auth/reset', { token: tk, senha: 'NovaSenha9' })).status, 200);
  assert.equal((await c.post('/api/auth/reset', { token: tk, senha: 'OutraSenha9' })).status, 400, 'não pode reusar');
  assert.equal((await logado.get('/api/auth/me')).status, 401, 'sessão antiga encerrada');
  assert.equal((await client().post('/api/auth/login', { email: e, senha: 'Senha123x' })).status, 401);
  assert.equal((await client().post('/api/auth/login', { email: e, senha: 'NovaSenha9' })).status, 200);
});

test('token de recuperação expirado é recusado', async () => {
  const e = 'expira@teste.com'; await client().post('/api/auth/register', novo(e));
  const c = client(); await c.post('/api/auth/forgot', { email: e }); await new Promise(r => setTimeout(r, 200));
  const tk = tokenFrom(lastMail(e));
  app.db.prepare('UPDATE tokens SET expira_em=? WHERE finalidade=?').run(Date.now() - 1000, 'redefinir_senha');
  assert.equal((await c.post('/api/auth/reset', { token: tk, senha: 'NovaSenha9' })).status, 400);
});

test('validação de e-mail', async () => {
  const e = 'confirma@teste.com'; const c = client(); await c.post('/api/auth/register', novo(e)); await new Promise(r => setTimeout(r, 200));
  assert.equal((await c.get('/api/auth/me')).data.usuario.emailVerificado, false);
  const tk = tokenFrom(lastMail(e));
  assert.equal((await client().post('/api/auth/verify', { token: tk })).status, 200);
  assert.equal((await c.get('/api/auth/me')).data.usuario.emailVerificado, true);
  assert.equal((await client().post('/api/auth/verify', { token: tk })).status, 400, 'uso único');
});

test('6. logout invalida a sessão no servidor', async () => {
  const c = client(); await c.post('/api/auth/login', { email: 'aluno1@teste.com', senha: 'Senha123x' });
  const sid = c.jar.sid;
  assert.equal((await c.post('/api/auth/logout')).status, 200);
  assert.equal((await c.get('/api/auth/me')).status, 401);
  const velho = client(); velho.jar.sid = sid; // reaproveitar o cookie antigo não funciona mais
  assert.equal((await velho.get('/api/auth/me')).status, 401);
});

test('8. páginas e rotas protegidas exigem autenticação', async () => {
  const r = await fetch(base + '/painel', { redirect: 'manual' }); assert.equal(r.status, 302); assert.match(r.headers.get('location'), /^\/login/);
  const a = await fetch(base + '/admin', { redirect: 'manual' }); assert.equal(a.status, 302);
  assert.equal((await client().get('/api/auth/me')).status, 401);
  assert.equal((await client().get('/api/admin/users')).status, 401);
  const c = client(); await c.post('/api/auth/login', { email: 'aluno1@teste.com', senha: 'Senha123x' });
  assert.equal((await c.get('/api/admin/users')).status, 403, 'aluno não acessa API de admin');
  const pr = await fetch(base + '/painel', { headers: { cookie: 'sid=' + encodeURIComponent(c.jar.sid) }, redirect: 'manual' }); assert.equal(pr.status, 200);
  const ad = await fetch(base + '/admin', { headers: { cookie: 'sid=' + encodeURIComponent(c.jar.sid) }, redirect: 'manual' }); assert.equal(ad.status, 302, 'aluno é mandado de volta ao painel');
});

test('CSRF e origem', async () => {
  const c = client();
  assert.equal((await c.post('/api/auth/login', { email: 'aluno1@teste.com', senha: 'Senha123x' }, { csrf: false })).status, 403, 'sem token CSRF');
  assert.equal((await c.post('/api/auth/login', { email: 'aluno1@teste.com', senha: 'Senha123x' }, { origin: 'https://site-malicioso.com' })).status, 403, 'origem estranha');
  assert.equal((await c.post('/api/auth/login', { email: 'aluno1@teste.com', senha: 'Senha123x' })).status, 200);
});

test('cabeçalhos de segurança e arquivos estáticos', async () => {
  const r = await fetch(base + '/login'); assert.equal(r.status, 200);
  assert.match(r.headers.get('content-security-policy'), /script-src 'self'/); assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.equal((await fetch(base + '/js/../../package.json')).status, 404);
  assert.equal((await fetch(base + '/js/%2e%2e/src/app.js')).status, 404);
  assert.equal((await fetch(base + '/src/app.js')).status, 404);
  assert.equal((await fetch(base + '/.env')).status, 404);
});

test('SQL injection não passa pelo login nem pela busca', async () => {
  const c = client();
  assert.equal((await c.post('/api/auth/login', { email: "' OR 1=1 --", senha: 'Senha123x' })).status, 401);
  const adm = client(); await adm.post('/api/auth/register', novo('chefe@teste.com'));
  const r = await adm.get('/api/admin/users?q=' + encodeURIComponent("%' OR '1'='1")); assert.equal(r.status, 200); assert.equal(r.data.total, 0);
});

test('painel administrativo: listar, bloquear, ativar, permissões', async () => {
  const adm = client(); assert.equal((await adm.post('/api/auth/login', { email: 'chefe@teste.com', senha: 'Senha123x' })).data.usuario.tipo, 'admin', 'e-mail do ADMIN_EMAIL vira admin');
  const sum = await adm.get('/api/admin/summary'); assert.ok(sum.data.total >= 5);
  const lista = await adm.get('/api/admin/users?q=aluno1'); assert.equal(lista.data.total, 1); const alvo = lista.data.usuarios[0];
  assert.ok(!('senha_hash' in alvo));
  const aluno = client(); await aluno.post('/api/auth/login', { email: 'aluno1@teste.com', senha: 'Senha123x' });
  assert.equal((await adm.patch('/api/admin/users/' + alvo.id, { status: 'bloqueado' })).status, 200);
  assert.equal((await aluno.get('/api/auth/me')).status, 401, 'bloqueio derruba a sessão');
  const tent = await client().post('/api/auth/login', { email: 'aluno1@teste.com', senha: 'Senha123x' }); assert.equal(tent.status, 403);
  assert.equal((await adm.patch('/api/admin/users/' + alvo.id, { status: 'ativo' })).status, 200);
  assert.equal((await client().post('/api/auth/login', { email: 'aluno1@teste.com', senha: 'Senha123x' })).status, 200);
  assert.equal((await adm.patch('/api/admin/users/' + alvo.id, { tipo: 'admin' })).data.usuario.tipo, 'admin');
  const eu = (await adm.get('/api/auth/me')).data.usuario.id;
  assert.equal((await adm.patch('/api/admin/users/' + eu, { status: 'bloqueado' })).status, 400, 'não bloqueia a si mesmo');
  assert.equal((await adm.patch('/api/admin/users/' + eu, { tipo: 'aluno' })).status, 400);
  assert.equal((await adm.patch('/api/admin/users/' + alvo.id, { status: 'qualquer' })).status, 400);
  assert.ok(app.db.prepare('SELECT COUNT(*) n FROM auditoria').get().n >= 3, 'ações ficam registradas');
});

test('troca de senha logado', async () => {
  const e = 'troca@teste.com'; const a = client(), b = client(); await a.post('/api/auth/register', novo(e)); await b.post('/api/auth/login', { email: e, senha: 'Senha123x' });
  assert.equal((await a.post('/api/auth/password', { atual: 'errada', nova: 'NovaSenha9' })).status, 400);
  assert.equal((await a.post('/api/auth/password', { atual: 'Senha123x', nova: 'NovaSenha9' })).status, 200);
  assert.equal((await b.get('/api/auth/me')).status, 401, 'outros aparelhos saem'); assert.equal((await a.get('/api/auth/me')).status, 200);
});

test('exigir e-mail confirmado quando REQUIRE_VERIFIED=1', async () => {
  const velho = { app, base }; await boot({ requireVerified: true });
  const c = client(); const r = await c.post('/api/auth/register', novo('estrito@teste.com')); assert.equal(r.status, 201); assert.equal(r.data.precisaVerificar, true); assert.ok(!c.jar.sid);
  const l = await c.post('/api/auth/login', { email: 'estrito@teste.com', senha: 'Senha123x' }); assert.equal(l.status, 403); assert.equal(l.data.codigo, 'email_nao_verificado');
  await new Promise(r => setTimeout(r, 200)); await client().post('/api/auth/verify', { token: tokenFrom(lastMail('estrito@teste.com')) });
  assert.equal((await c.post('/api/auth/login', { email: 'estrito@teste.com', senha: 'Senha123x' })).status, 200);
  await app.close(); app = velho.app; base = velho.base;
});

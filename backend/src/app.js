'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { open } = require('./db');
const S = require('./security');
const { sendMail } = require('./mailer');

const PUBLIC = path.join(__dirname, '..', 'public');
const MIN = 60e3, HOUR = 3600e3, DAY = 24 * HOUR;
const SESSION_SHORT = 12 * HOUR, SESSION_LONG = 30 * DAY;
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };
const PAGES = { '/login': 'login', '/cadastro': 'cadastro', '/esqueci': 'esqueci', '/redefinir': 'redefinir', '/verificar': 'verificar', '/painel': 'painel', '/admin': 'admin', '/privacidade': 'privacidade' };

class HttpError extends Error { constructor(status, msg, extra) { super(msg); this.status = status; this.extra = extra; } }

function createApp(cfg) {
  const db = open(cfg.dbPath);
  const now = () => Date.now();
  const iso = () => new Date().toISOString();

  /* ---------- utilidades de resposta ---------- */
  const SEC = {
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()', 'Cross-Origin-Opener-Policy': 'same-origin',
  };
  if (cfg.prod) SEC['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  const send = (res, status, body, headers = {}) => { res.writeHead(status, Object.assign({}, SEC, headers)); res.end(body); };
  const json = (res, status, obj, headers = {}) => send(res, status, JSON.stringify(obj), Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, headers));
  const redirect = (res, to) => send(res, 302, '', { Location: to, 'Cache-Control': 'no-store' });

  const parseCookies = (h) => { const o = {}; String(h || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) { try { o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); } catch (e) { } } }); return o; };
  const cookie = (name, val, o = {}) => `${name}=${encodeURIComponent(val)}; Path=/; SameSite=Lax${o.httpOnly ? '; HttpOnly' : ''}${cfg.prod ? '; Secure' : ''}${o.maxAge != null ? '; Max-Age=' + o.maxAge : ''}`;
  const clientIp = (req) => (cfg.trustProxy && req.headers['x-forwarded-for']) ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : (req.socket.remoteAddress || 'desconhecido');

  async function readBody(req) {
    const ct = String(req.headers['content-type'] || '');
    if (!ct.startsWith('application/json')) throw new HttpError(415, 'Envie os dados em JSON.');
    let size = 0; const chunks = [];
    for await (const c of req) { size += c.length; if (size > 10 * 1024) throw new HttpError(413, 'Requisição grande demais.'); chunks.push(c); }
    try { const v = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); if (!v || typeof v !== 'object' || Array.isArray(v)) throw 0; return v; }
    catch (e) { throw new HttpError(400, 'Dados inválidos.'); }
  }

  /* ---------- limite de tentativas ---------- */
  const failCount = (tipo, chave, janela) => db.prepare('SELECT COUNT(*) n, MIN(em) primeiro FROM tentativas WHERE tipo=? AND chave=? AND ok=0 AND em>?').get(tipo, chave, now() - janela);
  function guardLimit(tipo, chave, max, janela) {
    const r = failCount(tipo, chave, janela);
    if (r.n >= max) { const wait = Math.max(1, Math.ceil((r.primeiro + janela - now()) / 1000)); throw new HttpError(429, 'Muitas tentativas. Aguarde alguns minutos e tente de novo.', { retryAfter: wait }); }
  }
  const bump = (tipo, chave, ok = 0) => db.prepare('INSERT INTO tentativas (chave,tipo,ok,em) VALUES (?,?,?,?)').run(chave, tipo, ok, now());
  const clearFails = (tipo, chave) => db.prepare('DELETE FROM tentativas WHERE tipo=? AND chave=?').run(tipo, chave);

  /* ---------- sessão ---------- */
  const publicUser = (u) => ({ id: u.id, nome: u.nome, email: u.email, tipo: u.tipo, status: u.status, emailVerificado: !!u.email_verificado_em, criadoEm: u.criado_em, ultimoAcesso: u.ultimo_acesso });
  function currentSession(req) {
    const sid = parseCookies(req.headers.cookie).sid;
    if (!sid) return null;
    const h = S.sha(sid);
    const row = db.prepare('SELECT s.*, u.nome, u.email, u.tipo, u.status, u.email_verificado_em, u.criado_em AS u_criado, u.ultimo_acesso FROM sessoes s JOIN usuarios u ON u.id=s.usuario_id WHERE s.token_hash=?').get(h);
    if (!row) return null;
    if (row.expira_em <= now() || row.status !== 'ativo') { db.prepare('DELETE FROM sessoes WHERE token_hash=?').run(h); return null; }
    // renovação deslizante: só estende a sessão de quem marcou "continuar conectado"
    if (row.lembrar && row.expira_em - now() < SESSION_LONG - HOUR) db.prepare('UPDATE sessoes SET expira_em=? WHERE token_hash=?').run(now() + SESSION_LONG, h);
    return { hash: h, lembrar: !!row.lembrar, user: { id: row.usuario_id, nome: row.nome, email: row.email, tipo: row.tipo, status: row.status, email_verificado_em: row.email_verificado_em, criado_em: row.u_criado, ultimo_acesso: row.ultimo_acesso } };
  }
  function openSession(req, res, userId, lembrar) {
    const token = S.newToken(), ttl = lembrar ? SESSION_LONG : SESSION_SHORT;
    db.prepare('INSERT INTO sessoes (token_hash,usuario_id,criado_em,expira_em,lembrar,ip,agente) VALUES (?,?,?,?,?,?,?)').run(S.sha(token), userId, now(), now() + ttl, lembrar ? 1 : 0, clientIp(req), String(req.headers['user-agent'] || '').slice(0, 200));
    db.prepare('DELETE FROM sessoes WHERE usuario_id=? AND token_hash NOT IN (SELECT token_hash FROM sessoes WHERE usuario_id=? ORDER BY criado_em DESC LIMIT 10)').run(userId, userId);
    return cookie('sid', token, { httpOnly: true, maxAge: lembrar ? Math.floor(ttl / 1000) : undefined });
  }
  const dropCookie = () => cookie('sid', '', { httpOnly: true, maxAge: 0 });

  /* ---------- CSRF: cookie + cabeçalho iguais, e origem do mesmo site ---------- */
  function csrfCheck(req) {
    const origin = req.headers.origin;
    if (origin) { let h; try { h = new URL(origin).host; } catch (e) { h = ''; } if (h !== req.headers.host) throw new HttpError(403, 'Origem não permitida.'); }
    const c = parseCookies(req.headers.cookie).csrf, h = req.headers['x-csrf-token'];
    if (!c || !h || !S.safeEq(c, h)) throw new HttpError(403, 'Sessão da página expirou. Recarregue e tente de novo.');
  }

  /* ---------- e-mails ---------- */
  async function issueToken(userId, finalidade, ttl) {
    db.prepare('DELETE FROM tokens WHERE usuario_id=? AND finalidade=? AND usado_em IS NULL').run(userId, finalidade);
    const t = S.newToken();
    db.prepare('INSERT INTO tokens (token_hash,usuario_id,finalidade,expira_em) VALUES (?,?,?,?)').run(S.sha(t), userId, finalidade, now() + ttl);
    return t;
  }
  async function mailVerify(u) {
    const t = await issueToken(u.id, 'verificar_email', DAY);
    await sendMail(cfg, { to: u.email, subject: 'Confirme seu e-mail no Gabarito', text: `Olá, ${u.nome}!\n\nPara confirmar seu e-mail, abra o link (vale por 24 horas):\n${cfg.baseUrl}/verificar?token=${t}\n\nSe você não criou uma conta no Gabarito, ignore esta mensagem.` });
  }
  async function mailReset(u) {
    const t = await issueToken(u.id, 'redefinir_senha', HOUR);
    await sendMail(cfg, { to: u.email, subject: 'Redefinir sua senha no Gabarito', text: `Olá, ${u.nome}!\n\nPara escolher uma nova senha, abra o link (vale por 1 hora e só pode ser usado uma vez):\n${cfg.baseUrl}/redefinir?token=${t}\n\nSe você não pediu isso, ignore esta mensagem: sua senha continua a mesma.` });
  }

  /* ---------- rotas da API ---------- */
  const routes = [];
  const route = (method, p, opts, fn) => routes.push({ method, p, opts: opts || {}, fn });

  route('GET', '/api/csrf', {}, async (c) => { const t = parseCookies(c.req.headers.cookie).csrf || S.newToken(); json(c.res, 200, { token: t }, { 'Set-Cookie': cookie('csrf', t) }); });

  route('POST', '/api/auth/register', {}, async (c) => {
    const b = c.body, email = S.normEmail(b.email), nome = S.cleanName(b.nome), senha = b.senha;
    if (nome.length < 2 || nome.length > 80) throw new HttpError(400, 'Informe seu nome completo (2 a 80 letras).');
    if (email.length > 254 || !S.EMAIL_RE.test(email)) throw new HttpError(400, 'Informe um e-mail válido.');
    const pp = S.passwordProblem(senha); if (pp) throw new HttpError(400, pp);
    if (b.maior18 !== true) throw new HttpError(400, 'Confirme que você tem 18 anos ou mais.');
    if (b.aceito !== true) throw new HttpError(400, 'Aceite a Política de Privacidade para continuar.');
    const ip = clientIp(c.req);
    guardLimit('cadastro_ip', ip, 10, HOUR); bump('cadastro_ip', ip);
    if (db.prepare('SELECT 1 FROM usuarios WHERE email=?').get(email)) throw new HttpError(409, 'Este e-mail já está cadastrado. Tente entrar ou recuperar a senha.');
    const user = { id: S.newId(), nome, email, tipo: email === cfg.adminEmail ? 'admin' : 'aluno', t: iso() };
    const hash = await S.hashPassword(senha);
    try {
      db.prepare('INSERT INTO usuarios (id,nome,email,senha_hash,tipo,status,criado_em,ultimo_acesso,atualizado_em) VALUES (?,?,?,?,?,?,?,?,?)').run(user.id, nome, email, hash, user.tipo, 'ativo', user.t, cfg.requireVerified ? null : user.t, user.t);
    } catch (e) { throw new HttpError(409, 'Este e-mail já está cadastrado. Tente entrar ou recuperar a senha.'); }
    mailVerify(user).catch(e => console.error('Falha ao enviar e-mail de confirmação:', e.message));
    if (cfg.requireVerified) return json(c.res, 201, { ok: true, precisaVerificar: true, mensagem: 'Conta criada. Enviamos um link de confirmação para o seu e-mail.' });
    const sc = openSession(c.req, c.res, user.id, false);
    json(c.res, 201, { ok: true, usuario: { id: user.id, nome, email, tipo: user.tipo } }, { 'Set-Cookie': sc });
  });

  route('POST', '/api/auth/login', {}, async (c) => {
    const email = S.normEmail(c.body.email), senha = typeof c.body.senha === 'string' ? c.body.senha : '';
    if (!email || !senha || email.length > 254 || senha.length > 128) throw new HttpError(400, 'Informe e-mail e senha.');
    const ip = clientIp(c.req);
    guardLimit('login_email', email, 5, 15 * MIN); guardLimit('login_ip', ip, 30, 15 * MIN);
    const u = db.prepare('SELECT * FROM usuarios WHERE email=?').get(email);
    const okPw = u ? await S.verifyPassword(senha, u.senha_hash) : (await S.fakeVerify(senha), false);
    if (!okPw) { bump('login_email', email); bump('login_ip', ip); throw new HttpError(401, 'E-mail ou senha incorretos.'); }
    if (u.status !== 'ativo') throw new HttpError(403, 'Esta conta está bloqueada. Fale com o suporte.');
    if (cfg.requireVerified && !u.email_verificado_em) throw new HttpError(403, 'Confirme seu e-mail para entrar. Veja a caixa de entrada e o spam.', { codigo: 'email_nao_verificado' });
    clearFails('login_email', email);
    db.prepare('UPDATE usuarios SET ultimo_acesso=? WHERE id=?').run(iso(), u.id);
    const sc = openSession(c.req, c.res, u.id, c.body.lembrar === true);
    json(c.res, 200, { ok: true, usuario: publicUser(u) }, { 'Set-Cookie': sc });
  });

  route('POST', '/api/auth/logout', {}, async (c) => {
    const s = currentSession(c.req); if (s) db.prepare('DELETE FROM sessoes WHERE token_hash=?').run(s.hash);
    json(c.res, 200, { ok: true }, { 'Set-Cookie': dropCookie() });
  });

  route('GET', '/api/auth/me', { auth: true }, async (c) => json(c.res, 200, { usuario: publicUser(c.session.user), appUrl: cfg.appUrl }));

  route('POST', '/api/auth/forgot', {}, async (c) => {
    const email = S.normEmail(c.body.email), ip = clientIp(c.req);
    if (!email || email.length > 254) throw new HttpError(400, 'Informe seu e-mail.');
    guardLimit('forgot_ip', ip, 10, HOUR); guardLimit('forgot_email', email, 3, HOUR);
    bump('forgot_ip', ip); bump('forgot_email', email);
    const u = db.prepare("SELECT * FROM usuarios WHERE email=? AND status='ativo'").get(email);
    if (u) mailReset(u).catch(e => console.error('Falha ao enviar e-mail de recuperação:', e.message));
    json(c.res, 200, { ok: true, mensagem: 'Se este e-mail tiver cadastro, enviamos um link para criar uma nova senha. Ele vale por 1 hora.' });
  });

  const takeToken = (t, finalidade) => {
    if (typeof t !== 'string' || t.length < 20 || t.length > 100) return null;
    const r = db.prepare('SELECT * FROM tokens WHERE token_hash=? AND finalidade=? AND usado_em IS NULL AND expira_em>?').get(S.sha(t), finalidade, now());
    return r || null;
  };
  route('POST', '/api/auth/reset', {}, async (c) => {
    const ip = clientIp(c.req); guardLimit('reset_ip', ip, 20, HOUR);
    const pp = S.passwordProblem(c.body.senha); if (pp) throw new HttpError(400, pp);
    const tk = takeToken(c.body.token, 'redefinir_senha');
    if (!tk) { bump('reset_ip', ip); throw new HttpError(400, 'Este link expirou ou já foi usado. Peça um novo.'); }
    const hash = await S.hashPassword(c.body.senha);
    db.prepare('UPDATE usuarios SET senha_hash=?, atualizado_em=?, email_verificado_em=COALESCE(email_verificado_em,?) WHERE id=?').run(hash, iso(), iso(), tk.usuario_id);
    db.prepare('UPDATE tokens SET usado_em=? WHERE token_hash=?').run(now(), tk.token_hash);
    db.prepare('DELETE FROM sessoes WHERE usuario_id=?').run(tk.usuario_id); // encerra todos os acessos antigos
    const u = db.prepare('SELECT email FROM usuarios WHERE id=?').get(tk.usuario_id); if (u) clearFails('login_email', u.email);
    json(c.res, 200, { ok: true, mensagem: 'Senha alterada. Entre com a nova senha.' });
  });

  route('POST', '/api/auth/verify', {}, async (c) => {
    const ip = clientIp(c.req); guardLimit('verify_ip', ip, 20, HOUR);
    const tk = takeToken(c.body.token, 'verificar_email');
    if (!tk) { bump('verify_ip', ip); throw new HttpError(400, 'Este link expirou ou já foi usado.'); }
    db.prepare('UPDATE usuarios SET email_verificado_em=?, atualizado_em=? WHERE id=?').run(iso(), iso(), tk.usuario_id);
    db.prepare('UPDATE tokens SET usado_em=? WHERE token_hash=?').run(now(), tk.token_hash);
    json(c.res, 200, { ok: true, mensagem: 'E-mail confirmado.' });
  });

  route('POST', '/api/auth/resend', { auth: true }, async (c) => {
    const u = c.session.user; if (u.email_verificado_em) return json(c.res, 200, { ok: true, mensagem: 'Seu e-mail já está confirmado.' });
    guardLimit('resend_user', u.id, 3, HOUR); bump('resend_user', u.id);
    await mailVerify(u).catch(e => { throw new HttpError(502, 'Não foi possível enviar o e-mail agora.'); });
    json(c.res, 200, { ok: true, mensagem: 'Enviamos um novo link para o seu e-mail.' });
  });

  route('POST', '/api/auth/password', { auth: true }, async (c) => {
    const u = c.session.user; guardLimit('senha_user', u.id, 5, 15 * MIN);
    const row = db.prepare('SELECT senha_hash FROM usuarios WHERE id=?').get(u.id);
    if (!(await S.verifyPassword(String(c.body.atual || ''), row.senha_hash))) { bump('senha_user', u.id); throw new HttpError(400, 'A senha atual está incorreta.'); }
    const pp = S.passwordProblem(c.body.nova); if (pp) throw new HttpError(400, pp);
    db.prepare('UPDATE usuarios SET senha_hash=?, atualizado_em=? WHERE id=?').run(await S.hashPassword(c.body.nova), iso(), u.id);
    db.prepare('DELETE FROM sessoes WHERE usuario_id=? AND token_hash<>?').run(u.id, c.session.hash);
    json(c.res, 200, { ok: true, mensagem: 'Senha alterada. Os outros aparelhos foram desconectados.' });
  });

  /* ---------- administração ---------- */
  const audit = (adminId, alvo, acao, det) => db.prepare('INSERT INTO auditoria (admin_id,alvo_id,acao,detalhe,em) VALUES (?,?,?,?,?)').run(adminId, alvo, acao, det || null, iso());
  route('GET', '/api/admin/summary', { admin: true }, async (c) => {
    const n = (sql, ...a) => db.prepare(sql).get(...a).n, d7 = new Date(now() - 7 * DAY).toISOString();
    json(c.res, 200, { total: n('SELECT COUNT(*) n FROM usuarios'), alunos: n("SELECT COUNT(*) n FROM usuarios WHERE tipo='aluno'"), admins: n("SELECT COUNT(*) n FROM usuarios WHERE tipo='admin'"), bloqueados: n("SELECT COUNT(*) n FROM usuarios WHERE status='bloqueado'"), novos7d: n('SELECT COUNT(*) n FROM usuarios WHERE criado_em>?', d7), ativos7d: n('SELECT COUNT(*) n FROM usuarios WHERE ultimo_acesso>?', d7), semConfirmar: n('SELECT COUNT(*) n FROM usuarios WHERE email_verificado_em IS NULL') });
  });
  route('GET', '/api/admin/users', { admin: true }, async (c) => {
    const q = String(c.url.searchParams.get('q') || '').trim().toLowerCase().slice(0, 80), st = c.url.searchParams.get('status'), pg = Math.max(1, parseInt(c.url.searchParams.get('pagina')) || 1), per = 25;
    const where = [], args = [];
    if (q) { where.push("(LOWER(nome) LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\')"); const l = '%' + q.replace(/[\\%_]/g, '\\$&') + '%'; args.push(l, l); }
    if (st === 'ativo' || st === 'bloqueado') { where.push('status=?'); args.push(st); }
    const W = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const total = db.prepare(`SELECT COUNT(*) n FROM usuarios ${W}`).get(...args).n;
    const rows = db.prepare(`SELECT id,nome,email,tipo,status,email_verificado_em,criado_em,ultimo_acesso FROM usuarios ${W} ORDER BY criado_em DESC LIMIT ? OFFSET ?`).all(...args, per, (pg - 1) * per);
    json(c.res, 200, { total, pagina: pg, porPagina: per, usuarios: rows.map(publicUser) });
  });
  route('PATCH', '/api/admin/users/:id', { admin: true }, async (c) => {
    const id = c.params.id, me = c.session.user, b = c.body;
    const t = db.prepare('SELECT * FROM usuarios WHERE id=?').get(id); if (!t) throw new HttpError(404, 'Usuário não encontrado.');
    const sets = [], args = [];
    if (b.status !== undefined) {
      if (!['ativo', 'bloqueado'].includes(b.status)) throw new HttpError(400, 'Status inválido.');
      if (id === me.id && b.status === 'bloqueado') throw new HttpError(400, 'Você não pode bloquear a própria conta.');
      sets.push('status=?'); args.push(b.status);
    }
    if (b.tipo !== undefined) {
      if (!['aluno', 'admin'].includes(b.tipo)) throw new HttpError(400, 'Tipo inválido.');
      if (id === me.id && b.tipo !== 'admin') throw new HttpError(400, 'Você não pode tirar a própria permissão de administrador.');
      sets.push('tipo=?'); args.push(b.tipo);
    }
    if (!sets.length) throw new HttpError(400, 'Nada para alterar.');
    sets.push('atualizado_em=?'); args.push(iso());
    db.prepare(`UPDATE usuarios SET ${sets.join(',')} WHERE id=?`).run(...args, id);
    if (b.status === 'bloqueado') db.prepare('DELETE FROM sessoes WHERE usuario_id=?').run(id);
    audit(me.id, id, 'alterar', JSON.stringify({ status: b.status, tipo: b.tipo }));
    json(c.res, 200, { ok: true, usuario: publicUser(db.prepare('SELECT * FROM usuarios WHERE id=?').get(id)) });
  });

  /* ---------- roteamento ---------- */
  function match(method, pathname) {
    for (const r of routes) {
      if (r.method !== method) continue;
      const a = r.p.split('/'), b = pathname.split('/'); if (a.length !== b.length) continue;
      const params = {}; let ok = true;
      for (let i = 0; i < a.length; i++) { if (a[i][0] === ':') params[a[i].slice(1)] = decodeURIComponent(b[i]); else if (a[i] !== b[i]) { ok = false; break; } }
      if (ok) return { r, params };
    }
    return null;
  }

  function serveFile(res, file, extra = {}) {
    fs.readFile(file, (e, data) => {
      if (e) return send(res, 404, 'Não encontrado', { 'Content-Type': 'text/plain; charset=utf-8' });
      send(res, 200, data, Object.assign({ 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' }, extra));
    });
  }

  async function handler(req, res) {
    const url = new URL(req.url, 'http://x'), pathname = url.pathname.replace(/\/+$/, '') || '/';
    try {
      if (pathname.startsWith('/api/')) {
        const m = match(req.method, pathname);
        if (!m) throw new HttpError(404, 'Rota não encontrada.');
        const c = { req, res, url, params: m.params, body: {}, session: null };
        if (req.method !== 'GET') { csrfCheck(req); if (m.r.method !== 'DELETE') c.body = await readBody(req); }
        if (m.r.opts.auth || m.r.opts.admin) {
          c.session = currentSession(req);
          if (!c.session) throw new HttpError(401, 'Entre na sua conta para continuar.');
          if (m.r.opts.admin && c.session.user.tipo !== 'admin') throw new HttpError(403, 'Acesso restrito a administradores.');
        }
        return await m.r.fn(c);
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Método não permitido.');
      const s = currentSession(req);
      if (pathname === '/') return redirect(res, s ? '/painel' : '/login');
      if (PAGES[pathname]) {
        if (s && ['/login', '/cadastro'].includes(pathname)) return redirect(res, '/painel');
        if (['/painel', '/admin'].includes(pathname)) {
          if (!s) return redirect(res, '/login?next=' + encodeURIComponent(pathname));
          if (pathname === '/admin' && s.user.tipo !== 'admin') return redirect(res, '/painel');
        }
        return serveFile(res, path.join(PUBLIC, PAGES[pathname] + '.html'), { 'Cache-Control': 'no-store' });
      }
      // arquivos estáticos: só css/, js/ e img/, sem sair da pasta public
      const rel = path.normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
      if (/^(css|js|img)[/\\]/.test(rel) && !rel.includes('..')) return serveFile(res, path.join(PUBLIC, rel), { 'Cache-Control': cfg.prod ? 'public, max-age=3600' : 'no-store' });
      throw new HttpError(404, 'Página não encontrada.');
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (!(e instanceof HttpError)) console.error(e);
      const headers = e.extra && e.extra.retryAfter ? { 'Retry-After': String(e.extra.retryAfter) } : {};
      if (pathname.startsWith('/api/')) return json(res, status, Object.assign({ ok: false, erro: e instanceof HttpError ? e.message : 'Erro interno. Tente de novo em instantes.' }, e.extra && e.extra.codigo ? { codigo: e.extra.codigo } : {}), headers);
      return send(res, status, status === 404 ? 'Página não encontrada.' : 'Erro.', Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, headers));
    }
  }

  const server = http.createServer((req, res) => { handler(req, res); });
  // limpeza periódica de sessões, tokens e tentativas antigas
  const clean = () => { try { db.prepare('DELETE FROM sessoes WHERE expira_em<?').run(now()); db.prepare('DELETE FROM tokens WHERE expira_em<?').run(now() - DAY); db.prepare('DELETE FROM tentativas WHERE em<?').run(now() - DAY); } catch (e) { } };
  const timer = setInterval(clean, HOUR); timer.unref();
  return { server, db, close: () => new Promise(r => { clearInterval(timer); server.close(() => { db.close(); r(); }); }) };
}
module.exports = { createApp };

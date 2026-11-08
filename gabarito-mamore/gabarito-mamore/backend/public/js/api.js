(function () {
  const ck = (n) => { const m = document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : ''; };
  async function csrf() {
    let t = ck('csrf');
    if (!t) { const r = await fetch('/api/csrf', { credentials: 'same-origin' }); t = (await r.json()).token; }
    return t;
  }
  async function api(method, url, body) {
    const h = { Accept: 'application/json' };
    if (method !== 'GET') { h['Content-Type'] = 'application/json'; h['X-CSRF-Token'] = await csrf(); }
    let r;
    try { r = await fetch(url, { method, headers: h, credentials: 'same-origin', body: method === 'GET' ? undefined : JSON.stringify(body || {}) }); }
    catch (e) { return { ok: false, status: 0, erro: 'Sem conexão com o servidor. Verifique sua internet e tente de novo.' }; }
    let d = {}; try { d = await r.json(); } catch (e) { }
    return Object.assign({ ok: r.ok, status: r.status }, d);
  }
  const $ = (s, r) => (r || document).querySelector(s);
  function busy(btn, on) { btn.disabled = on; btn.classList.toggle('loading', on); }
  function show(el, msg, kind) { el.textContent = msg || ''; el.className = 'alert ' + (kind || 'err') + (msg ? '' : ' hidden'); }
  function togglePw(btn, input) { btn.addEventListener('click', () => { const v = input.type === 'password'; input.type = v ? 'text' : 'password'; btn.textContent = v ? 'Ocultar' : 'Mostrar'; btn.setAttribute('aria-pressed', String(v)); }); }
  const RULES = [['Pelo menos 8 caracteres', v => v.length >= 8], ['Uma letra maiúscula', v => /[A-Z]/.test(v)], ['Uma letra minúscula', v => /[a-z]/.test(v)], ['Um número', v => /[0-9]/.test(v)]];
  function rulesList(ul, input) {
    ul.textContent = ''; const items = RULES.map(r => { const li = document.createElement('li'); li.textContent = r[0]; ul.appendChild(li); return li; });
    const upd = () => RULES.forEach((r, i) => items[i].classList.toggle('ok', r[1](input.value))); input.addEventListener('input', upd); upd();
    return () => RULES.every(r => r[1](input.value));
  }
  function nextUrl() { const n = new URLSearchParams(location.search).get('next'); return n && /^\/[a-z]+$/.test(n) ? n : '/painel'; }
  window.G = { api, $, busy, show, togglePw, rulesList, nextUrl };
})();

(function () {
  const { api, $, busy, show, togglePw, nextUrl } = G;
  const f = $('#f'), err = $('#err'), btn = $('#go'); togglePw($('#tpw'), $('#senha'));
  const q = new URLSearchParams(location.search);
  if (q.get('senha') === 'ok') show(err, 'Senha alterada. Entre com a nova senha.', 'ok');
  f.addEventListener('submit', async (e) => {
    e.preventDefault(); show(err, '');
    const email = $('#email').value.trim(), senha = $('#senha').value;
    if (!email || !senha) return show(err, 'Informe e-mail e senha.');
    busy(btn, true);
    const r = await api('POST', '/api/auth/login', { email, senha, lembrar: $('#lembrar').checked });
    if (r.ok) { location.href = nextUrl(); return; }
    busy(btn, false);
    show(err, r.erro || 'Não foi possível entrar agora.');
    if (r.status === 401) { $('#senha').value = ''; $('#senha').focus(); }
  });
})();

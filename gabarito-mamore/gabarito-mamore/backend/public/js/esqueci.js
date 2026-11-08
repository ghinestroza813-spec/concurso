(function () {
  const { api, $, busy, show } = G; const f = $('#f'), msg = $('#err'), btn = $('#go');
  f.addEventListener('submit', async (e) => {
    e.preventDefault(); show(msg, ''); const email = $('#email').value.trim();
    if (!email) return show(msg, 'Informe seu e-mail.');
    busy(btn, true); const r = await api('POST', '/api/auth/forgot', { email }); busy(btn, false);
    if (r.ok) { show(msg, r.mensagem, 'ok'); btn.disabled = true; } else show(msg, r.erro || 'Não foi possível enviar agora.');
  });
})();

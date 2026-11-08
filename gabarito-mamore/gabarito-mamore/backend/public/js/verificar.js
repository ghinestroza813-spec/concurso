(function () {
  const { api, $, show } = G; const out = $('#err'), link = $('#back');
  const token = new URLSearchParams(location.search).get('token') || '';
  (async () => {
    if (!token) return show(out, 'Link inválido.');
    const r = await api('POST', '/api/auth/verify', { token });
    show(out, r.ok ? 'E-mail confirmado. Obrigado!' : (r.erro || 'Não foi possível confirmar.'), r.ok ? 'ok' : 'err');
    link.classList.remove('hidden');
  })();
})();

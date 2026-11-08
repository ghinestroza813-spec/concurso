(function () {
  const { api, $, busy, show, togglePw, rulesList } = G; const f = $('#f'), err = $('#err'), btn = $('#go');
  const token = new URLSearchParams(location.search).get('token') || '';
  if (!token) { f.classList.add('hidden'); show(err, 'Link inválido. Peça um novo em “Esqueci minha senha”.'); }
  togglePw($('#tpw'), $('#senha')); const okPw = rulesList($('#rules'), $('#senha'));
  f.addEventListener('submit', async (e) => {
    e.preventDefault(); show(err, '');
    if (!okPw()) return show(err, 'A senha ainda não cumpre todas as regras.');
    if ($('#senha').value !== $('#senha2').value) return show(err, 'As senhas não são iguais.');
    busy(btn, true); const r = await api('POST', '/api/auth/reset', { token, senha: $('#senha').value }); busy(btn, false);
    if (r.ok) { location.href = '/login?senha=ok'; return; }
    show(err, r.erro || 'Não foi possível alterar agora.');
  });
})();

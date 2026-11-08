(function () {
  const { api, $, busy, show, togglePw, rulesList } = G;
  const toast = (m) => { const t = $('#toast'); t.textContent = m; t.classList.remove('hidden'); setTimeout(() => t.classList.add('hidden'), 3500); };
  (async () => {
    const r = await api('GET', '/api/auth/me');
    if (!r.ok) { location.href = '/login?next=/painel'; return; }
    const u = r.usuario;
    $('#nome').textContent = u.nome.split(' ')[0];
    $('#nomeCompleto').textContent = u.nome; $('#email').textContent = u.email;
    $('#desde').textContent = new Date(u.criadoEm).toLocaleDateString('pt-BR');
    $('#acesso').textContent = u.ultimoAcesso ? new Date(u.ultimoAcesso).toLocaleString('pt-BR') : '—';
    $('#tipo').textContent = u.tipo === 'admin' ? 'Administrador' : 'Aluno';
    if (u.tipo === 'admin') $('#linkAdmin').classList.remove('hidden');
    if (!u.emailVerificado) $('#verif').classList.remove('hidden');
    if (r.appUrl) { const a = $('#abrirApp'); a.href = r.appUrl; a.classList.remove('hidden'); } else $('#semApp').classList.remove('hidden');
    $('#conteudo').classList.remove('hidden'); $('#carregando').classList.add('hidden');
  })();
  $('#reenviar').addEventListener('click', async (e) => { busy(e.target, true); const r = await api('POST', '/api/auth/resend'); busy(e.target, false); toast(r.ok ? r.mensagem : (r.erro || 'Não foi possível enviar agora.')); });
  $('#sair').addEventListener('click', async (e) => { busy(e.target, true); await api('POST', '/api/auth/logout'); location.href = '/login'; });
  togglePw($('#tpw'), $('#nova')); const okPw = rulesList($('#rules'), $('#nova'));
  $('#fs').addEventListener('submit', async (e) => {
    e.preventDefault(); const err = $('#errs'); show(err, '');
    if (!okPw()) return show(err, 'A nova senha ainda não cumpre todas as regras.');
    const btn = $('#gos'); busy(btn, true); const r = await api('POST', '/api/auth/password', { atual: $('#atual').value, nova: $('#nova').value }); busy(btn, false);
    if (r.ok) { show(err, r.mensagem, 'ok'); $('#fs').reset(); $('#nova').dispatchEvent(new Event('input')); } else show(err, r.erro || 'Não foi possível alterar agora.');
  });
})();

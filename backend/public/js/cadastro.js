(function () {
  const { api, $, busy, show, togglePw, rulesList } = G;
  const f = $('#f'), err = $('#err'), btn = $('#go'); togglePw($('#tpw'), $('#senha'));
  const okPw = rulesList($('#rules'), $('#senha'));
  f.addEventListener('submit', async (e) => {
    e.preventDefault(); show(err, '');
    const nome = $('#nome').value.trim(), email = $('#email').value.trim(), senha = $('#senha').value;
    if (nome.length < 2) return show(err, 'Informe seu nome completo.');
    if (!/^\S+@\S+\.\S+$/.test(email)) return show(err, 'Informe um e-mail válido.');
    if (!okPw()) return show(err, 'A senha ainda não cumpre todas as regras.');
    if (senha !== $('#senha2').value) return show(err, 'As senhas não são iguais.');
    if (!$('#c18').checked) return show(err, 'Confirme que você tem 18 anos ou mais.');
    if (!$('#cpol').checked) return show(err, 'Aceite a Política de Privacidade para continuar.');
    busy(btn, true);
    const r = await api('POST', '/api/auth/register', { nome, email, senha, maior18: true, aceito: true });
    if (r.ok && r.precisaVerificar) { f.classList.add('hidden'); show(err, r.mensagem, 'ok'); busy(btn, false); return; }
    if (r.ok) { location.href = '/painel'; return; }
    busy(btn, false); show(err, r.erro || 'Não foi possível criar a conta agora.');
  });
})();

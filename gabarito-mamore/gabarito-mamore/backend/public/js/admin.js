(function () {
  const { api, $ } = G;
  let pagina = 1, eu = null;
  const toast = (m) => { const t = $('#toast'); t.textContent = m; t.classList.remove('hidden'); setTimeout(() => t.classList.add('hidden'), 3500); };
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const fmt = (d) => d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

  async function resumo() {
    const r = await api('GET', '/api/admin/summary'); if (!r.ok) return;
    const defs = [['total', 'cadastros'], ['novos7d', 'novos nos últimos 7 dias'], ['ativos7d', 'acessaram nos últimos 7 dias'], ['bloqueados', 'bloqueados'], ['semConfirmar', 'e-mail sem confirmar'], ['admins', 'administradores']];
    const g = $('#tiles'); g.textContent = '';
    defs.forEach(([k, l]) => { const t = el('div', 'tile'); t.appendChild(el('b', null, r[k])); t.appendChild(el('span', null, l)); g.appendChild(t); });
  }
  async function lista() {
    const q = encodeURIComponent($('#q').value.trim()), st = $('#st').value;
    const r = await api('GET', `/api/admin/users?q=${q}&status=${st}&pagina=${pagina}`);
    const body = $('#rows'); body.textContent = '';
    if (!r.ok) { $('#vazio').textContent = r.erro || 'Não foi possível carregar.'; $('#vazio').classList.remove('hidden'); return; }
    $('#vazio').classList.toggle('hidden', r.usuarios.length > 0); $('#vazio').textContent = 'Nenhum usuário encontrado.';
    r.usuarios.forEach(u => {
      const tr = el('tr'), c1 = el('td'); c1.appendChild(el('b', null, u.nome)); c1.appendChild(el('br')); c1.appendChild(el('span', 'muted', u.email)); tr.appendChild(c1);
      const c2 = el('td'); c2.appendChild(el('span', 'badge ' + (u.tipo === 'admin' ? 'soon' : 'warn'), u.tipo === 'admin' ? 'Admin' : 'Aluno')); tr.appendChild(c2);
      const c3 = el('td'); c3.appendChild(el('span', 'badge ' + (u.status === 'ativo' ? 'ok' : 'bad'), u.status === 'ativo' ? 'Ativo' : 'Bloqueado')); if (!u.emailVerificado) { c3.appendChild(document.createTextNode(' ')); c3.appendChild(el('span', 'badge warn', 'e-mail pendente')); } tr.appendChild(c3);
      tr.appendChild(el('td', 'mono', fmt(u.criadoEm))); tr.appendChild(el('td', 'mono', fmt(u.ultimoAcesso)));
      const c6 = el('td'), acts = el('div', 'acts'); const self = u.id === eu;
      const b1 = el('button', 'btn sm' + (u.status === 'ativo' ? ' danger' : ''), u.status === 'ativo' ? 'Bloquear' : 'Ativar'); b1.disabled = self && u.status === 'ativo';
      b1.addEventListener('click', () => mudar(u, { status: u.status === 'ativo' ? 'bloqueado' : 'ativo' }));
      const b2 = el('button', 'btn sm', u.tipo === 'admin' ? 'Tornar aluno' : 'Tornar admin'); b2.disabled = self && u.tipo === 'admin';
      b2.addEventListener('click', () => { if (u.tipo === 'aluno' && !confirm('Dar acesso de administrador a ' + u.nome + '?')) return; mudar(u, { tipo: u.tipo === 'admin' ? 'aluno' : 'admin' }); });
      acts.append(b1, b2); c6.appendChild(acts); tr.appendChild(c6); body.appendChild(tr);
    });
    const pages = Math.max(1, Math.ceil(r.total / r.porPagina));
    $('#info').textContent = `${r.total} usuário(s) · página ${r.pagina} de ${pages}`;
    $('#ant').disabled = pagina <= 1; $('#prox').disabled = pagina >= pages;
  }
  async function mudar(u, patch) {
    const r = await api('PATCH', '/api/admin/users/' + u.id, patch);
    toast(r.ok ? 'Alteração salva.' : (r.erro || 'Não foi possível alterar.')); resumo(); lista();
  }
  let tm; $('#q').addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(() => { pagina = 1; lista(); }, 300); });
  $('#st').addEventListener('change', () => { pagina = 1; lista(); });
  $('#ant').addEventListener('click', () => { pagina--; lista(); }); $('#prox').addEventListener('click', () => { pagina++; lista(); });
  $('#sair').addEventListener('click', async () => { await api('POST', '/api/auth/logout'); location.href = '/login'; });
  (async () => { const m = await api('GET', '/api/auth/me'); if (!m.ok || m.usuario.tipo !== 'admin') { location.href = '/login'; return; } eu = m.usuario.id; resumo(); lista(); })();
})();

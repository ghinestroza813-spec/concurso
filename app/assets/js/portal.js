const editais = [
  { nome: 'SEMED — Agente de Secretaria Escolar', descricao: 'Questões e simulados da preparação SEMED.', url: 'index.html' },
  { nome: 'IPAM — Técnico Autárquico', descricao: 'Questões e simulados da preparação IPAM.', url: 'ipam.html' },
  { nome: 'PRF — Polícia Rodoviária Federal', descricao: 'Itens Certo ou Errado e simulados PRF.', url: 'prf.html' }
];
const lista = document.querySelector('#exam-list');
if (lista) {
  for (const edital of editais) {
    const card = document.createElement('article');
    card.className = 'card';
    const h = document.createElement('h3'); h.textContent = edital.nome;
    const p = document.createElement('p'); p.className = 'muted'; p.textContent = edital.descricao;
    const a = document.createElement('a'); a.className = 'btn'; a.href = edital.url; a.textContent = 'Estudar este edital';
    card.append(h, p, a); lista.append(card);
  }
}

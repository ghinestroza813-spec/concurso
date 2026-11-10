# Gabarito Mamoré

App de estudo e simulados para concursos de Porto Velho/RO, começando pelo cargo **Agente de Secretaria Escolar** (nível médio) da Prefeitura, edital 24/2026 (Semed, banca IBGP).

## O que tem
- **Simulado** cronometrado no formato da prova (50 questões) e **treino** por matéria.
- **Banco de questões originais**, escritas no estilo de provas anteriores. Não são cópias de provas.
- **Estudar**: assuntos do edital com aula resumida.
- **Meus erros** e **desempenho** por matéria.
- **Concursos**: busca de concursos de Porto Velho (dados conferidos à mão, com data de conferência).
- **Trilha PRF** (`app/prf.html`): 118 itens originais Certo/Errado no estilo Cebraspe, com treino, simulado (+1/−1) e resumo do Edital nº 1/2021. O PRF ainda não tem edital novo; o material pode mudar.
- **Trilha IPAM** (`app/ipam.html`): Edital 001/2026 (IBADE), Técnico Autárquico – Administrativa (nível médio). Banco de 249 questões de múltipla escolha (5 alternativas), treino, simulado de 80 questões com pontuação de 130 pontos (conhecimentos específicos com peso 2) e resumo do Anexo III. Não cobre o cargo de Informática nem o nível superior. As leis municipais do edital não estão no banco: só há questões em nível de edital.
- Modo claro e escuro, menu lateral, funciona no celular.

## Estrutura
| Pasta | O que é |
|---|---|
| `app/` | O app de estudo: `index.html` (Porto Velho), `prf.html` (PRF) e `ipam.html` (IPAM). Sem build. Salva o progresso no navegador (visitante). |
| `backend/` | Servidor de contas (cadastro, login, recuperação de senha, painel admin). Node 22, sem dependências. Veja `backend/README.md`. |
| `docs/` | Guia de lançamento. |

## Rodar o app
Abra `app/index.html` no navegador, ou sirva a pasta:

    npx serve app

## Publicar o app (GitHub Pages)
1. Em **Settings → Pages**, escolha **Source: GitHub Actions**.
2. Dê push na branch `main`. O workflow `pages.yml` publica a pasta `app/`.

## Rodar o backend
    cd backend
    cp .env.example .env
    npm start
    npm test

## Estado atual
- O app publicado no GitHub Pages funciona **como visitante**. O cadastro e o painel de administrador existiam na versão hospedada dentro do Claude e **não estão ativos** aqui.
- O `backend/` está pronto e testado, mas **ainda não está ligado ao app**. Falta hospedar o servidor e fazer o app falar com a API (veja `docs/LANCAMENTO.md`).
- A Política de Privacidade é um rascunho e precisa de revisão jurídica antes de coletar dados reais.
- Os dados da aba Concursos vêm de notícias e páginas oficiais e são atualizados manualmente. Confirme sempre no edital.

## Direitos
Todos os direitos reservados a Gabriel (Gabriel Social Mídia), enquanto nenhuma licença for escolhida. Para abrir o código, adicione um arquivo `LICENSE`.

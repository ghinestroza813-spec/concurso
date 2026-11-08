# Checklist de lançamento

## 1. Antes de publicar
- [ ] Revisar a Política de Privacidade com um profissional (LGPD).
- [ ] Conferir de novo os dados da aba Concursos (`CONC` no `app/index.html`) e a data `conf`.
- [ ] Rever as questões e as aulas. A LDB muda com frequência; confira o texto consolidado.
- [ ] Decidir a licença (`LICENSE`) ou manter todos os direitos reservados.
- [ ] Testar no celular real, claro e escuro.

## 2. GitHub
- [ ] Criar o repositório (privado até estar pronto).
- [ ] `git init`, `git add .`, `git commit`, `git remote add origin ...`, `git push -u origin main`.
- [ ] Settings → Pages → Source: GitHub Actions.
- [ ] Conferir que `.env` e bancos de dados **não** foram enviados (o `.gitignore` já bloqueia).

## 3. Contas de verdade (fase 2)
- [ ] Hospedar o `backend/` (Render, Railway, Fly.io ou VPS) com disco persistente.
- [ ] Domínio com HTTPS. Variáveis: `NODE_ENV=production`, `BASE_URL`, `TRUST_PROXY=1`, `DB_PATH`.
- [ ] E-mail pela Resend (`RESEND_API_KEY`, `MAIL_FROM`) e depois `REQUIRE_VERIFIED=1`.
- [ ] Ligar o app ao backend: salvar progresso por API em vez do `localStorage`.
- [ ] Fazer backup do banco.

## 4. Nunca enviar ao GitHub
Senhas, chaves de API, arquivo `.env`, banco `.db`, pasta `outbox/` e provas ou editais de terceiros.

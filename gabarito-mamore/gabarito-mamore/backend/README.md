# Gabarito · backend de autenticação

Servidor real de contas para o Gabarito: cadastro, login, recuperação de senha, confirmação de e-mail,
sessões seguras e painel de administração. **Não usa nenhum pacote externo**: só o Node 22.5 ou mais novo.

## Rodar no seu computador
1. Instale o Node 22 ou mais novo (nodejs.org).
2. Copie `.env.example` para `.env` e ajuste. Para testar, basta `ADMIN_EMAIL=seu@email.com` e `NODE_ENV=development`.
3. `npm start` e abra http://localhost:3000
4. Cadastre-se com o e-mail do `ADMIN_EMAIL`: essa conta vira administradora e vê o link "Administração".
   Sem chave de e-mail, as mensagens (confirmação, recuperação) ficam na pasta `outbox/` e no terminal.
5. `npm test` roda os testes automáticos.

Para promover outra pessoa a administradora: `npm run make-admin -- email@exemplo.com`.

## O que está pronto
- Cadastro e login por e-mail e senha (8+ caracteres, maiúscula, minúscula e número).
- Senhas com scrypt (nativo do Node), sal único por usuário. Nunca ficam em texto.
- Sessão por cookie HttpOnly + SameSite=Lax (+ Secure em produção). Só o hash fica no banco. "Continuar conectado" = 30 dias; sem marcar, 12 horas.
- Logout apaga a sessão no servidor. Trocar ou redefinir a senha desconecta os outros aparelhos.
- Proteção contra tentativas excessivas: 5 senhas erradas por e-mail em 15 min, ou 30 por IP.
- CSRF (token duplo + checagem de origem), CSP sem scripts inline, SQL com parâmetros, dados exibidos sempre como texto.
- Recuperação de senha por link de uso único (1 hora) e confirmação de e-mail (24 horas).
- Painel de administração: listar, buscar, bloquear/ativar, dar ou tirar permissão de admin. Tudo fica na tabela `auditoria`.
- Banco SQLite com migrações (`src/db.js`).

## Para colocar no ar
1. **Hospedagem** com Node 22+ e disco persistente (Render, Railway, Fly.io ou uma VPS). Defina as variáveis do `.env.example` no painel da hospedagem; `DB_PATH` deve apontar para o disco persistente.
2. **HTTPS e domínio**: obrigatório. Defina `NODE_ENV=production`, `BASE_URL=https://seu-dominio` e, se houver proxy na frente (como no Render), `TRUST_PROXY=1`.
3. **E-mail**: crie conta na Resend (resend.com), verifique seu domínio e coloque `RESEND_API_KEY` e `MAIL_FROM`. Sem isso, ninguém recebe link de recuperação.
4. Com o e-mail funcionando, ligue `REQUIRE_VERIFIED=1` se quiser exigir e-mail confirmado.
5. Faça backup do arquivo do banco regularmente.

## Ainda não existe
- Login com Google e Apple (precisa de credenciais OAuth; o botão aparece como "em breve").
- CPF: de propósito, para guardar menos dado pessoal. Entra quando houver pagamento.
- Ligação com o app de estudo: hoje o painel aponta para ele por `APP_URL`. O progresso do app ainda é guardado pelo Claude.
- A Política de Privacidade é um rascunho e precisa de revisão jurídica.
- Cadastrar com e-mail já existente avisa que ele existe (mais simples para o usuário). Tem limite por IP contra abuso.

## Estrutura
`src/app.js` rotas e segurança · `src/security.js` senhas e tokens · `src/db.js` tabelas · `src/mailer.js` e-mail ·
`public/` telas · `test/auth.test.js` testes.

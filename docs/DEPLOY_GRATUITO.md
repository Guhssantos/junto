# Colocar o Junto no ar de graça (computador e celular)

Resultado final: um endereço como `https://junto.pages.dev` que abre o Junto em **qualquer navegador** — computador, Android ou iPhone — e pode ser "instalado" na tela inicial como um app. Tudo com planos gratuitos, sem cartão de crédito.

| Peça | Serviço gratuito | Para quê |
| --- | --- | --- |
| Banco, login, tempo real, fotos | **Supabase Free** | Dados e regras de negócio |
| Site (versão web/PWA) | **Cloudflare Pages** (ou Netlify) | Abrir o app pelo navegador |
| Automação | **GitHub Actions** | Testes, deploy do banco e evitar a pausa do Supabase |
| E-mail (recuperar senha) | **Brevo** (300 e-mails/dia) | Enviar o código de 6 dígitos |
| App nativo (opcional) | **Expo Go** / **EAS Build** (cota grátis) | APK para Android, push no celular |

Tempo estimado: 30–40 minutos na primeira vez.

---

## Passo 1 — Banco de dados (Supabase)

1. Crie uma conta em <https://supabase.com> e um projeto (**Region: South America (São Paulo)**). Guarde a **senha do banco**.
2. Aplique as migrações. Escolha **uma** forma:
   - **Sem instalar nada:** no painel, abra **SQL Editor** e execute, em ordem, cada arquivo de `supabase/migrations/` (copiar → colar → *Run*).
   - **Pelo terminal:**
     ```bash
     npx supabase login
     npx supabase link --project-ref SEU_PROJECT_REF
     npx supabase db push
     ```
   - **Automático pelo GitHub:** veja o passo 4.
3. **Authentication → Sign In / Providers → Email**: deixe *Confirm email* **desligado** para começar (as pessoas entram logo após criar a conta, sem depender de e-mail).
4. **Authentication → URL Configuration → Site URL**: coloque o endereço do site (passo 2), ex.: `https://junto.pages.dev`. Em *Redirect URLs*, adicione também `https://junto.pages.dev/**`.
5. Anote em **Project Settings → API**: a **Project URL** e a chave **anon / publishable** (pública). **Nunca** use a `service_role`/`secret` no app ou no site.

## Passo 2 — Site (Cloudflare Pages)

1. Envie o projeto para um repositório no GitHub (pode ser privado):
   ```bash
   git init && git add . && git commit -m "Junto"
   git branch -M main
   git remote add origin https://github.com/SEU_USUARIO/junto.git
   git push -u origin main
   ```
2. Em <https://dash.cloudflare.com> → **Workers & Pages → Create → Pages → Connect to Git**, escolha o repositório e configure:
   - **Build command:** `npm run build:web`
   - **Build output directory:** `dist`
   - **Environment variables:** `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_KEY` (e `NODE_VERSION` = `22`)
3. **Save and Deploy.** Em ~3 minutos o site estará em `https://SEU-PROJETO.pages.dev`. Cada `git push` publica uma nova versão.

Rotas (`/join/ABCD-1234`, `/lists/...`) e cache já estão configurados em `public/_redirects` e `public/_headers`.

> **Alternativas equivalentes:** Netlify (usa `netlify.toml`, já incluído) ou Vercel (usa `vercel.json`, já incluído — o plano gratuito da Vercel é só para uso não comercial).

## Passo 3 — Usar no celular e no computador

- **Computador:** abra o endereço. No Chrome/Edge, o ícone de instalar na barra de endereço cria um atalho de app.
- **Android (Chrome):** menu ⋮ → **Adicionar à tela inicial / Instalar app**.
- **iPhone (Safari):** botão Compartilhar → **Adicionar à Tela de Início**.

Os links de convite gerados na versão web usam o próprio endereço do site (`https://.../join/ABCD-1234`), então funcionam para qualquer pessoa, mesmo sem nada instalado.

## Passo 4 — Automação no GitHub (recomendado)

Em **Settings → Secrets and variables → Actions → New repository secret** do repositório:

| Secret | Valor | Usado por |
| --- | --- | --- |
| `SUPABASE_URL` | Project URL | `keepalive.yml` |
| `SUPABASE_KEY` | chave anon/publishable | `keepalive.yml` |
| `SUPABASE_ACCESS_TOKEN` | <https://supabase.com/dashboard/account/tokens> | `deploy-backend.yml` |
| `SUPABASE_PROJECT_REF` | o `abcd1234` de `https://abcd1234.supabase.co` | `deploy-backend.yml` |
| `SUPABASE_DB_PASSWORD` | senha do banco | `deploy-backend.yml` |

O que passa a acontecer sozinho:

- **CI** (`ci.yml`): a cada push roda tipos, lint, 80+ testes do app, 21 cenários do banco e o build web.
- **Keep-alive** (`keepalive.yml`): o Supabase gratuito **pausa projetos após ~7 dias sem uso**; este workflow faz uma consulta leve 2×/semana para manter o projeto ativo. Rode-o uma vez em *Actions → Supabase keep-alive → Run workflow* para testar.
- **Deploy do backend** (`deploy-backend.yml`): toda mudança em `supabase/` é aplicada no banco (migrações) e a função de push é publicada.

## Passo 5 — E-mail para recuperar senha (Brevo, gratuito)

O e-mail padrão do Supabase só entrega para membros da sua equipe no painel e tem limite baixíssimo. Para que qualquer pessoa receba o código de recuperação:

1. Crie conta em <https://www.brevo.com> (300 e-mails/dia grátis) e verifique o e-mail remetente em *Senders*.
2. Em *SMTP & API → SMTP*, gere uma chave SMTP.
3. No Supabase: **Authentication → Emails → SMTP Settings** → *Enable custom SMTP*:
   - Host `smtp-relay.brevo.com`, porta `587`, usuário = login SMTP do Brevo, senha = chave SMTP, remetente = e-mail verificado.
4. **Authentication → Emails → Templates → Reset Password**: cole o conteúdo de `supabase/templates/recovery.html` (precisa conter `{{ .Token }}`).

## Passo 6 (opcional) — App nativo e push no celular

A versão web já cobre computador e celular. Se quiser o app nativo (notificações push com o app fechado, leitor de QR Code pela câmera mais rápido):

- **Testar já:** `npm start` e escaneie o QR Code com o app **Expo Go**.
- **APK para Android (grátis):** `npm run build:apk` (conta gratuita em <https://expo.dev>; cota mensal gratuita de builds). Instruções completas em [DEPLOY.md](DEPLOY.md) e push em [CONFIGURACAO.md](CONFIGURACAO.md#3-push-notifications).
- Publicar nas lojas tem custo das próprias lojas (Google Play US$ 25 uma vez; Apple US$ 99/ano) — não é necessário para usar o Junto.

---

## Limites do plano gratuito (e o que o projeto já faz a respeito)

| Limite | Valor aproximado | Mitigação no projeto |
| --- | --- | --- |
| Pausa por inatividade (Supabase) | ~7 dias sem uso | `keepalive.yml` |
| Banco (Supabase) | 500 MB | Limpeza diária automática (`pg_cron`) de convites/notificações antigos |
| Fotos (Supabase Storage) | 1 GB | Fotos do chat reduzidas no aparelho (~100–400 KB cada, ou seja, milhares de fotos); fotos de perfil até 2 MB e a antiga é apagada; fotos do chat apagadas ao excluir a lista |
| Conexões em tempo real | 200 simultâneas | Suficiente para centenas de famílias usando ao mesmo tempo |
| Site (Cloudflare Pages) | banda ilimitada, 500 builds/mês | — |
| Backups | sem backup automático no plano Free | Exporte periodicamente: `npx supabase db dump -f backup.sql` (ou *Database → Backups* no painel) |

Os limites mudam com o tempo — confira as páginas de preço antes de lançar para muitas pessoas.

## Problemas comuns

| Sintoma | Causa provável | Solução |
| --- | --- | --- |
| Tela "Configuração necessária" | Variáveis não definidas no build | Defina `EXPO_PUBLIC_SUPABASE_URL`/`KEY` no Cloudflare e faça *Retry deployment* |
| "Sem internet" ao entrar | URL do Supabase errada ou projeto pausado | Confira a URL; em pausa, clique *Restore* no painel |
| Erro ao criar conta com "e-mail" | *Confirm email* ligado sem SMTP | Desligue a confirmação ou configure o passo 5 |
| Código de recuperação não chega | SMTP padrão do Supabase | Configure o passo 5 |
| Versão nova não aparece no celular | Cache do app instalado | Feche e abra o app (a versão nova é baixada em segundo plano) |

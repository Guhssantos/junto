# Configuração

## 1. Supabase — autenticação

Painel → **Authentication**:

1. **Sign In / Providers → Email**: habilitado. Decida sobre *Confirm email*:
   - desligado → entra direto após criar conta (bom para testes);
   - ligado → o app mostra "Confirme seu e-mail" (recomendado em produção).
2. **Senhas**: mínimo 8 caracteres, exigir letras e dígitos.
3. **URL Configuration**: *Site URL* = endereço do site publicado (ex.: `https://junto.pages.dev`; veja [DEPLOY_GRATUITO.md](DEPLOY_GRATUITO.md)). Em *Redirect URLs* adicione `https://junto.pages.dev/**` e `junto://**`. Se você só usar o app nativo, `junto://` basta.
4. **Emails → Templates → Reset Password**: substitua o conteúdo pelo de `supabase/templates/recovery.html` (precisa conter `{{ .Token }}`, o código de 6 dígitos usado pelo app). Assunto sugerido: "Seu código para redefinir a senha do Junto".
5. **SMTP**: o envio padrão do Supabase só entrega para membros da equipe do projeto e tem limite de poucos e-mails por hora. Configure um provedor gratuito (Brevo: 300/dia; Resend: 100/dia) em *Emails → SMTP Settings* — passo a passo em [DEPLOY_GRATUITO.md](DEPLOY_GRATUITO.md#passo-5--e-mail-para-recuperar-senha-brevo-gratuito).
6. **Bot protection** (produção): ative hCaptcha/Turnstile no cadastro.

No ambiente local (`supabase start`) tudo isso já vem de `supabase/config.toml`.

## 2. Banco

`npx supabase db push` aplica as migrações (tabelas, RLS, funções, realtime e bucket de avatares). Confira em *Database → Publications → supabase_realtime* se as tabelas `products`, `messages`, `notifications`, `list_members`, `approval_requests`, `activity_log` e `shopping_lists` estão marcadas.

## 3. Push notifications

### 3.1 Projeto Expo
```bash
npx eas-cli login
npx eas-cli init          # grava o projectId em app.json
```
Copie o `projectId` para `EXPO_PUBLIC_EAS_PROJECT_ID` no `.env`.

### 3.2 Credenciais das lojas
- **Android**: crie um projeto no Firebase, gere uma *service account key* (FCM V1) e envie com `npx eas-cli credentials` → Android → *Google Service Account Key for Push Notifications (FCM V1)*.
- **iOS**: o EAS cria a chave APNs automaticamente no primeiro build (`npx eas-cli build -p ios`), com uma conta Apple Developer.

### 3.3 Edge Function
```bash
openssl rand -hex 32                       # gere um segredo
npx supabase secrets set PUSH_WEBHOOK_SECRET=<segredo>
# opcional, se ativar "Enhanced push security" no expo.dev:
npx supabase secrets set EXPO_ACCESS_TOKEN=<token>
npx supabase functions deploy send-push --no-verify-jwt
```

### 3.4 Ligar o banco à função
1. *Database → Extensions*: habilite **pg_net**.
2. No *SQL Editor*:
```sql
select vault.create_secret('https://SEU_PROJECT_REF.supabase.co/functions/v1/send-push', 'push_function_url');
select vault.create_secret('<mesmo segredo do passo 3.3>', 'push_webhook_secret');
```
Pronto: cada notificação criada gera um push. Sem esses segredos o app continua funcionando (central de notificações + tempo real), apenas sem push.

> Expo Go no Android não recebe push remoto desde o SDK 53 — use um *development build* (`npx eas-cli build --profile development -p android`).

## 4. Armazenamento (fotos de perfil)

A migração cria o bucket `avatars` (2 MB, JPEG/PNG/WebP) e as políticas "cada usuário só escreve na própria pasta". Nada a fazer.

## 5. Links de convite clicáveis (opcional)

Na versão web o link já é `https://<seu-site>/join/ABCD-1234` e abre em qualquer navegador. No app nativo, defina `EXPO_PUBLIC_INVITE_BASE_URL` com o endereço do site publicado para que os convites também usem `https://` (quem recebe abre pelo navegador, sem instalar nada). Sem essa variável, o app nativo gera `junto://join/ABCD-1234` (abre só quem tem o app).

Para que os links `https://` abram direto no app nativo instalado (opcional):
1. Defina `EXPO_PUBLIC_INVITE_BASE_URL=https://seu-dominio`.
2. Configure *App Links* (Android) e *Universal Links* (iOS) — veja "Linking into your app" na documentação do Expo — publicando `assetlinks.json` e `apple-app-site-association` no domínio.
3. Em `app.json`, adicione `android.intentFilters` e `ios.associatedDomains`.

## 6. Configurações do app

| O que mudar | Onde |
| --- | --- |
| Nome, ícone, splash, identificadores | `app.json` (`name`, `icon`, `ios.bundleIdentifier`, `android.package`) |
| Cores, fontes, espaçamentos | `src/theme/tokens.ts` |
| Validade padrão do convite | parâmetro `p_ttl_hours` de `create_invite` (padrão 48 h, máx. 168 h) |
| Limite de tentativas de código | `request_join` em `…03_rpc.sql` (10 por hora) |
| Categorias | tabela `categories` (o app usa a do servidor; `src/lib/categories.ts` é o fallback offline) |
| Papéis e permissões | tabelas `roles`, `permissions`, `role_permissions` |
| Textos de erro | `src/lib/errors.ts` |
| Tempo do cache offline | `src/lib/queryClient.ts` (7 dias) |

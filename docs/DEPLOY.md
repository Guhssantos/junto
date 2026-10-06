# Deploy

## Antes do primeiro build

1. Em `app.json`, troque `com.seudominio.junto` por um identificador seu (ex.: `br.com.suaempresa.junto`) em `ios.bundleIdentifier` e `android.package`. **Não mude depois de publicar.**
2. Substitua os ícones em `assets/` (1024×1024) e a splash.
3. `npx eas-cli login` e `npx eas-cli init`.
4. Cadastre as variáveis no EAS (usadas nos builds na nuvem):
   ```bash
   npx eas-cli env:create --name EXPO_PUBLIC_SUPABASE_URL --value https://SEU.supabase.co --environment preview --environment production --visibility plaintext
   npx eas-cli env:create --name EXPO_PUBLIC_SUPABASE_KEY --value SUA_ANON_KEY --environment preview --environment production --visibility plaintext
   npx eas-cli env:create --name EXPO_PUBLIC_EAS_PROJECT_ID --value SEU_PROJECT_ID --environment preview --environment production --visibility plaintext
   ```
   (Variáveis `EXPO_PUBLIC_*` vão dentro do app — por isso apenas chaves públicas.)

## Android

| Objetivo | Comando | Resultado |
| --- | --- | --- |
| Testes com amigos | `npm run build:apk` | link para baixar o **APK** |
| Google Play | `npm run build:aab` | **AAB** para a Play Console |
| Enviar à loja | `npx eas-cli submit -p android --latest` | envia ao canal de testes internos |

Na Play Console: crie o app, preencha a ficha, a classificação de conteúdo, a seção *Segurança dos dados* (nome, e-mail, fotos, mensagens — coletados, criptografados em trânsito, com opção de exclusão) e a URL da Política de Privacidade.

## iOS

| Objetivo | Comando |
| --- | --- |
| Build da App Store / TestFlight | `npm run build:ios` |
| Enviar ao TestFlight | `npx eas-cli submit -p ios --latest` |

Requer conta Apple Developer. No App Store Connect, preencha *App Privacy* com os mesmos dados e convide testadores no TestFlight.

## Backend de produção

1. Projeto Supabase separado para produção (não use o de testes).
2. `npx supabase link --project-ref <prod>` e `npx supabase db push`.
3. Configure Auth, SMTP, CAPTCHA e push conforme [CONFIGURACAO.md](CONFIGURACAO.md).
4. Plano **Pro** quando houver usuários reais (backups diários, sem pausa por inatividade).
5. Opcional: limpeza com `pg_cron` ([BANCO_DE_DADOS.md](BANCO_DE_DADOS.md)).

## Atualizações

- **Somente JavaScript/telas**: atualização OTA, sem passar pelas lojas
  ```bash
  npx expo install expo-updates   # uma vez
  npx eas-cli update:configure
  npx eas-cli update --channel production --message "Correções"
  ```
- **Banco**: nova migração + `npx supabase db push` (sempre compatível com a versão anterior do app, pois usuários atualizam aos poucos).
- **Bibliotecas nativas/SDK**: novo build nas lojas.

## Checklist de lançamento

- [ ] `npm run test:all` passando
- [ ] Testado com duas contas em dois aparelhos (tempo real, convite, aprovação, offline)
- [ ] Push recebido em Android e iOS
- [ ] Política de Privacidade e Termos publicados
- [ ] Identificadores definitivos em `app.json`

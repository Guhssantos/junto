# Desenvolvimento

## Convenções

- **Rotas** só em `src/app/` (cada arquivo é uma tela). Lógica fica fora: `services/` (acesso ao Supabase), `hooks/` (consultas e tempo real), `lib/` (funções puras e testáveis), `components/`.
- **Design system**: use os componentes de `src/components/ui` e os tokens de `src/theme/tokens.ts`. Não use cores soltas.
- **Erros**: services lançam `AppError` (via `unwrap`/`toAppError`); telas mostram `error.message`, sempre em português e acionável.
- **Acessibilidade**: alvos de toque ≥ 44 px, `accessibilityLabel` em botões só com ícone, `accessibilityRole` correto.
- **Textos**: português do Brasil, frases curtas.

## Como criar uma nova funcionalidade

Exemplo: "marcar produto como favorito".

1. **Banco** — nova migração:
   ```bash
   npx supabase migration new favoritos
   ```
   Crie a tabela, `enable row level security`, `revoke` de escrita, policy de leitura com `is_list_member(list_id)` e uma função RPC `security definer` que chame `private.require_permission(...)`, grave `private.log(...)` e, se fizer sentido, `private.notify_members(...)`. Termine com `grant execute ... to authenticated`.
2. **Teste SQL** — acrescente um bloco em `supabase/tests/01_security_and_flows.test.sql` cobrindo o caminho feliz **e** o acesso negado.
3. **Permissão nova?** `insert into permissions` + `role_permissions`; adicione o nome em `Permission` (`src/types/models.ts`) e em `DEFAULT_ROLE_PERMISSIONS`.
4. **Tipos** em `src/types/models.ts`.
5. **Service** em `src/services/` usando `unwrap(await supabase.rpc(...))`.
6. **Hook** em `src/hooks/queries.ts` com uma chave nova em `src/lib/queryKeys.ts`.
7. **Tempo real** (se outros precisam ver na hora): adicione a tabela à publicação na migração e um `.on('postgres_changes', …)` em `useListRealtime`.
8. **Offline** (se deve funcionar sem sinal): novo tipo em `OutboxOp`, execução em `offline/sync.ts` e operação idempotente no servidor (ID gerado no aparelho).
9. **Tela** em `src/app/…`, usando `usePermissions(listId).can('...')` só para mostrar/esconder botões.
10. **Testes** do app em `src/__tests__/`.

## Novo papel (ex.: "Somente leitura")

Sem alterar código do app:
```sql
insert into roles (id, name, description, rank) values ('viewer', 'Leitor', 'Só visualiza e conversa', 1);
insert into role_permissions (role_id, permission_id) values ('viewer', 'chat.send');
```
Atribua com `set_member_role(list_id, user_id, 'viewer')`. Para exibir o nome no app, inclua em `ROLE_LABEL` (`src/lib/permissions.ts`).

## Testes

| Comando | O que cobre |
| --- | --- |
| `npm test` | dinheiro e totais (mesmas regras do SQL), categorias, convites, erros, fila offline (combinação, idempotência), sincronização (otimista, sem rede, conflito, erro de regra), autenticação (cadastro, login, logout, recuperação), diálogos e convites na web, convite pendente antes do login, componente `ProductRow` |
| `npm run test:db` | sobe um PostgreSQL embutido (PGlite, sem instalar nada), aplica as migrações sobre um *stub* do Supabase (`supabase/tests/00_supabase_stub.sql`) e roda `01_security_and_flows.test.sql`: anônimo bloqueado, intrusa com o ID da lista não lê nem escreve, convite + aprovação, limite de tentativas, permissões de participante, conflito simultâneo, comprar/remover, perguntar ao parceiro, chat, totais, finalização, histórico, expiração, remoção de membro, push token, exclusão de conta, URL de foto, limpeza automática e keep-alive |
| `npm run test:db:pg` | o mesmo, num PostgreSQL 15+ instalado (`initdb` no PATH ou `PG_BIN`) |
| `npm run build:web` | gera o site em `dist/`; `npm run preview:web` serve esse build em <http://localhost:8080> |
| `npm run typecheck` / `npm run lint` | TypeScript estrito e regras do React |

Com o Supabase CLI também é possível rodar os testes SQL no banco local: `npx supabase db reset` e depois `psql "$(npx supabase status -o env | grep DB_URL | cut -d= -f2-)" -f supabase/tests/01_security_and_flows.test.sql` (pule o arquivo `00_supabase_stub.sql`).

### Teste manual de colaboração (roteiro)

1. Conta A cria "Compra do mês" e adiciona Arroz (2 un, R$ 25,00).
2. A → Compartilhar → B escaneia o QR Code → A aceita o pedido.
3. B altera o preço do arroz para R$ 27,90 → A vê na hora e recebe aviso.
4. A e B editam o preço ao mesmo tempo com o avião ligado em um deles → ao reconectar, aparece a escolha de valor.
5. B no modo mercado → "Achei algo fora da lista" → Chocolate R$ 12,90 → A aprova pela notificação.
6. Conversa no produto "Refrigerante".
7. Marque tudo → Resumo → Finalizar → a lista vai para o Histórico das duas contas.

## Testar no celular pela rede Wi-Fi

**Jeito mais fácil:** dois cliques em `Iniciar Junto.bat` (pasta do projeto). Ele liga o Docker, o banco local e o app, e mostra o endereço para o celular. Deixe a janela aberta enquanto usa; ao desligar o computador ou fechar a janela, o app para (para acesso permanente, publique: [DEPLOY_GRATUITO.md](DEPLOY_GRATUITO.md)).

Manualmente:

1. `npx supabase start` e `npx expo start --web --host lan` (ou a configuração `web-lan` do painel de pré-visualização).
2. No celular, no mesmo Wi-Fi, abra `http://IP-DO-COMPUTADOR:8081`. O app usa sozinho o mesmo IP para o Supabase local (não é preciso editar o `.env.local`).
3. Sem HTTPS o navegador não libera câmera ao vivo nem algumas APIs: o leitor de QR oferece "Tirar foto do QR Code" e o app usa alternativas compatíveis. No site publicado (HTTPS) a câmera ao vivo funciona.
4. Se a página não abrir no celular, o Firewall do Windows ou a rede (comum em redes corporativas) está bloqueando as portas 8081 e 54321.

Regras para código novo que roda no navegador: não use APIs exclusivas de HTTPS sem alternativa (`crypto.randomUUID` → `uuid()`, câmera → `lib/qrImage`, área de transferência → conferir o retorno).

## Depuração

- Docker Desktop no Windows fecha com *"rename …\*.sock … The file cannot be accessed by the system"*: rode `powershell -ExecutionPolicy Bypass -File scripts/docker-reset-windows.ps1` (sockets da execução anterior ficam bloqueados, comum com antivírus corporativo). Necessário só para o Supabase local (`npx supabase start`); os testes (`npm run test:db`) não usam Docker.

- Logs do banco: painel → *Logs* → *Postgres*.
- Logs do push: painel → *Edge Functions* → `send-push` → *Logs*.
- Realtime: painel → *Realtime* → *Inspector*.
- App: `npx expo start` → `j` abre o depurador.
- Web: `npm run web` e use o DevTools do navegador (Console/Network). Código só de uma plataforma: arquivos `nome.web.ts` substituem `nome.ts` no navegador (ex.: `src/hooks/useNotificationTap.web.ts`).
- Diálogos: use `showDialog` (`src/lib/dialog.ts`) em vez de `Alert.alert` — no navegador o `Alert.alert` com botões não faz nada.

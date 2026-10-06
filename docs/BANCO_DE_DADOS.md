# Banco de dados

Migrações em `supabase/migrations/` (aplicadas em ordem):

| Arquivo | Conteúdo |
| --- | --- |
| `…01_schema.sql` | Tipos, tabelas, índices, gatilhos de `updated_at`, papéis, permissões e categorias |
| `…02_security.sql` | Funções de acesso, RLS, grants, perfil automático, view `list_summaries` |
| `…03_rpc.sql` | Regras de negócio (RPC) |
| `…04_realtime_push_storage.sql` | Publicação realtime, gatilho de push, bucket de avatares |

## Entidades

```
auth.users 1─1 profiles
profiles 1─N shopping_lists (owner_id)
shopping_lists 1─N list_members N─1 profiles      (role_id → roles)
roles N─N permissions (role_permissions)
shopping_lists 1─N list_invites
shopping_lists 1─N products N─1 categories
products 1─N approval_requests
shopping_lists 1─N messages (product_id opcional → chat do produto)
profiles 1─N notifications, push_tokens
shopping_lists 1─N activity_log, 1─1 purchase_history
```

| Tabela | Observações |
| --- | --- |
| `profiles` | nome, avatar, preferência de push. Criado por gatilho no cadastro |
| `shopping_lists` | `status`: active · completed · archived |
| `list_members` | `role_id` (admin, participant, …), `status`: pending · active · rejected · left · removed |
| `roles`, `permissions`, `role_permissions` | papéis extensíveis sem alterar código |
| `list_invites` | código `ABCD-1234`, expiração, revogação, contagem de uso |
| `invite_attempts` | limite de tentativas por usuário |
| `products` | quantidade, unidade, preço estimado/encontrado, status, responsável, `version`, remoção lógica (`deleted_at`) |
| `approval_requests` | "Perguntar ao parceiro" (`is_new_product` diferencia item novo de item existente) |
| `messages` | `product_id` nulo = chat geral da lista |
| `notifications` | central do app; inserir dispara o push |
| `push_tokens` | um token por aparelho; muda de dono ao trocar de conta |
| `activity_log` | histórico/auditoria; sobrevive à remoção do produto |
| `purchase_history` | resumo congelado ao finalizar |
| `categories` | catálogo global com palavras-chave para sugestão |

## Status do produto

`pending` Pendente · `in_review` Em análise · `awaiting_confirmation` Aguardando confirmação · `approved` Aprovado · `rejected` Recusado · `purchased` Comprado · `unavailable` Indisponível · `cancelled` Cancelado.

Entram nos totais e no progresso apenas: pendente, em análise, aprovado e comprado.

## Funções (API)

| Função | Permissão | Descrição |
| --- | --- | --- |
| `create_list(name, description, purchase_date, note)` | autenticado | cria lista e torna o criador administrador |
| `finalize_list(list_id)` / `reopen_list` | `list.close` | grava `purchase_history` e move para o histórico |
| `create_invite(list_id, ttl_hours)` / `revoke_invites` | `member.invite` | código válido é reaproveitado |
| `request_join(code)` | autenticado | cria pedido pendente; devolve `status` (pending, invalid, expired, rate_limited…) |
| `respond_join_request(list_id, user_id, accept)` | `member.invite` | aceita/recusa |
| `remove_member`, `set_member_role` | `member.remove` / `member.manage` | o dono não pode ser removido/rebaixado |
| `leave_list(list_id)` | membro | o dono não pode sair |
| `add_product(…, p_id)` | `product.create` | idempotente pelo `p_id` |
| `update_product(product_id, patch, base)` | por campo | merge de 3 vias; devolve `{status, product, conflicts}` |
| `delete_product(product_id)` | `product.delete` ou autor | remoção lógica |
| `ask_partner(…)` / `ask_about_product(…)` | `approval.request` | exige outro membro com `approval.respond` |
| `respond_approval(request_id, approve, note)` | `approval.respond` | quem pediu não responde; a nota vira mensagem no chat do produto |
| `cancel_approval(request_id)` | autor ou admin | |
| `send_message(list_id, body, product_id, p_id)` | `chat.send` | idempotente |
| `mark_notifications_read(ids?)` | dono | |
| `register_push_token(token, platform)` | autenticado | |
| `delete_my_account()` | autenticado | LGPD — transfere ou exclui listas próprias |

Erros usam códigos estáveis (`forbidden`, `list_unavailable`, `invalid_input`…), traduzidos em `src/lib/errors.ts`.

## Fotos do chat

`messages.image_path` aponta para `chat-images/<list_id>/<uuid>.jpg` (bucket privado, 5 MB, JPEG/PNG/WebP), com `image_width`/`image_height`. Políticas do Storage: participantes leem; quem pode conversar envia; remove quem enviou ou quem pode excluir a lista. `send_message` só aceita foto da pasta da própria lista e que exista no Storage com a pessoa como dona. Ao excluir a lista o app apaga a pasta antes (o banco não apaga arquivos do Storage).

## Notificações

`delete_notifications(p_ids uuid[] default null)` apaga as notificações indicadas — ou todas — sempre só as do próprio usuário.

## Unidade de medida

`products.unit` é opcional (`null` = sem unidade). Aceita as sugeridas pelo app (`un`, `kg`, `g`, `L`, `ml`, `pct`, `cx`, `dz`) ou texto livre de até 15 caracteres ("Outros": maço, bandeja…). Um gatilho transforma texto vazio em `null` em qualquer caminho de escrita (migração `…06_optional_unit.sql`).

## Manutenção automática (pg_cron)

A migração `…05_fixes.sql` cria `private.cleanup_old_data()` e, se a extensão **pg_cron** estiver disponível (no Supabase ela já vem disponível, inclusive no plano gratuito), agenda a execução diária às 03:30 UTC. Ela apaga tentativas de convite com mais de 7 dias, convites vencidos há mais de 30 dias e notificações lidas com mais de 90 dias — mantendo o banco bem abaixo do limite de 500 MB do plano gratuito.

Conferir: `select * from cron.job;` · executar na hora: `select private.cleanup_old_data();`

## Alterando o esquema

Crie uma nova migração (`npx supabase migration new nome`) — nunca edite migrações já aplicadas em produção. Em tabelas novas, **habilite RLS** e repita o padrão de `…02_security.sql` (o Supabase concede acesso padrão às roles da API em tabelas novas).

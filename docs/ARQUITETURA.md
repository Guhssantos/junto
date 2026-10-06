# Arquitetura

## Visão geral

```
┌──────────────── App (Expo / React Native) ────────────────┐
│ Telas (Expo Router) → hooks (React Query) → services       │
│        ↑ cache persistido (AsyncStorage)   ↓               │
│ Fila offline (outbox) ──► RPC ──────────────┐              │
│ Realtime (WebSocket) ◄──────────────────────┼──┐           │
└─────────────────────────────────────────────┼──┼───────────┘
                                              ▼  │
┌──────────────────────── Supabase ───────────────┼──────────┐
│ Auth (JWT)   PostgREST/RPC   Realtime   Storage  │          │
│                    │             ▲               │          │
│              PostgreSQL: tabelas + RLS + funções │          │
│                    │ insert em notifications     │          │
│                    ▼ (pg_net)                    │          │
│           Edge Function send-push ──► Expo Push ─┴─► celular│
└─────────────────────────────────────────────────────────────┘
```

## Escolhas técnicas

| Decisão | Escolha | Alternativas avaliadas | Motivo |
| --- | --- | --- | --- |
| App | **Expo + React Native** | Flutter | Um código para Android/iOS, builds na nuvem (EAS) sem Mac, atualizações OTA, ótimo suporte a Supabase, push e câmera. Flutter seria igualmente viável; TypeScript permite compartilhar regras com Edge Functions. |
| Backend | **Supabase** | Firebase; API própria (Node + Postgres) | Dados relacionais (listas ↔ membros ↔ produtos ↔ mensagens) ficam naturais em SQL; RLS aplica a mesma regra de acesso à API e ao tempo real; free tier generoso; sem servidor para manter. Firebase complica consultas/relatórios e regras por papel; API própria aumenta custo e manutenção no MVP. |
| Regras de negócio | **Funções RPC no Postgres** | Edge Functions para tudo | Validação, permissão, histórico e notificações numa única transação, sem ida e volta extra. Edge Functions ficam para integrações externas (push, IA). |
| Autenticação | **Supabase Auth** (e-mail + senha) | Auth0, Firebase Auth | Integrada ao RLS (`auth.uid()`), tokens JWT com refresh rotativo, sessão guardada no Keychain/Keystore. |
| Tempo real | **Supabase Realtime** (postgres_changes + presence) | Firebase RTDB, Socket.IO | Já respeita RLS por assinante; presença mostra "Larissa comprando também". |
| Push | **Expo Push Service** | FCM/APNs direto, OneSignal | Um único endpoint para Android e iOS, gratuito, sem SDK extra. |
| Web | **react-native-web + PWA** (Cloudflare Pages/Netlify) | App separado em React/Next.js | O mesmo código atende navegador de computador e celular; site estático hospedado de graça; instalável na tela inicial. Diferenças por plataforma ficam em arquivos `.web.ts` e em `showDialog`/`shareText`. |
| Offline | **React Query persistido + fila própria** | WatermelonDB, PowerSync | Atende o MVP (ver a lista e editar sem sinal) sem banco local complexo. Migração para PowerSync é possível se o uso offline crescer. |

## Fluxos principais

### Alteração de produto (com conflito)
1. O app envia **somente os campos alterados** (`patch`) e o valor que o usuário via (`base`) para `update_product`.
2. O servidor bloqueia a linha (`for update`) e, para cada campo, faz um merge de 3 vias:
   - `atual == base` → ninguém mexeu: aplica;
   - `atual == novo` → mesma alteração: nada a fazer;
   - `atual ≠ base` e `≠ novo` → **conflito**: não aplica e devolve o campo.
3. Campos sem conflito são aplicados; `version` aumenta; histórico e notificações são gravados.
4. O app mostra "Alguém alterou enquanto você editava — qual valor manter?". Nenhum dado se perde em silêncio.

### Offline
- Leitura: o cache do React Query é salvo no aparelho (7 dias). A lista abre sem internet.
- Escrita: adicionar/editar/marcar/remover produto e enviar mensagem entram numa **fila persistida** (`src/offline/outbox.ts`) e são aplicadas na tela na hora.
- IDs gerados no aparelho tornam o reenvio **idempotente** (não duplica itens nem mensagens).
- Edições seguidas do mesmo item são combinadas, mantendo a base original para detectar conflitos.
- A fila é enviada ao reconectar, ao voltar o app para o primeiro plano e quando o canal realtime se recupera.
- Ações que dependem de outra pessoa (convites, aprovação, finalizar) exigem conexão e mostram mensagem clara.

### Tempo real
- Cada tela de lista assina mudanças de `products`, `messages`, `approval_requests`, `list_members`, `activity_log` e `shopping_lists` filtradas por `list_id`.
- Eventos fora de ordem são descartados pela `version`.
- Ao reconectar, as consultas são recarregadas (eventos perdidos durante a queda não somem).
- Um canal global do usuário recebe notificações (toast + badge) e mudanças de participação.

### Notificações
`RPC → insert em notifications (um por destinatário)` → realtime (central no app) **e** trigger → `pg_net` → Edge Function `send-push` → Expo Push. Tokens inválidos são removidos automaticamente.

### Convite
`create_invite` gera `ABCD-1234` (48 h) → QR Code/link `junto://join/ABCD-1234` → `request_join` cria pedido **pendente** e avisa o administrador → `respond_join_request` aceita/recusa. Detalhes de segurança em [SEGURANCA.md](SEGURANCA.md).

## Escalabilidade

- Índices em todas as chaves de acesso (`list_id`, `user_id`, `created_at`).
- Escritas em uma transação curta por ação; totais calculados por view (`list_summaries`) sem tabela agregada a manter.
- Caminho de crescimento: (1) Supabase Pro + réplicas de leitura; (2) trocar `postgres_changes` por *Broadcast from Database* com canais privados quando houver milhares de listas abertas simultaneamente; (3) particionar `activity_log`/`notifications` por data e limpar antigos com `pg_cron` (SQL em [BANCO_DE_DADOS.md](BANCO_DE_DADOS.md)).

## Preparação para IA

Sem IA no MVP. O que já existe para recebê-la: `activity_log` (eventos com usuário/produto/data), `purchase_history` (totais por compra), `products.normalized_name` (duplicados, itens frequentes), `categories.keywords` e a interface `src/ai/suggestions.ts`. Chaves de provedores de IA devem ficar em Edge Functions, nunca no app.

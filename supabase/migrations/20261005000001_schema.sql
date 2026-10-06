-- =============================================================================
-- Junto — esquema principal
-- Tabelas, tipos, índices e dados de referência (papéis, permissões, categorias).
-- Regras de acesso (RLS) ficam em 20261005000002_security.sql.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.list_status as enum ('active', 'completed', 'archived');

create type public.member_status as enum ('pending', 'active', 'rejected', 'left', 'removed');

create type public.product_status as enum (
  'pending',                -- Pendente
  'in_review',              -- Em análise
  'awaiting_confirmation',  -- Aguardando confirmação (Perguntar ao parceiro)
  'approved',               -- Aprovado
  'rejected',               -- Recusado
  'purchased',              -- Comprado
  'unavailable',            -- Indisponível
  'cancelled'               -- Cancelado
);

create type public.approval_status as enum ('pending', 'approved', 'rejected', 'cancelled');

-- ---------------------------------------------------------------------------
-- Perfis (1:1 com auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  name          text not null check (char_length(btrim(name)) between 1 and 80),
  -- Só aceita fotos do próprio usuário no bucket do app (evita URLs externas de rastreamento).
  avatar_url    text check (avatar_url is null or (char_length(avatar_url) <= 1000
                  and avatar_url like 'https://%/storage/v1/object/public/avatars/' || id::text || '/%')),
  push_enabled  boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Papéis e permissões (extensível: novos papéis = novas linhas, sem deploy de app)
-- ---------------------------------------------------------------------------
create table public.roles (
  id          text primary key check (id ~ '^[a-z_]{2,32}$'),
  name        text not null,
  description text,
  rank        int  not null default 0 -- maior = mais poder (usado para impedir rebaixar o dono)
);

create table public.permissions (
  id          text primary key check (id ~ '^[a-z_]+\.[a-z_]+$'),
  description text not null
);

create table public.role_permissions (
  role_id       text not null references public.roles (id) on delete cascade,
  permission_id text not null references public.permissions (id) on delete cascade,
  primary key (role_id, permission_id)
);

-- ---------------------------------------------------------------------------
-- Categorias (globais; list_id reservado para categorias personalizadas no futuro)
-- ---------------------------------------------------------------------------
create table public.categories (
  id          text primary key check (id ~ '^[a-z0-9_]{2,40}$'),
  name        text not null,
  emoji       text not null,
  sort_order  int  not null default 100,
  keywords    text[] not null default '{}', -- usado para sugerir categoria (base para IA futura)
  is_system   boolean not null default true
);

-- ---------------------------------------------------------------------------
-- Listas
-- ---------------------------------------------------------------------------
create table public.shopping_lists (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(btrim(name)) between 1 and 80),
  description    text check (description is null or char_length(description) <= 500),
  note           text check (note is null or char_length(note) <= 500),
  purchase_date  date,
  owner_id       uuid references public.profiles (id) on delete set null,
  status         public.list_status not null default 'active',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  completed_at   timestamptz
);
create index shopping_lists_owner_idx on public.shopping_lists (owner_id);

create table public.list_members (
  id          uuid primary key default gen_random_uuid(),
  list_id     uuid not null references public.shopping_lists (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role_id     text not null default 'participant' references public.roles (id),
  status      public.member_status not null default 'pending',
  joined_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (list_id, user_id)
);
create index list_members_user_idx on public.list_members (user_id, status);
create index list_members_list_idx on public.list_members (list_id, status);

create table public.list_invites (
  id          uuid primary key default gen_random_uuid(),
  list_id     uuid not null references public.shopping_lists (id) on delete cascade,
  code        text not null unique check (code ~ '^[A-Z]{4}-[0-9]{4}$'),
  created_by  uuid references public.profiles (id) on delete set null,
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  uses        int not null default 0,
  created_at  timestamptz not null default now()
);
create index list_invites_list_idx on public.list_invites (list_id);

-- Tentativas de uso de código (limite contra força bruta)
create table public.invite_attempts (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  success       boolean not null,
  attempted_at  timestamptz not null default now()
);
create index invite_attempts_user_idx on public.invite_attempts (user_id, attempted_at desc);

-- ---------------------------------------------------------------------------
-- Produtos
-- id pode ser gerado no aparelho (UUID v4) → criação offline idempotente.
-- version cresce a cada alteração → detecção de conflito.
-- deleted_at = remoção lógica (permite histórico e eventos realtime filtrados).
-- ---------------------------------------------------------------------------
create table public.products (
  id               uuid primary key default gen_random_uuid(),
  list_id          uuid not null references public.shopping_lists (id) on delete cascade,
  name             text not null check (char_length(btrim(name)) between 1 and 120),
  normalized_name  text generated always as (lower(btrim(name))) stored,
  category_id      text not null default 'outros' references public.categories (id),
  quantity         numeric(10, 3) not null default 1 check (quantity > 0 and quantity <= 99999),
  unit             text not null default 'un' check (unit in ('un', 'kg', 'g', 'L', 'ml', 'pct', 'cx', 'dz')),
  estimated_price  numeric(12, 2) check (estimated_price is null or (estimated_price >= 0 and estimated_price <= 1000000)),
  actual_price     numeric(12, 2) check (actual_price is null or (actual_price >= 0 and actual_price <= 1000000)),
  note             text check (note is null or char_length(note) <= 500),
  status           public.product_status not null default 'pending',
  added_by         uuid references public.profiles (id) on delete set null,
  assigned_to      uuid references public.profiles (id) on delete set null,
  updated_by       uuid references public.profiles (id) on delete set null,
  purchased_by     uuid references public.profiles (id) on delete set null,
  purchased_at     timestamptz,
  version          int not null default 1,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create index products_list_idx on public.products (list_id) where deleted_at is null;
create index products_name_idx on public.products (normalized_name);

-- ---------------------------------------------------------------------------
-- Perguntar ao parceiro (aprovações)
-- ---------------------------------------------------------------------------
create table public.approval_requests (
  id             uuid primary key default gen_random_uuid(),
  list_id        uuid not null references public.shopping_lists (id) on delete cascade,
  product_id     uuid not null references public.products (id) on delete cascade,
  requested_by   uuid references public.profiles (id) on delete set null,
  status         public.approval_status not null default 'pending',
  is_new_product boolean not null default true, -- produto fora da lista (true) ou item já existente (false)
  price         numeric(12, 2) check (price is null or price >= 0),
  message        text check (message is null or char_length(message) <= 500),
  responded_by   uuid references public.profiles (id) on delete set null,
  response_note  text check (response_note is null or char_length(response_note) <= 500),
  responded_at   timestamptz,
  created_at     timestamptz not null default now()
);
create index approval_requests_list_idx on public.approval_requests (list_id, status);
create unique index approval_requests_one_pending on public.approval_requests (product_id) where status = 'pending';

-- ---------------------------------------------------------------------------
-- Chat (geral da lista quando product_id é nulo; do produto quando preenchido)
-- ---------------------------------------------------------------------------
create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  list_id     uuid not null references public.shopping_lists (id) on delete cascade,
  product_id  uuid references public.products (id) on delete cascade,
  sender_id   uuid references public.profiles (id) on delete set null,
  body        text not null check (char_length(btrim(body)) between 1 and 2000),
  kind        text not null default 'text' check (kind in ('text', 'system')),
  created_at  timestamptz not null default now()
);
create index messages_list_idx on public.messages (list_id, created_at desc);
create index messages_product_idx on public.messages (product_id, created_at desc) where product_id is not null;

-- ---------------------------------------------------------------------------
-- Notificações (central do app) e tokens de push
-- ---------------------------------------------------------------------------
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  list_id     uuid references public.shopping_lists (id) on delete cascade,
  product_id  uuid references public.products (id) on delete set null,
  actor_id    uuid references public.profiles (id) on delete set null,
  type        text not null check (type in (
                'product_added', 'product_removed', 'price_changed', 'product_purchased',
                'member_joined', 'member_left', 'join_request', 'join_accepted', 'join_rejected',
                'message', 'approval_request', 'approval_approved', 'approval_rejected', 'list_completed')),
  title       text not null,
  body        text not null,
  data        jsonb not null default '{}'::jsonb,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

create table public.push_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  token         text not null unique check (char_length(token) <= 255),
  platform      text not null check (platform in ('ios', 'android', 'web')),
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);
create index push_tokens_user_idx on public.push_tokens (user_id);

-- ---------------------------------------------------------------------------
-- Histórico de alterações (também serve de trilha de auditoria e de base para IA)
-- product_id sem FK: o registro sobrevive à remoção do produto.
-- ---------------------------------------------------------------------------
create table public.activity_log (
  id            bigint generated always as identity primary key,
  list_id       uuid not null references public.shopping_lists (id) on delete cascade,
  actor_id      uuid references public.profiles (id) on delete set null,
  action        text not null,
  product_id    uuid,
  product_name  text,
  details       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index activity_log_list_idx on public.activity_log (list_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Histórico de compras (resumo congelado no momento da finalização)
-- ---------------------------------------------------------------------------
create table public.purchase_history (
  id               uuid primary key default gen_random_uuid(),
  list_id          uuid not null unique references public.shopping_lists (id) on delete cascade,
  items_count      int not null,
  purchased_count  int not null,
  total_estimated  numeric(12, 2) not null,
  total_actual     numeric(12, 2) not null,
  completed_by     uuid references public.profiles (id) on delete set null,
  completed_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger shopping_lists_touch before update on public.shopping_lists
  for each row execute function public.touch_updated_at();
create trigger list_members_touch before update on public.list_members
  for each row execute function public.touch_updated_at();
create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Dados de referência
-- ---------------------------------------------------------------------------
insert into public.roles (id, name, description, rank) values
  ('admin',       'Administrador', 'Controle total da lista',                         100),
  ('participant', 'Participante',  'Adiciona, edita, informa preços e conversa',       10);

insert into public.permissions (id, description) values
  ('list.update',      'Editar nome e dados da lista'),
  ('list.close',       'Finalizar a compra'),
  ('list.delete',      'Excluir a lista'),
  ('member.invite',    'Gerar convites e aprovar pedidos de entrada'),
  ('member.remove',    'Remover participantes'),
  ('member.manage',    'Alterar papel de participantes'),
  ('product.create',   'Adicionar produtos'),
  ('product.update',   'Editar produtos'),
  ('product.delete',   'Remover qualquer produto'),
  ('product.price',    'Informar e alterar preços'),
  ('product.purchase', 'Marcar produtos como comprados'),
  ('chat.send',        'Enviar mensagens'),
  ('approval.request', 'Perguntar ao parceiro'),
  ('approval.respond', 'Aprovar ou recusar pedidos de compra');

insert into public.role_permissions (role_id, permission_id)
select 'admin', id from public.permissions;

insert into public.role_permissions (role_id, permission_id) values
  ('participant', 'product.create'),
  ('participant', 'product.update'),
  ('participant', 'product.price'),
  ('participant', 'product.purchase'),
  ('participant', 'chat.send'),
  ('participant', 'approval.request'),
  ('participant', 'approval.respond');

insert into public.categories (id, name, emoji, sort_order, keywords) values
  ('carnes',     'Carnes',            '🥩', 10, '{carne,picanha,frango,peixe,linguiça,linguica,bife,alcatra,patinho,costela,salsicha,presunto,bacon}'),
  ('laticinios', 'Laticínios',        '🥛', 20, '{leite,queijo,iogurte,manteiga,requeijão,requeijao,creme de leite,nata,muçarela,mussarela}'),
  ('hortifruti', 'Frutas e verduras', '🥦', 30, '{banana,maçã,maca,tomate,alface,cebola,alho,batata,cenoura,limão,limao,laranja,uva,mamão,mamao,abacate,fruta,verdura,legume}'),
  ('padaria',    'Padaria',           '🍞', 40, '{pão,pao,bolo,torrada,biscoito,bolacha,pão de queijo,croissant}'),
  ('alimentos',  'Alimentos',         '🥫', 50, '{arroz,feijão,feijao,macarrão,macarrao,açúcar,acucar,sal,óleo,oleo,café,cafe,farinha,molho,azeite,chocolate,cereal,aveia,ovo,ovos}'),
  ('limpeza',    'Limpeza',           '🧹', 60, '{detergente,sabão,sabao,amaciante,desinfetante,água sanitária,agua sanitaria,esponja,saco de lixo,multiuso}'),
  ('higiene',    'Higiene',           '🧴', 70, '{shampoo,xampu,condicionador,sabonete,pasta de dente,creme dental,desodorante,papel higiênico,papel higienico,escova}'),
  ('bebidas',    'Bebidas',           '🥤', 80, '{refrigerante,suco,água,agua,cerveja,vinho,energético,energetico,chá,cha}'),
  ('pets',       'Pets',              '🐶', 90, '{ração,racao,petisco,areia,pet}'),
  ('outros',     'Outros',            '📦', 999, '{}');

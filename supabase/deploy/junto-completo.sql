-- =============================================================================
-- Junto — banco completo (todas as migrações em ordem).
-- Cole TUDO no Supabase: SQL Editor → New query → Run. Use em um projeto NOVO.
-- Gerado a partir de supabase/migrations/ (não edite à mão: rode npm run sql:completo).
-- =============================================================================

-- >>> 20261005000001_schema.sql
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


-- >>> 20261005000002_security.sql
-- =============================================================================
-- Junto — segurança
-- Princípio: o app nunca escreve diretamente nas tabelas sensíveis.
-- Leitura: Row Level Security (somente membros ativos da lista).
-- Escrita: funções RPC (20261005000003_rpc.sql) que validam permissão.
-- Conhecer o ID de uma lista NÃO dá acesso a ela.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Funções auxiliares (security definer para não recursar nas policies)
-- ---------------------------------------------------------------------------
create or replace function public.is_list_member(p_list_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.list_members m
    where m.list_id = p_list_id and m.user_id = auth.uid() and m.status = 'active'
  );
$$;

create or replace function public.has_list_permission(p_list_id uuid, p_permission text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.list_members m
    join public.role_permissions rp on rp.role_id = m.role_id
    where m.list_id = p_list_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and rp.permission_id = p_permission
  );
$$;

-- Outro usuário é visível se divide uma lista ativa comigo, ou se pediu para entrar
-- numa lista em que posso aprovar convites.
create or replace function public.can_see_profile(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select p_user_id = auth.uid()
    or exists (
      select 1
      from public.list_members me
      join public.list_members other on other.list_id = me.list_id
      where me.user_id = auth.uid() and me.status = 'active'
        and other.user_id = p_user_id
        and (
          other.status in ('active', 'left', 'removed')
          or (other.status = 'pending' and exists (
                select 1 from public.role_permissions rp
                where rp.role_id = me.role_id and rp.permission_id = 'member.invite'))
        )
    );
$$;

-- ---------------------------------------------------------------------------
-- Perfil criado automaticamente no cadastro
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_name text;
begin
  v_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'name', '')), '');
  if v_name is null then
    v_name := split_part(coalesce(new.email, 'Usuário'), '@', 1);
  end if;
  insert into public.profiles (id, name) values (new.id, left(v_name, 80))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Habilita RLS em tudo
-- ---------------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.roles             enable row level security;
alter table public.permissions       enable row level security;
alter table public.role_permissions  enable row level security;
alter table public.categories        enable row level security;
alter table public.shopping_lists    enable row level security;
alter table public.list_members      enable row level security;
alter table public.list_invites      enable row level security;
alter table public.invite_attempts   enable row level security;
alter table public.products          enable row level security;
alter table public.approval_requests enable row level security;
alter table public.messages          enable row level security;
alter table public.notifications     enable row level security;
alter table public.push_tokens       enable row level security;
alter table public.activity_log      enable row level security;
alter table public.purchase_history  enable row level security;

-- Nada para anônimos.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- Escrita direta só onde é explicitamente permitida abaixo.
revoke insert, update, delete, truncate on all tables in schema public from authenticated;
grant select on all tables in schema public to authenticated;

-- ---------------------------------------------------------------------------
-- Policies de leitura
-- ---------------------------------------------------------------------------
create policy "perfil visível para quem divide lista"
  on public.profiles for select to authenticated
  using (public.can_see_profile(id));

create policy "catálogos legíveis" on public.roles            for select to authenticated using (true);
create policy "catálogos legíveis" on public.permissions      for select to authenticated using (true);
create policy "catálogos legíveis" on public.role_permissions for select to authenticated using (true);
create policy "catálogos legíveis" on public.categories       for select to authenticated using (true);

create policy "membros veem a lista"
  on public.shopping_lists for select to authenticated
  using (public.is_list_member(id));

create policy "membros veem membros; usuário vê o próprio pedido"
  on public.list_members for select to authenticated
  using (user_id = auth.uid() or public.is_list_member(list_id));

create policy "admins veem convites"
  on public.list_invites for select to authenticated
  using (public.has_list_permission(list_id, 'member.invite'));

-- invite_attempts: sem policy de leitura (apenas funções internas).

create policy "membros veem produtos"
  on public.products for select to authenticated
  using (public.is_list_member(list_id));

create policy "membros veem aprovações"
  on public.approval_requests for select to authenticated
  using (public.is_list_member(list_id));

create policy "membros veem mensagens"
  on public.messages for select to authenticated
  using (public.is_list_member(list_id));

create policy "usuário vê as próprias notificações"
  on public.notifications for select to authenticated
  using (user_id = auth.uid());

create policy "usuário vê os próprios tokens"
  on public.push_tokens for select to authenticated
  using (user_id = auth.uid());

create policy "membros veem o histórico"
  on public.activity_log for select to authenticated
  using (public.is_list_member(list_id));

create policy "membros veem o resumo da compra"
  on public.purchase_history for select to authenticated
  using (public.is_list_member(list_id));

-- ---------------------------------------------------------------------------
-- Escritas diretas permitidas (somente colunas inofensivas)
-- ---------------------------------------------------------------------------
-- Perfil: o usuário edita nome, foto e preferência de push.
grant update (name, avatar_url, push_enabled) on public.profiles to authenticated;
create policy "usuário edita o próprio perfil"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Lista: quem tem list.update edita dados descritivos (status/dono só por RPC).
grant update (name, description, note, purchase_date) on public.shopping_lists to authenticated;
create policy "editar dados da lista"
  on public.shopping_lists for update to authenticated
  using (public.has_list_permission(id, 'list.update'))
  with check (public.has_list_permission(id, 'list.update'));

-- Lista: exclusão por quem tem list.delete.
grant delete on public.shopping_lists to authenticated;
create policy "excluir lista"
  on public.shopping_lists for delete to authenticated
  using (public.has_list_permission(id, 'list.delete'));

-- Notificações: marcar como lida.
grant update (read_at) on public.notifications to authenticated;
create policy "marcar notificação como lida"
  on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Push tokens: remover os próprios (logout).
grant delete on public.push_tokens to authenticated;
create policy "remover os próprios tokens"
  on public.push_tokens for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Resumo de cada lista (quantidades e totais). security_invoker → respeita RLS.
-- Itens "contáveis": pendente, em análise, aprovado, comprado.
-- ---------------------------------------------------------------------------
create or replace view public.list_summaries
with (security_invoker = true) as
select
  l.id as list_id,
  count(p.id) filter (where p.status in ('pending', 'in_review', 'approved', 'purchased'))::int as items_count,
  count(p.id) filter (where p.status = 'purchased')::int as purchased_count,
  coalesce(sum(p.quantity * coalesce(p.estimated_price, p.actual_price, 0))
    filter (where p.status in ('pending', 'in_review', 'approved', 'purchased')), 0)::numeric(12, 2) as total_estimated,
  coalesce(sum(p.quantity * coalesce(p.actual_price, p.estimated_price, 0))
    filter (where p.status in ('pending', 'in_review', 'approved', 'purchased')), 0)::numeric(12, 2) as total_updated,
  coalesce(sum(p.quantity * coalesce(p.actual_price, p.estimated_price, 0))
    filter (where p.status = 'purchased'), 0)::numeric(12, 2) as total_spent,
  count(p.id) filter (where p.status = 'awaiting_confirmation')::int as awaiting_count
from public.shopping_lists l
left join public.products p on p.list_id = l.id and p.deleted_at is null
group by l.id;

grant select on public.list_summaries to authenticated;


-- >>> 20261005000003_rpc.sql
-- =============================================================================
-- Junto — regras de negócio (RPC)
-- Todas as escritas do app passam por aqui. Cada função:
--   1. exige usuário autenticado;
--   2. valida permissão na lista (tabela role_permissions);
--   3. valida dados;
--   4. grava histórico (activity_log) e notificações.
-- Erros usam códigos estáveis em `message` (ex.: 'forbidden'), traduzidos no app.
-- =============================================================================

create schema if not exists private;
revoke all on schema private from public;

-- ---------------------------------------------------------------------------
-- Auxiliares internos (schema private: não exposto pela API)
-- ---------------------------------------------------------------------------
create or replace function private.require_user()
returns uuid language plpgsql stable as $$
declare v uuid := auth.uid();
begin
  if v is null then raise exception 'not_authenticated'; end if;
  return v;
end $$;

create or replace function private.has_permission(p_list_id uuid, p_user uuid, p_permission text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.list_members m
    join public.role_permissions rp on rp.role_id = m.role_id
    where m.list_id = p_list_id and m.user_id = p_user and m.status = 'active'
      and rp.permission_id = p_permission);
$$;

-- Lança 'forbidden' se o usuário não tiver a permissão; 'list_unavailable' se a lista
-- não existir ou não estiver ativa (quando p_require_active).
create or replace function private.require_permission(
  p_list_id uuid, p_permission text, p_require_active boolean default true)
returns void language plpgsql stable security definer set search_path = public as $$
declare v_status public.list_status;
begin
  if not private.has_permission(p_list_id, auth.uid(), p_permission) then
    raise exception 'forbidden';
  end if;
  if p_require_active then
    select status into v_status from public.shopping_lists where id = p_list_id;
    if v_status is distinct from 'active' then raise exception 'list_unavailable'; end if;
  end if;
end $$;

create or replace function private.display_name(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select name from public.profiles where id = p_user), 'Alguém');
$$;

create or replace function private.brl(p numeric)
returns text language sql immutable as $$
  select 'R$ ' || replace(to_char(coalesce(p, 0), 'FM999999990.00'), '.', ',');
$$;

create or replace function private.log(
  p_list_id uuid, p_actor uuid, p_action text,
  p_product_id uuid default null, p_product_name text default null, p_details jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.activity_log (list_id, actor_id, action, product_id, product_name, details)
  values (p_list_id, p_actor, p_action, p_product_id, p_product_name, coalesce(p_details, '{}'::jsonb));
$$;

-- Notifica todos os membros ativos (exceto o autor). Com p_permission, só quem a possui.
create or replace function private.notify_members(
  p_list_id uuid, p_actor uuid, p_type text, p_title text, p_body text,
  p_product_id uuid default null, p_data jsonb default '{}'::jsonb, p_permission text default null)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, list_id, product_id, actor_id, type, title, body, data)
  select m.user_id, p_list_id, p_product_id, p_actor, p_type, p_title, p_body,
         coalesce(p_data, '{}'::jsonb) || jsonb_build_object('list_id', p_list_id, 'product_id', p_product_id)
  from public.list_members m
  where m.list_id = p_list_id and m.status = 'active'
    and m.user_id is distinct from p_actor
    and (p_permission is null or exists (
      select 1 from public.role_permissions rp
      where rp.role_id = m.role_id and rp.permission_id = p_permission));
$$;

create or replace function private.notify_user(
  p_user uuid, p_list_id uuid, p_actor uuid, p_type text, p_title text, p_body text,
  p_product_id uuid default null, p_data jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, list_id, product_id, actor_id, type, title, body, data)
  values (p_user, p_list_id, p_product_id, p_actor, p_type, p_title, p_body,
          coalesce(p_data, '{}'::jsonb) || jsonb_build_object('list_id', p_list_id, 'product_id', p_product_id));
$$;

-- Sugere categoria pela palavra-chave mais longa contida no nome.
create or replace function private.suggest_category(p_name text)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((
    select c.id
    from public.categories c, unnest(c.keywords) k
    where lower(p_name) like '%' || k || '%'
    order by length(k) desc, c.sort_order
    limit 1), 'outros');
$$;

create or replace function private.new_invite_code()
returns text language plpgsql volatile set search_path = public, extensions as $$
declare
  letters constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ'; -- sem I/O para evitar confusão
  digits  constant text := '0123456789';
  b bytea := extensions.gen_random_bytes(8);
  code text := '';
  i int;
begin
  for i in 0..3 loop
    code := code || substr(letters, (get_byte(b, i) % 24) + 1, 1);
  end loop;
  code := code || '-';
  for i in 4..7 loop
    code := code || substr(digits, (get_byte(b, i) % 10) + 1, 1);
  end loop;
  return code;
end $$;

-- =============================================================================
-- LISTAS
-- =============================================================================
create or replace function public.create_list(
  p_name text, p_description text default null,
  p_purchase_date date default null, p_note text default null)
returns public.shopping_lists
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := private.require_user();
  v_list public.shopping_lists;
begin
  if p_name is null or char_length(btrim(p_name)) = 0 then raise exception 'invalid_input'; end if;

  insert into public.shopping_lists (name, description, note, purchase_date, owner_id)
  values (btrim(p_name), nullif(btrim(p_description), ''), nullif(btrim(p_note), ''), p_purchase_date, v_uid)
  returning * into v_list;

  insert into public.list_members (list_id, user_id, role_id, status, joined_at)
  values (v_list.id, v_uid, 'admin', 'active', now());

  perform private.log(v_list.id, v_uid, 'list_created');
  return v_list;
end $$;

create or replace function public.finalize_list(p_list_id uuid)
returns public.purchase_history
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := private.require_user();
  v_hist public.purchase_history;
  v_name text;
begin
  perform private.require_permission(p_list_id, 'list.close');

  insert into public.purchase_history (list_id, items_count, purchased_count, total_estimated, total_actual, completed_by)
  select p_list_id,
    count(*) filter (where status in ('pending', 'in_review', 'approved', 'purchased')),
    count(*) filter (where status = 'purchased'),
    coalesce(sum(quantity * coalesce(estimated_price, actual_price, 0)) filter (where status = 'purchased'), 0),
    coalesce(sum(quantity * coalesce(actual_price, estimated_price, 0)) filter (where status = 'purchased'), 0),
    v_uid
  from public.products where list_id = p_list_id and deleted_at is null
  on conflict (list_id) do update set
    items_count = excluded.items_count, purchased_count = excluded.purchased_count,
    total_estimated = excluded.total_estimated, total_actual = excluded.total_actual,
    completed_by = excluded.completed_by, completed_at = now()
  returning * into v_hist;

  -- Pedidos ainda pendentes deixam de fazer sentido.
  update public.approval_requests set status = 'cancelled' where list_id = p_list_id and status = 'pending';

  update public.shopping_lists set status = 'completed', completed_at = now()
  where id = p_list_id returning name into v_name;

  perform private.log(p_list_id, v_uid, 'list_completed', null, null,
    jsonb_build_object('total_actual', v_hist.total_actual, 'total_estimated', v_hist.total_estimated));
  perform private.notify_members(p_list_id, v_uid, 'list_completed', 'Compra concluída',
    private.display_name(v_uid) || ' finalizou “' || v_name || '” · ' || private.brl(v_hist.total_actual));
  return v_hist;
end $$;

create or replace function public.reopen_list(p_list_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := private.require_user();
begin
  perform private.require_permission(p_list_id, 'list.close', false);
  update public.shopping_lists set status = 'active', completed_at = null where id = p_list_id;
  delete from public.purchase_history where list_id = p_list_id;
  perform private.log(p_list_id, v_uid, 'list_reopened');
end $$;

-- =============================================================================
-- CONVITES E MEMBROS
-- =============================================================================
create or replace function public.create_invite(p_list_id uuid, p_ttl_hours int default 48)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := private.require_user();
  v_code text;
  v_exp timestamptz;
  v_try int := 0;
begin
  perform private.require_permission(p_list_id, 'member.invite');
  if p_ttl_hours is null or p_ttl_hours < 1 or p_ttl_hours > 168 then raise exception 'invalid_input'; end if;

  -- Reaproveita convite ainda válido (o QR não muda a cada abertura da tela).
  select code, expires_at into v_code, v_exp from public.list_invites
  where list_id = p_list_id and revoked_at is null and expires_at > now() + interval '1 hour'
  order by created_at desc limit 1;
  if v_code is not null then
    return jsonb_build_object('code', v_code, 'expires_at', v_exp);
  end if;

  v_exp := now() + make_interval(hours => p_ttl_hours);
  loop
    v_try := v_try + 1;
    v_code := private.new_invite_code();
    begin
      insert into public.list_invites (list_id, code, created_by, expires_at)
      values (p_list_id, v_code, v_uid, v_exp);
      exit;
    exception when unique_violation then
      if v_try >= 5 then raise; end if;
    end;
  end loop;

  perform private.log(p_list_id, v_uid, 'invite_created', null, null, jsonb_build_object('expires_at', v_exp));
  return jsonb_build_object('code', v_code, 'expires_at', v_exp);
end $$;

create or replace function public.revoke_invites(p_list_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := private.require_user();
begin
  perform private.require_permission(p_list_id, 'member.invite', false);
  update public.list_invites set revoked_at = now() where list_id = p_list_id and revoked_at is null;
  perform private.log(p_list_id, v_uid, 'invites_revoked');
end $$;

-- Retorna status em vez de lançar erro para que a tentativa fique registrada
-- (limite de 10 códigos inválidos por hora por usuário).
create or replace function public.request_join(p_code text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := private.require_user();
  v_clean text;
  v_inv public.list_invites;
  v_list public.shopping_lists;
  v_member public.list_members;
  v_fails int;
begin
  select count(*) into v_fails from public.invite_attempts
  where user_id = v_uid and not success and attempted_at > now() - interval '1 hour';
  if v_fails >= 10 then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  v_clean := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if v_clean ~ '^[A-Z]{4}[0-9]{4}$' then
    v_clean := substr(v_clean, 1, 4) || '-' || substr(v_clean, 5, 4);
    select * into v_inv from public.list_invites where code = v_clean;
  end if;

  if v_inv.id is null then
    insert into public.invite_attempts (user_id, success) values (v_uid, false);
    return jsonb_build_object('status', 'invalid');
  end if;

  insert into public.invite_attempts (user_id, success) values (v_uid, true);

  if v_inv.revoked_at is not null or v_inv.expires_at <= now() then
    return jsonb_build_object('status', 'expired');
  end if;

  select * into v_list from public.shopping_lists where id = v_inv.list_id;
  if v_list.status <> 'active' then
    return jsonb_build_object('status', 'list_unavailable');
  end if;

  select * into v_member from public.list_members where list_id = v_list.id and user_id = v_uid;
  if v_member.status = 'active' then
    return jsonb_build_object('status', 'already_member', 'list_id', v_list.id, 'list_name', v_list.name);
  elsif v_member.status = 'pending' then
    return jsonb_build_object('status', 'pending', 'list_name', v_list.name);
  elsif v_member.id is not null then
    update public.list_members set status = 'pending', role_id = 'participant', joined_at = null
    where id = v_member.id;
  else
    insert into public.list_members (list_id, user_id, role_id, status)
    values (v_list.id, v_uid, 'participant', 'pending');
  end if;

  update public.list_invites set uses = uses + 1 where id = v_inv.id;
  perform private.log(v_list.id, v_uid, 'join_requested');
  perform private.notify_members(v_list.id, v_uid, 'join_request', 'Nova solicitação para entrar',
    private.display_name(v_uid) || ' deseja participar de “' || v_list.name || '”.',
    null, jsonb_build_object('user_id', v_uid), 'member.invite');

  return jsonb_build_object('status', 'pending', 'list_name', v_list.name);
end $$;

create or replace function public.respond_join_request(p_list_id uuid, p_user_id uuid, p_accept boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := private.require_user();
  v_name text;
begin
  perform private.require_permission(p_list_id, 'member.invite');
  select name into v_name from public.shopping_lists where id = p_list_id;

  if p_accept then
    update public.list_members set status = 'active', joined_at = now(), role_id = 'participant'
    where list_id = p_list_id and user_id = p_user_id and status = 'pending';
  else
    update public.list_members set status = 'rejected'
    where list_id = p_list_id and user_id = p_user_id and status = 'pending';
  end if;
  if not found then raise exception 'request_not_found'; end if;

  -- O pedido foi tratado: some da central de quem podia aprovar.
  update public.notifications set read_at = coalesce(read_at, now())
  where list_id = p_list_id and type = 'join_request' and data ->> 'user_id' = p_user_id::text;

  if p_accept then
    perform private.log(p_list_id, p_user_id, 'member_joined', null, null, jsonb_build_object('approved_by', v_uid));
    perform private.notify_user(p_user_id, p_list_id, v_uid, 'join_accepted', 'Você entrou na lista',
      private.display_name(v_uid) || ' aceitou seu pedido para “' || v_name || '”.');
    -- avisa os demais (exceto quem aprovou e quem entrou)
    insert into public.notifications (user_id, list_id, actor_id, type, title, body, data)
    select m.user_id, p_list_id, p_user_id, 'member_joined', 'Novo participante',
           private.display_name(p_user_id) || ' entrou em “' || v_name || '”.',
           jsonb_build_object('list_id', p_list_id)
    from public.list_members m
    where m.list_id = p_list_id and m.status = 'active' and m.user_id not in (v_uid, p_user_id);
  else
    perform private.log(p_list_id, v_uid, 'join_rejected', null, null, jsonb_build_object('user_id', p_user_id));
    perform private.notify_user(p_user_id, p_list_id, v_uid, 'join_rejected', 'Pedido recusado',
      'Seu pedido para entrar em “' || v_name || '” não foi aceito.');
  end if;
end $$;

create or replace function public.remove_member(p_list_id uuid, p_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := private.require_user();
  v_owner uuid;
begin
  perform private.require_permission(p_list_id, 'member.remove', false);
  select owner_id into v_owner from public.shopping_lists where id = p_list_id;
  if p_user_id = v_owner or p_user_id = v_uid then raise exception 'forbidden'; end if;

  update public.list_members set status = 'removed'
  where list_id = p_list_id and user_id = p_user_id and status = 'active';
  if not found then raise exception 'member_not_found'; end if;

  perform private.log(p_list_id, v_uid, 'member_removed', null, null, jsonb_build_object('user_id', p_user_id));
  perform private.notify_members(p_list_id, v_uid, 'member_left', 'Participante removido',
    private.display_name(p_user_id) || ' não participa mais da lista.');
end $$;

create or replace function public.leave_list(p_list_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := private.require_user();
  v_owner uuid;
begin
  select owner_id into v_owner from public.shopping_lists where id = p_list_id;
  if v_owner = v_uid then raise exception 'owner_cannot_leave'; end if;

  update public.list_members set status = 'left'
  where list_id = p_list_id and user_id = v_uid and status in ('active', 'pending');
  if not found then raise exception 'member_not_found'; end if;

  perform private.log(p_list_id, v_uid, 'member_left');
  perform private.notify_members(p_list_id, v_uid, 'member_left', 'Alguém saiu da lista',
    private.display_name(v_uid) || ' saiu da lista.');
end $$;

create or replace function public.set_member_role(p_list_id uuid, p_user_id uuid, p_role_id text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := private.require_user();
  v_owner uuid;
begin
  perform private.require_permission(p_list_id, 'member.manage', false);
  if not exists (select 1 from public.roles where id = p_role_id) then raise exception 'invalid_input'; end if;
  select owner_id into v_owner from public.shopping_lists where id = p_list_id;
  if p_user_id = v_owner then raise exception 'forbidden'; end if;

  update public.list_members set role_id = p_role_id
  where list_id = p_list_id and user_id = p_user_id and status = 'active';
  if not found then raise exception 'member_not_found'; end if;
  perform private.log(p_list_id, v_uid, 'role_changed', null, null,
    jsonb_build_object('user_id', p_user_id, 'role_id', p_role_id));
end $$;

-- =============================================================================
-- PRODUTOS
-- =============================================================================
create or replace function public.add_product(
  p_list_id uuid, p_name text,
  p_quantity numeric default 1, p_unit text default 'un',
  p_category_id text default null, p_estimated_price numeric default null,
  p_note text default null, p_id uuid default null)
returns public.products
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := private.require_user();
  v_row public.products;
begin
  -- Idempotência: reenvio da fila offline não duplica o item.
  if p_id is not null then
    select * into v_row from public.products where id = p_id;
    if found then
      if v_row.list_id = p_list_id and v_row.added_by = v_uid then return v_row; end if;
      raise exception 'invalid_input';
    end if;
  end if;

  perform private.require_permission(p_list_id, 'product.create');
  if p_name is null or char_length(btrim(p_name)) = 0 then raise exception 'invalid_input'; end if;

  begin
    insert into public.products (id, list_id, name, quantity, unit, category_id, estimated_price, note, added_by, updated_by)
    values (coalesce(p_id, gen_random_uuid()), p_list_id, btrim(p_name), coalesce(p_quantity, 1), coalesce(p_unit, 'un'),
            coalesce(p_category_id, private.suggest_category(p_name)), p_estimated_price,
            nullif(btrim(p_note), ''), v_uid, v_uid)
    returning * into v_row;
  exception
    when check_violation or foreign_key_violation or not_null_violation then
      raise exception 'invalid_input';
  end;

  perform private.log(p_list_id, v_uid, 'product_added', v_row.id, v_row.name,
    jsonb_build_object('quantity', v_row.quantity, 'unit', v_row.unit));
  perform private.notify_members(p_list_id, v_uid, 'product_added', 'Novo item adicionado',
    '“' || v_row.name || '” foi adicionado à lista por ' || private.display_name(v_uid) || '.', v_row.id);
  return v_row;
end $$;

-- Atualização com merge de 3 vias.
--   p_patch: somente os campos alterados   {"actual_price": 27.9}
--   p_base : valores que o usuário via antes de editar {"actual_price": 25.0}
-- Se outro participante mudou o MESMO campo nesse meio-tempo (atual ≠ base e ≠ novo),
-- o campo NÃO é aplicado e volta em `conflicts` para o app perguntar o que manter.
-- Campos sem conflito são aplicados normalmente. Sem p_base → último a gravar vence.
create or replace function public.update_product(p_product_id uuid, p_patch jsonb, p_base jsonb default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := private.require_user();
  v_row public.products;
  v_new public.products;
  v_cur jsonb;
  v_key text;
  v_apply jsonb := '{}'::jsonb;
  v_conflicts jsonb := '[]'::jsonb;
  v_allowed constant text[] := array['name', 'quantity', 'unit', 'category_id', 'estimated_price',
                                     'actual_price', 'note', 'assigned_to', 'status'];
  v_status text;
  v_who text;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    raise exception 'invalid_input';
  end if;

  select * into v_row from public.products where id = p_product_id and deleted_at is null for update;
  if not found then raise exception 'product_not_found'; end if;
  if not public.is_list_member(v_row.list_id) then raise exception 'product_not_found'; end if;

  v_cur := to_jsonb(v_row);

  for v_key in select jsonb_object_keys(p_patch) loop
    if not (v_key = any (v_allowed)) then raise exception 'invalid_input'; end if;

    if v_key in ('estimated_price', 'actual_price') then
      perform private.require_permission(v_row.list_id, 'product.price');
    elsif v_key = 'status' then
      v_status := p_patch ->> 'status';
      if v_status not in ('pending', 'in_review', 'purchased', 'unavailable', 'cancelled') then
        raise exception 'invalid_status';
      end if;
      if v_row.status = 'awaiting_confirmation' then raise exception 'awaiting_confirmation'; end if;
      if v_status = 'purchased' or v_row.status = 'purchased' then
        perform private.require_permission(v_row.list_id, 'product.purchase');
      else
        perform private.require_permission(v_row.list_id, 'product.update');
      end if;
    else
      perform private.require_permission(v_row.list_id, 'product.update');
    end if;

    if p_base is not null and p_base ? v_key
       and (v_cur -> v_key) is distinct from (p_base -> v_key)
       and (v_cur -> v_key) is distinct from (p_patch -> v_key) then
      v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
        'field', v_key, 'yours', p_patch -> v_key, 'theirs', v_cur -> v_key, 'base', p_base -> v_key));
    elsif (v_cur -> v_key) is distinct from (p_patch -> v_key) then
      v_apply := v_apply || jsonb_build_object(v_key, p_patch -> v_key);
    end if;
  end loop;

  if v_apply ? 'assigned_to' and v_apply ->> 'assigned_to' is not null and not exists (
      select 1 from public.list_members
      where list_id = v_row.list_id and user_id = (v_apply ->> 'assigned_to')::uuid and status = 'active') then
    raise exception 'invalid_input';
  end if;

  if v_apply = '{}'::jsonb then
    return jsonb_build_object('status', case when jsonb_array_length(v_conflicts) > 0 then 'conflict' else 'ok' end,
                              'product', to_jsonb(v_row), 'conflicts', v_conflicts);
  end if;

  begin
    update public.products set
      name            = case when v_apply ? 'name' then btrim(v_apply ->> 'name') else name end,
      quantity        = case when v_apply ? 'quantity' then (v_apply ->> 'quantity')::numeric else quantity end,
      unit            = case when v_apply ? 'unit' then v_apply ->> 'unit' else unit end,
      category_id     = case when v_apply ? 'category_id' then v_apply ->> 'category_id' else category_id end,
      estimated_price = case when v_apply ? 'estimated_price' then (v_apply ->> 'estimated_price')::numeric else estimated_price end,
      actual_price    = case when v_apply ? 'actual_price' then (v_apply ->> 'actual_price')::numeric else actual_price end,
      note            = case when v_apply ? 'note' then nullif(btrim(v_apply ->> 'note'), '') else note end,
      assigned_to     = case when v_apply ? 'assigned_to' then (v_apply ->> 'assigned_to')::uuid else assigned_to end,
      status          = case when v_apply ? 'status' then (v_apply ->> 'status')::public.product_status else status end,
      purchased_by    = case when v_apply ? 'status' then
                          case when v_apply ->> 'status' = 'purchased' then v_uid else null end
                        else purchased_by end,
      purchased_at    = case when v_apply ? 'status' then
                          case when v_apply ->> 'status' = 'purchased' then now() else null end
                        else purchased_at end,
      version         = version + 1,
      updated_by      = v_uid
    where id = p_product_id
    returning * into v_new;
  exception
    when check_violation or foreign_key_violation or not_null_violation
      or invalid_text_representation or numeric_value_out_of_range then
      raise exception 'invalid_input';
  end;

  v_who := private.display_name(v_uid);

  if v_apply ? 'actual_price' or v_apply ? 'estimated_price' then
    perform private.log(v_new.list_id, v_uid, 'price_changed', v_new.id, v_new.name, jsonb_build_object(
      'estimated_from', v_row.estimated_price, 'estimated_to', v_new.estimated_price,
      'actual_from', v_row.actual_price, 'actual_to', v_new.actual_price));
    perform private.notify_members(v_new.list_id, v_uid, 'price_changed', 'Preço alterado',
      v_who || ' alterou o preço de “' || v_new.name || '” para '
        || private.brl(coalesce(v_new.actual_price, v_new.estimated_price)) || '.', v_new.id);
  end if;

  if v_apply ? 'status' then
    if v_new.status = 'purchased' then
      perform private.log(v_new.list_id, v_uid, 'product_purchased', v_new.id, v_new.name);
      perform private.notify_members(v_new.list_id, v_uid, 'product_purchased', 'Item comprado',
        v_who || ' marcou “' || v_new.name || '” como comprado.', v_new.id);
    elsif v_row.status = 'purchased' then
      perform private.log(v_new.list_id, v_uid, 'product_unpurchased', v_new.id, v_new.name);
    else
      perform private.log(v_new.list_id, v_uid, 'status_changed', v_new.id, v_new.name,
        jsonb_build_object('from', v_row.status, 'to', v_new.status));
    end if;
  end if;

  if v_apply - array['actual_price', 'estimated_price', 'status'] <> '{}'::jsonb then
    perform private.log(v_new.list_id, v_uid, 'product_updated', v_new.id, v_new.name,
      jsonb_build_object('fields', (select jsonb_agg(k) from jsonb_object_keys(
        v_apply - array['actual_price', 'estimated_price', 'status']) k)));
  end if;

  return jsonb_build_object('status', case when jsonb_array_length(v_conflicts) > 0 then 'conflict' else 'ok' end,
                            'product', to_jsonb(v_new), 'conflicts', v_conflicts);
end $$;

-- Remoção lógica: administradores removem qualquer item; participantes, os que adicionaram.
create or replace function public.delete_product(p_product_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := private.require_user();
  v_row public.products;
begin
  select * into v_row from public.products where id = p_product_id and deleted_at is null for update;
  if not found or not public.is_list_member(v_row.list_id) then raise exception 'product_not_found'; end if;

  if not private.has_permission(v_row.list_id, v_uid, 'product.delete')
     and not (v_row.added_by = v_uid and private.has_permission(v_row.list_id, v_uid, 'product.create')) then
    raise exception 'forbidden';
  end if;
  perform private.require_permission(v_row.list_id, 'product.create');

  update public.products set deleted_at = now(), version = version + 1, updated_by = v_uid where id = p_product_id;
  update public.approval_requests set status = 'cancelled' where product_id = p_product_id and status = 'pending';

  perform private.log(v_row.list_id, v_uid, 'product_removed', v_row.id, v_row.name);
  perform private.notify_members(v_row.list_id, v_uid, 'product_removed', 'Item removido',
    private.display_name(v_uid) || ' removeu “' || v_row.name || '”.', v_row.id);
end $$;

-- =============================================================================
-- PERGUNTAR AO PARCEIRO
-- =============================================================================
create or replace function private.require_partner(p_list_id uuid, p_uid uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.list_members m
    join public.role_permissions rp on rp.role_id = m.role_id and rp.permission_id = 'approval.respond'
    where m.list_id = p_list_id and m.status = 'active' and m.user_id <> p_uid) then
    raise exception 'no_partner';
  end if;
end $$;

-- Produto encontrado fora da lista.
create or replace function public.ask_partner(
  p_list_id uuid, p_name text, p_price numeric default null,
  p_quantity numeric default 1, p_unit text default 'un',
  p_category_id text default null, p_message text default null, p_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := private.require_user();
  v_prod public.products;
  v_req public.approval_requests;
begin
  if p_id is not null then
    select * into v_prod from public.products where id = p_id;
    if found then
      if v_prod.list_id <> p_list_id or v_prod.added_by <> v_uid then raise exception 'invalid_input'; end if;
      select * into v_req from public.approval_requests where product_id = p_id order by created_at desc limit 1;
      return jsonb_build_object('product', to_jsonb(v_prod), 'request', to_jsonb(v_req));
    end if;
  end if;

  perform private.require_permission(p_list_id, 'approval.request');
  perform private.require_partner(p_list_id, v_uid);
  if p_name is null or char_length(btrim(p_name)) = 0 then raise exception 'invalid_input'; end if;

  begin
    insert into public.products (id, list_id, name, quantity, unit, category_id, estimated_price, actual_price,
                                 status, added_by, updated_by)
    values (coalesce(p_id, gen_random_uuid()), p_list_id, btrim(p_name), coalesce(p_quantity, 1), coalesce(p_unit, 'un'),
            coalesce(p_category_id, private.suggest_category(p_name)), p_price, p_price,
            'awaiting_confirmation', v_uid, v_uid)
    returning * into v_prod;

    insert into public.approval_requests (list_id, product_id, requested_by, price, message, is_new_product)
    values (p_list_id, v_prod.id, v_uid, p_price, nullif(btrim(p_message), ''), true)
    returning * into v_req;
  exception
    when check_violation or foreign_key_violation or not_null_violation then
      raise exception 'invalid_input';
  end;

  perform private.log(p_list_id, v_uid, 'approval_requested', v_prod.id, v_prod.name,
    jsonb_build_object('price', p_price, 'request_id', v_req.id));
  perform private.notify_members(p_list_id, v_uid, 'approval_request',
    private.display_name(v_uid) || ' encontrou “' || v_prod.name || '”',
    case when p_price is not null then 'Por ' || private.brl(p_price) || '. ' else '' end
      || 'Deseja adicionar este produto à compra?',
    v_prod.id, jsonb_build_object('request_id', v_req.id), 'approval.respond');

  return jsonb_build_object('product', to_jsonb(v_prod), 'request', to_jsonb(v_req));
end $$;

-- Pergunta sobre um item que já está na lista (marca, preço, substituto...).
create or replace function public.ask_about_product(p_product_id uuid, p_price numeric default null, p_message text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := private.require_user();
  v_prod public.products;
  v_req public.approval_requests;
begin
  select * into v_prod from public.products where id = p_product_id and deleted_at is null for update;
  if not found or not public.is_list_member(v_prod.list_id) then raise exception 'product_not_found'; end if;
  perform private.require_permission(v_prod.list_id, 'approval.request');
  perform private.require_partner(v_prod.list_id, v_uid);
  if v_prod.status not in ('pending', 'in_review', 'approved') then raise exception 'invalid_status'; end if;
  if p_price is not null and p_price < 0 then raise exception 'invalid_input'; end if;

  update public.products set status = 'awaiting_confirmation',
    actual_price = coalesce(p_price, actual_price), version = version + 1, updated_by = v_uid
  where id = p_product_id returning * into v_prod;

  insert into public.approval_requests (list_id, product_id, requested_by, price, message, is_new_product)
  values (v_prod.list_id, v_prod.id, v_uid, p_price, nullif(btrim(p_message), ''), false)
  returning * into v_req;

  perform private.log(v_prod.list_id, v_uid, 'approval_requested', v_prod.id, v_prod.name,
    jsonb_build_object('price', p_price, 'request_id', v_req.id));
  perform private.notify_members(v_prod.list_id, v_uid, 'approval_request',
    private.display_name(v_uid) || ' perguntou sobre “' || v_prod.name || '”',
    case when p_price is not null then 'Por ' || private.brl(p_price) || '. ' else '' end
      || coalesce(nullif(btrim(p_message), ''), 'Pode comprar?'),
    v_prod.id, jsonb_build_object('request_id', v_req.id), 'approval.respond');

  return jsonb_build_object('product', to_jsonb(v_prod), 'request', to_jsonb(v_req));
end $$;

create or replace function public.respond_approval(p_request_id uuid, p_approve boolean, p_note text default null)
returns public.approval_requests
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := private.require_user();
  v_req public.approval_requests;
  v_prod public.products;
  v_who text;
begin
  select * into v_req from public.approval_requests where id = p_request_id for update;
  if not found or not public.is_list_member(v_req.list_id) then raise exception 'request_not_found'; end if;
  perform private.require_permission(v_req.list_id, 'approval.respond');
  if v_req.status <> 'pending' then raise exception 'already_answered'; end if;
  if v_req.requested_by = v_uid then raise exception 'cannot_respond_own'; end if;

  update public.approval_requests set
    status = case when p_approve then 'approved'::public.approval_status else 'rejected'::public.approval_status end,
    responded_by = v_uid, responded_at = now(), response_note = nullif(btrim(p_note), '')
  where id = p_request_id returning * into v_req;

  update public.products set
    status = case when p_approve then 'approved'::public.product_status else 'rejected'::public.product_status end,
    version = version + 1, updated_by = v_uid
  where id = v_req.product_id and status = 'awaiting_confirmation'
  returning * into v_prod;
  if v_prod.id is null then select * into v_prod from public.products where id = v_req.product_id; end if;

  -- A resposta fica registrada no chat do produto.
  if nullif(btrim(p_note), '') is not null then
    insert into public.messages (list_id, product_id, sender_id, body)
    values (v_req.list_id, v_req.product_id, v_uid, btrim(p_note));
  end if;

  -- O pedido foi respondido: deixa de aparecer como pendente para os demais.
  update public.notifications set read_at = coalesce(read_at, now())
  where type = 'approval_request' and data ->> 'request_id' = p_request_id::text;

  v_who := private.display_name(v_uid);
  perform private.log(v_req.list_id, v_uid, case when p_approve then 'approval_approved' else 'approval_rejected' end,
    v_prod.id, v_prod.name, jsonb_build_object('request_id', v_req.id));
  if v_req.requested_by is not null then
    perform private.notify_user(v_req.requested_by, v_req.list_id, v_uid,
      case when p_approve then 'approval_approved' else 'approval_rejected' end,
      case when p_approve then '✅ Aprovado' else '❌ Recusado' end,
      v_who || case when p_approve then ' aprovou “' else ' recusou “' end || v_prod.name || '”.'
        || coalesce(' “' || nullif(btrim(p_note), '') || '”', ''),
      v_prod.id, jsonb_build_object('request_id', v_req.id));
  end if;
  return v_req;
end $$;

create or replace function public.cancel_approval(p_request_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := private.require_user();
  v_req public.approval_requests;
begin
  select * into v_req from public.approval_requests where id = p_request_id for update;
  if not found or not public.is_list_member(v_req.list_id) then raise exception 'request_not_found'; end if;
  if v_req.requested_by <> v_uid and not private.has_permission(v_req.list_id, v_uid, 'product.delete') then
    raise exception 'forbidden';
  end if;
  if v_req.status <> 'pending' then raise exception 'already_answered'; end if;

  update public.approval_requests set status = 'cancelled' where id = p_request_id;
  update public.products set
    status = case when v_req.is_new_product then 'cancelled'::public.product_status else 'pending'::public.product_status end,
    version = version + 1, updated_by = v_uid
  where id = v_req.product_id and status = 'awaiting_confirmation';
  update public.notifications set read_at = coalesce(read_at, now())
  where type = 'approval_request' and data ->> 'request_id' = p_request_id::text;
  perform private.log(v_req.list_id, v_uid, 'approval_cancelled', v_req.product_id, null);
end $$;

-- =============================================================================
-- CHAT
-- =============================================================================
create or replace function public.send_message(
  p_list_id uuid, p_body text, p_product_id uuid default null, p_id uuid default null)
returns public.messages
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := private.require_user();
  v_msg public.messages;
  v_prod_name text;
  v_list_name text;
begin
  if p_id is not null then
    select * into v_msg from public.messages where id = p_id;
    if found then
      if v_msg.sender_id = v_uid and v_msg.list_id = p_list_id then return v_msg; end if;
      raise exception 'invalid_input';
    end if;
  end if;

  perform private.require_permission(p_list_id, 'chat.send');
  if p_body is null or char_length(btrim(p_body)) = 0 or char_length(p_body) > 2000 then
    raise exception 'invalid_input';
  end if;
  if p_product_id is not null then
    select name into v_prod_name from public.products where id = p_product_id and list_id = p_list_id;
    if v_prod_name is null then raise exception 'product_not_found'; end if;
  end if;

  insert into public.messages (id, list_id, product_id, sender_id, body)
  values (coalesce(p_id, gen_random_uuid()), p_list_id, p_product_id, v_uid, btrim(p_body))
  returning * into v_msg;

  select name into v_list_name from public.shopping_lists where id = p_list_id;
  perform private.notify_members(p_list_id, v_uid, 'message',
    private.display_name(v_uid) || ' · ' || coalesce(v_prod_name, v_list_name),
    left(v_msg.body, 140), p_product_id, jsonb_build_object('message_id', v_msg.id));
  return v_msg;
end $$;

-- =============================================================================
-- NOTIFICAÇÕES, PUSH E CONTA
-- =============================================================================
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := private.require_user();
  v_count int;
begin
  update public.notifications set read_at = now()
  where user_id = v_uid and read_at is null and (p_ids is null or id = any (p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end $$;

create or replace function public.register_push_token(p_token text, p_platform text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := private.require_user();
begin
  if p_token is null or p_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_\-]+\]$' then raise exception 'invalid_input'; end if;
  if p_platform not in ('ios', 'android', 'web') then raise exception 'invalid_input'; end if;
  -- Um aparelho pertence a um usuário por vez (troca de conta no mesmo celular).
  insert into public.push_tokens (user_id, token, platform) values (v_uid, p_token, p_platform)
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, last_seen_at = now();
end $$;

-- LGPD: exclusão da conta. Listas próprias são transferidas ao participante mais antigo
-- ou excluídas se não houver ninguém. Mensagens e histórico ficam anônimos (autor nulo).
create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := private.require_user();
  r record;
  v_next uuid;
begin
  for r in select id from public.shopping_lists where owner_id = v_uid loop
    select user_id into v_next from public.list_members
    where list_id = r.id and status = 'active' and user_id <> v_uid
    order by joined_at nulls last, created_at limit 1;
    if v_next is null then
      delete from public.shopping_lists where id = r.id;
    else
      update public.shopping_lists set owner_id = v_next where id = r.id;
      update public.list_members set role_id = 'admin' where list_id = r.id and user_id = v_next;
      perform private.log(r.id, null, 'owner_transferred', null, null, jsonb_build_object('to', v_next));
    end if;
  end loop;
  delete from auth.users where id = v_uid; -- cascata para profiles e dados pessoais
end $$;

-- ---------------------------------------------------------------------------
-- Execução: somente usuários autenticados; nada para anônimos.
-- ---------------------------------------------------------------------------
revoke all on all functions in schema public from public, anon;
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function
  public.is_list_member(uuid),
  public.has_list_permission(uuid, text),
  public.can_see_profile(uuid),
  public.create_list(text, text, date, text),
  public.finalize_list(uuid),
  public.reopen_list(uuid),
  public.create_invite(uuid, int),
  public.revoke_invites(uuid),
  public.request_join(text),
  public.respond_join_request(uuid, uuid, boolean),
  public.remove_member(uuid, uuid),
  public.leave_list(uuid),
  public.set_member_role(uuid, uuid, text),
  public.add_product(uuid, text, numeric, text, text, numeric, text, uuid),
  public.update_product(uuid, jsonb, jsonb),
  public.delete_product(uuid),
  public.ask_partner(uuid, text, numeric, numeric, text, text, text, uuid),
  public.ask_about_product(uuid, numeric, text),
  public.respond_approval(uuid, boolean, text),
  public.cancel_approval(uuid),
  public.send_message(uuid, text, uuid, uuid),
  public.mark_notifications_read(uuid[]),
  public.register_push_token(text, text),
  public.delete_my_account()
to authenticated;


-- >>> 20261005000004_realtime_push_storage.sql
-- =============================================================================
-- Junto — tempo real, push e armazenamento de fotos de perfil
-- Os blocos verificam se os recursos do Supabase existem, para que a migração
-- também rode em um Postgres puro (testes automatizados).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Realtime: tabelas transmitidas (o Supabase aplica RLS por assinante)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  alter publication supabase_realtime add table
    public.shopping_lists,
    public.list_members,
    public.products,
    public.approval_requests,
    public.messages,
    public.notifications,
    public.activity_log;
end $$;

-- ---------------------------------------------------------------------------
-- Push: cada notificação inserida dispara a Edge Function `send-push` via pg_net.
-- URL e segredo ficam no Vault (veja docs/NOTIFICACOES.md). Falha de push nunca
-- bloqueia a operação principal.
-- ---------------------------------------------------------------------------
create or replace function private.dispatch_push()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_url text;
  v_secret text;
begin
  if to_regnamespace('net') is null or to_regclass('vault.decrypted_secrets') is null then
    return new;
  end if;
  execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'push_function_url'$q$ into v_url;
  execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'push_webhook_secret'$q$ into v_secret;
  if v_url is null or v_secret is null then
    return new;
  end if;
  execute $q$select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 5000)$q$
    using v_url,
          jsonb_build_object('notification_id', new.id),
          jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret);
  return new;
exception when others then
  raise warning 'junto: falha ao enfileirar push: %', sqlerrm;
  return new;
end $$;

create trigger notifications_dispatch_push
  after insert on public.notifications
  for each row execute function private.dispatch_push();

-- ---------------------------------------------------------------------------
-- Storage: avatares. Cada usuário só escreve na própria pasta e o arquivo recebe
-- um nome aleatório (avatars/<user_id>/<uuid>.jpg). A URL só é exposta pelo perfil,
-- que por RLS é visível apenas a quem divide lista com o usuário.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;

    execute $p$create policy "avatar: dono envia" on storage.objects for insert to authenticated
      with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
    execute $p$create policy "avatar: dono atualiza" on storage.objects for update to authenticated
      using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
    execute $p$create policy "avatar: dono remove" on storage.objects for delete to authenticated
      using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  end if;
end $$;


-- >>> 20261005000005_fixes.sql
-- =============================================================================
-- Junto — correções pós-revisão
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Storage: o app lista a própria pasta para apagar fotos antigas e, na exclusão
-- da conta (LGPD), remover todas. Sem política de SELECT, `list()` volta vazio
-- e os arquivos ficavam para sempre no bucket.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.objects') is not null
     and not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'avatar: dono lista') then
    execute $p$create policy "avatar: dono lista" on storage.objects for select to authenticated
      using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Foto de perfil: aceita também http:// para o Supabase local (http://127.0.0.1:54321).
-- Continua exigindo arquivo do próprio usuário no bucket `avatars`.
-- ---------------------------------------------------------------------------
do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.profiles'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) like '%avatar_url%' loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.profiles add constraint profiles_avatar_url_check check (
  avatar_url is null or (
    char_length(avatar_url) <= 1000
    and avatar_url ~ ('^https?://[^/?#]+/storage/v1/object/public/avatars/' || id::text || '/[^/?#]+$')
  )
);

-- ---------------------------------------------------------------------------
-- Manutenção automática (gratuita): limpa dados que só crescem.
-- Usa pg_cron quando disponível (Supabase: Database → Extensions → pg_cron).
-- ---------------------------------------------------------------------------
create or replace function private.cleanup_old_data()
returns void
language sql security definer set search_path = public
as $$
  delete from public.invite_attempts where attempted_at < now() - interval '7 days';
  delete from public.list_invites where expires_at < now() - interval '30 days';
  delete from public.notifications where read_at is not null and created_at < now() - interval '90 days';
$$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('junto-cleanup', '30 3 * * *', 'select private.cleanup_old_data()');
  end if;
exception when others then
  raise notice 'junto: pg_cron indisponível, limpeza automática não agendada (%).', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- Keep-alive: projetos do plano gratuito do Supabase pausam após ~7 dias sem
-- uso. O workflow .github/workflows/keepalive.yml chama esta função 2x/semana.
-- Não expõe dados: só confirma que o banco respondeu.
-- ---------------------------------------------------------------------------
create or replace function public.keepalive()
returns text
language sql stable
as $$ select 'ok'::text $$;

revoke all on function public.keepalive() from public;
grant execute on function public.keepalive() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Responder a um pedido de entrada é idempotente: se outro administrador (ou o
-- mesmo, por outra tela) já aceitou/recusou, a segunda resposta não gera erro —
-- antes a pessoa entrava normalmente, mas quem aprovou via "request_not_found".
-- ---------------------------------------------------------------------------
create or replace function public.respond_join_request(p_list_id uuid, p_user_id uuid, p_accept boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := private.require_user();
  v_name text;
  v_status text;
begin
  perform private.require_permission(p_list_id, 'member.invite');
  select name into v_name from public.shopping_lists where id = p_list_id;

  select status into v_status from public.list_members
  where list_id = p_list_id and user_id = p_user_id
  for update;

  if v_status is null then raise exception 'request_not_found'; end if;

  -- Já resolvido no mesmo sentido: só garante que o aviso suma.
  if (p_accept and v_status = 'active') or (not p_accept and v_status = 'rejected') then
    update public.notifications set read_at = coalesce(read_at, now())
    where list_id = p_list_id and type = 'join_request' and data ->> 'user_id' = p_user_id::text;
    return;
  end if;
  if v_status <> 'pending' then raise exception 'request_not_found'; end if;

  if p_accept then
    update public.list_members set status = 'active', joined_at = now(), role_id = 'participant'
    where list_id = p_list_id and user_id = p_user_id;
  else
    update public.list_members set status = 'rejected'
    where list_id = p_list_id and user_id = p_user_id;
  end if;

  update public.notifications set read_at = coalesce(read_at, now())
  where list_id = p_list_id and type = 'join_request' and data ->> 'user_id' = p_user_id::text;

  if p_accept then
    perform private.log(p_list_id, p_user_id, 'member_joined', null, null, jsonb_build_object('approved_by', v_uid));
    perform private.notify_user(p_user_id, p_list_id, v_uid, 'join_accepted', 'Você entrou na lista',
      private.display_name(v_uid) || ' aceitou seu pedido para “' || v_name || '”.');
    insert into public.notifications (user_id, list_id, actor_id, type, title, body, data)
    select m.user_id, p_list_id, p_user_id, 'member_joined', 'Novo participante',
           private.display_name(p_user_id) || ' entrou em “' || v_name || '”.',
           jsonb_build_object('list_id', p_list_id)
    from public.list_members m
    where m.list_id = p_list_id and m.status = 'active' and m.user_id not in (v_uid, p_user_id);
  else
    perform private.log(p_list_id, v_uid, 'join_rejected', null, null, jsonb_build_object('user_id', p_user_id));
    perform private.notify_user(p_user_id, p_list_id, v_uid, 'join_rejected', 'Pedido recusado',
      'Seu pedido para entrar em “' || v_name || '” não foi aceito.');
  end if;
end $$;


-- >>> 20261005000006_optional_unit.sql
-- =============================================================================
-- Junto — unidade de medida opcional
-- O item pode ser adicionado sem unidade ("2 pães", "Detergente"). Quando informada,
-- vale uma das sugeridas (un, kg, g, L, ml, pct, cx, dz) ou um texto curto livre
-- ("Outros": maço, bandeja, rolo...).
-- =============================================================================

alter table public.products alter column unit drop default;
alter table public.products alter column unit drop not null;

do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.products'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) like '%unit%' loop
    execute format('alter table public.products drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.products add constraint products_unit_check
  check (unit is null or char_length(unit) between 1 and 15);

-- Normaliza em qualquer caminho de escrita (adicionar, editar, fila offline):
-- texto vazio vira "sem unidade".
create or replace function private.normalize_product_unit()
returns trigger
language plpgsql
as $$
begin
  new.unit := nullif(btrim(new.unit), '');
  return new;
end $$;

drop trigger if exists products_normalize_unit on public.products;
create trigger products_normalize_unit
  before insert or update of unit on public.products
  for each row execute function private.normalize_product_unit();

-- add_product / ask_partner: sem unidade informada, o item fica sem unidade
-- (antes era forçado "un").
create or replace function public.add_product(
  p_list_id uuid, p_name text,
  p_quantity numeric default 1, p_unit text default null,
  p_category_id text default null, p_estimated_price numeric default null,
  p_note text default null, p_id uuid default null)
returns public.products
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := private.require_user();
  v_row public.products;
begin
  -- Idempotência: reenvio da fila offline não duplica o item.
  if p_id is not null then
    select * into v_row from public.products where id = p_id;
    if found then
      if v_row.list_id = p_list_id and v_row.added_by = v_uid then return v_row; end if;
      raise exception 'invalid_input';
    end if;
  end if;

  perform private.require_permission(p_list_id, 'product.create');
  if p_name is null or char_length(btrim(p_name)) = 0 then raise exception 'invalid_input'; end if;

  begin
    insert into public.products (id, list_id, name, quantity, unit, category_id, estimated_price, note, added_by, updated_by)
    values (coalesce(p_id, gen_random_uuid()), p_list_id, btrim(p_name), coalesce(p_quantity, 1), nullif(btrim(p_unit), ''),
            coalesce(p_category_id, private.suggest_category(p_name)), p_estimated_price,
            nullif(btrim(p_note), ''), v_uid, v_uid)
    returning * into v_row;
  exception
    when check_violation or foreign_key_violation or not_null_violation then
      raise exception 'invalid_input';
  end;

  perform private.log(p_list_id, v_uid, 'product_added', v_row.id, v_row.name,
    jsonb_build_object('quantity', v_row.quantity, 'unit', v_row.unit));
  perform private.notify_members(p_list_id, v_uid, 'product_added', 'Novo item adicionado',
    '“' || v_row.name || '” foi adicionado à lista por ' || private.display_name(v_uid) || '.', v_row.id);
  return v_row;
end $$;

create or replace function public.ask_partner(
  p_list_id uuid, p_name text, p_price numeric default null,
  p_quantity numeric default 1, p_unit text default null,
  p_category_id text default null, p_message text default null, p_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := private.require_user();
  v_prod public.products;
  v_req public.approval_requests;
begin
  if p_id is not null then
    select * into v_prod from public.products where id = p_id;
    if found then
      if v_prod.list_id <> p_list_id or v_prod.added_by <> v_uid then raise exception 'invalid_input'; end if;
      select * into v_req from public.approval_requests where product_id = p_id order by created_at desc limit 1;
      return jsonb_build_object('product', to_jsonb(v_prod), 'request', to_jsonb(v_req));
    end if;
  end if;

  perform private.require_permission(p_list_id, 'approval.request');
  perform private.require_partner(p_list_id, v_uid);
  if p_name is null or char_length(btrim(p_name)) = 0 then raise exception 'invalid_input'; end if;

  begin
    insert into public.products (id, list_id, name, quantity, unit, category_id, estimated_price, actual_price,
                                 status, added_by, updated_by)
    values (coalesce(p_id, gen_random_uuid()), p_list_id, btrim(p_name), coalesce(p_quantity, 1), nullif(btrim(p_unit), ''),
            coalesce(p_category_id, private.suggest_category(p_name)), p_price, p_price,
            'awaiting_confirmation', v_uid, v_uid)
    returning * into v_prod;

    insert into public.approval_requests (list_id, product_id, requested_by, price, message, is_new_product)
    values (p_list_id, v_prod.id, v_uid, p_price, nullif(btrim(p_message), ''), true)
    returning * into v_req;
  exception
    when check_violation or foreign_key_violation or not_null_violation then
      raise exception 'invalid_input';
  end;

  perform private.log(p_list_id, v_uid, 'approval_requested', v_prod.id, v_prod.name,
    jsonb_build_object('price', p_price, 'request_id', v_req.id));
  perform private.notify_members(p_list_id, v_uid, 'approval_request',
    private.display_name(v_uid) || ' encontrou “' || v_prod.name || '”',
    case when p_price is not null then 'Por ' || private.brl(p_price) || '. ' else '' end
      || 'Deseja adicionar este produto à compra?',
    v_prod.id, jsonb_build_object('request_id', v_req.id), 'approval.respond');

  return jsonb_build_object('product', to_jsonb(v_prod), 'request', to_jsonb(v_req));
end $$;

revoke all on function public.add_product(uuid, text, numeric, text, text, numeric, text, uuid) from public, anon;
revoke all on function public.ask_partner(uuid, text, numeric, numeric, text, text, text, uuid) from public, anon;
grant execute on function public.add_product(uuid, text, numeric, text, text, numeric, text, uuid) to authenticated;
grant execute on function public.ask_partner(uuid, text, numeric, numeric, text, text, text, uuid) to authenticated;


-- >>> 20261005000007_chat_images_notifications.sql
-- =============================================================================
-- Junto — fotos no chat e exclusão de notificações
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Fotos no chat
-- Arquivo em chat-images/<list_id>/<uuid>.<ext> (bucket PRIVADO: só quem participa
-- da lista consegue ler, por URL assinada). A mensagem guarda o caminho e as medidas
-- (para reservar o espaço certo na tela antes de a imagem carregar).
-- ---------------------------------------------------------------------------
alter table public.messages add column if not exists image_path text;
alter table public.messages add column if not exists image_width int;
alter table public.messages add column if not exists image_height int;

do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.messages'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) like '%body%' loop
    execute format('alter table public.messages drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.messages add constraint messages_body_check
  check (char_length(body) <= 2000 and (char_length(btrim(body)) >= 1 or image_path is not null));
alter table public.messages add constraint messages_image_path_check
  check (image_path is null or image_path ~ ('^' || list_id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$'));
alter table public.messages add constraint messages_image_size_check
  check ((image_width is null or image_width between 1 and 10000) and (image_height is null or image_height between 1 and 10000));

-- Converte texto em uuid sem erro (nomes de pasta vindos do Storage).
create or replace function private.try_uuid(p text)
returns uuid
language plpgsql immutable
as $$
begin
  return p::uuid;
exception when others then
  return null;
end $$;

drop function if exists public.send_message(uuid, text, uuid, uuid);

create or replace function public.send_message(
  p_list_id uuid, p_body text default '', p_product_id uuid default null, p_id uuid default null,
  p_image_path text default null, p_image_width int default null, p_image_height int default null)
returns public.messages
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := private.require_user();
  v_msg public.messages;
  v_prod_name text;
  v_list_name text;
  v_body text := btrim(coalesce(p_body, ''));
  v_exists boolean;
begin
  -- Idempotência: reenvio da fila offline não duplica a mensagem.
  if p_id is not null then
    select * into v_msg from public.messages where id = p_id;
    if found then
      if v_msg.sender_id = v_uid and v_msg.list_id = p_list_id then return v_msg; end if;
      raise exception 'invalid_input';
    end if;
  end if;

  perform private.require_permission(p_list_id, 'chat.send');
  if char_length(coalesce(p_body, '')) > 2000 or (v_body = '' and p_image_path is null) then
    raise exception 'invalid_input';
  end if;

  if p_image_path is not null then
    if p_image_path !~ ('^' || p_list_id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$') then
      raise exception 'invalid_input';
    end if;
    -- A foto precisa existir e ter sido enviada por quem manda a mensagem.
    if to_regclass('storage.objects') is not null then
      execute $q$select exists (select 1 from storage.objects
                 where bucket_id = 'chat-images' and name = $1 and owner_id = $2)$q$
        into v_exists using p_image_path, v_uid::text;
      if not v_exists then raise exception 'invalid_input'; end if;
    end if;
  end if;

  if p_product_id is not null then
    select name into v_prod_name from public.products where id = p_product_id and list_id = p_list_id;
    if v_prod_name is null then raise exception 'product_not_found'; end if;
  end if;

  begin
    insert into public.messages (id, list_id, product_id, sender_id, body, image_path, image_width, image_height)
    values (coalesce(p_id, gen_random_uuid()), p_list_id, p_product_id, v_uid, v_body,
            p_image_path, p_image_width, p_image_height)
    returning * into v_msg;
  exception when check_violation then
    raise exception 'invalid_input';
  end;

  select name into v_list_name from public.shopping_lists where id = p_list_id;
  perform private.notify_members(p_list_id, v_uid, 'message',
    private.display_name(v_uid) || ' · ' || coalesce(v_prod_name, v_list_name),
    case when p_image_path is not null
         then '📷 Foto' || case when v_body <> '' then ': ' || left(v_body, 120) else '' end
         else left(v_body, 140) end,
    p_product_id, jsonb_build_object('message_id', v_msg.id));
  return v_msg;
end $$;

revoke all on function public.send_message(uuid, text, uuid, uuid, text, int, int) from public, anon;
grant execute on function public.send_message(uuid, text, uuid, uuid, text, int, int) to authenticated;

-- Bucket e políticas (só quando o Storage do Supabase existe).
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('chat-images', 'chat-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

    execute $p$drop policy if exists "chat-images: membros veem" on storage.objects$p$;
    execute $p$create policy "chat-images: membros veem" on storage.objects for select to authenticated
      using (bucket_id = 'chat-images'
             and public.is_list_member(private.try_uuid((storage.foldername(name))[1])))$p$;

    execute $p$drop policy if exists "chat-images: membros enviam" on storage.objects$p$;
    execute $p$create policy "chat-images: membros enviam" on storage.objects for insert to authenticated
      with check (bucket_id = 'chat-images'
                  and public.has_list_permission(private.try_uuid((storage.foldername(name))[1]), 'chat.send'))$p$;

    -- Remove: quem enviou, ou quem pode excluir a lista (limpeza ao excluir a lista).
    execute $p$drop policy if exists "chat-images: remover" on storage.objects$p$;
    execute $p$create policy "chat-images: remover" on storage.objects for delete to authenticated
      using (bucket_id = 'chat-images'
             and (owner_id = auth.uid()::text
                  or public.has_list_permission(private.try_uuid((storage.foldername(name))[1]), 'list.delete')))$p$;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Notificações: excluir uma, várias ou todas (somente as próprias).
-- ---------------------------------------------------------------------------
create or replace function public.delete_notifications(p_ids uuid[] default null)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := private.require_user();
  v_count int;
begin
  delete from public.notifications
  where user_id = v_uid and (p_ids is null or id = any (p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function public.delete_notifications(uuid[]) from public, anon;
grant execute on function public.delete_notifications(uuid[]) to authenticated;

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

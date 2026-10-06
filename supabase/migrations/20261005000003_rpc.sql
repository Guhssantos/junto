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

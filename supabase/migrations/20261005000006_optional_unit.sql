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

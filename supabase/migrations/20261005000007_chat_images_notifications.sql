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

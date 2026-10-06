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

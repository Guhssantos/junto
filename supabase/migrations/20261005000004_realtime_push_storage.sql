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

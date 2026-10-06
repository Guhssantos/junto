-- =============================================================================
-- Testes do banco: segurança (RLS), permissões e fluxos principais.
-- Executar com:  npm run test:db   (ver scripts/test-db.sh)
-- Cada bloco falha com erro descritivo; ON_ERROR_STOP interrompe na primeira falha.
-- =============================================================================
\set ON_ERROR_STOP on
\set QUIET on

create schema tests;
grant usage on schema tests to authenticated, anon;

create function tests.login(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p::text, ''), false);
$$;

create function tests.expect_error(p_sql text, p_expected text) returns void language plpgsql as $$
declare v_ok boolean := false;
begin
  begin
    execute p_sql;
    v_ok := true;
  exception when others then
    if position(p_expected in sqlerrm) = 0 then
      raise exception 'esperado erro "%", recebido "%" em: %', p_expected, sqlerrm, p_sql;
    end if;
  end;
  if v_ok then raise exception 'esperado erro "%", mas executou: %', p_expected, p_sql; end if;
end $$;

create function tests.ok(p_label text) returns void language plpgsql as $$
begin raise notice 'ok - %', p_label; end $$;

create function tests.get(p_key text) returns uuid language sql as $$
  select current_setting('tests.' || p_key)::uuid;
$$;
create function tests.put(p_key text, p_val text) returns void language sql as $$
  select set_config('tests.' || p_key, p_val, false);
$$;
grant execute on all functions in schema tests to authenticated, anon;

-- Usuários: Gustavo (G), Larissa (L), João (J), Mallory (M = intrusa)
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'gustavo@exemplo.com', '{"name":"Gustavo"}'),
  ('00000000-0000-0000-0000-00000000000b', 'larissa@exemplo.com', '{"name":"Larissa"}'),
  ('00000000-0000-0000-0000-00000000000c', 'joao@exemplo.com',    '{}'),
  ('00000000-0000-0000-0000-00000000000d', 'mallory@exemplo.com', '{"name":"Mallory"}');

do $$ begin
  assert (select count(*) from public.profiles where id::text like '00000000-0000-0000-0000-00000000000_') = 4, 'perfis criados no cadastro';
  assert (select name from public.profiles where id = '00000000-0000-0000-0000-00000000000c') = 'joao',
    'nome padrão a partir do e-mail';
  perform tests.ok('cadastro cria perfil automaticamente');
end $$;

do $$ begin
  perform tests.put('G', '00000000-0000-0000-0000-00000000000a');
  perform tests.put('L', '00000000-0000-0000-0000-00000000000b');
  perform tests.put('J', '00000000-0000-0000-0000-00000000000c');
  perform tests.put('M', '00000000-0000-0000-0000-00000000000d');
end $$;

-- ---------------------------------------------------------------------------
set role anon;
do $$ begin
  perform tests.expect_error('select * from public.profiles', 'permission denied');
  perform tests.expect_error('select public.create_list(''x'')', 'permission denied');
  perform tests.ok('anônimo não acessa dados nem RPC');
end $$;
reset role;

-- ---------------------------------------------------------------------------
set role authenticated;

-- Sem login (JWT vazio)
do $$ begin
  perform tests.login(null);
  perform tests.expect_error('select public.create_list(''x'')', 'not_authenticated');
  perform tests.ok('RPC exige usuário autenticado');
end $$;

-- G cria lista e produtos
do $$
declare v_list public.shopping_lists; v_p public.products; v_id uuid := gen_random_uuid();
begin
  perform tests.login(tests.get('G'));
  v_list := public.create_list('Compra do mês', 'Compras da semana', '2026-10-05');
  perform tests.put('list', v_list.id::text);
  assert (select role_id from public.list_members where list_id = v_list.id and user_id = tests.get('G')) = 'admin',
    'criador é administrador';

  v_p := public.add_product(v_list.id, 'Arroz 5 kg', 2, 'un', null, 25.00, null, v_id);
  assert v_p.category_id = 'alimentos', 'categoria sugerida pelo nome';
  perform public.add_product(v_list.id, 'Arroz 5 kg', 2, 'un', null, 25.00, null, v_id);
  assert (select count(*) from public.products where list_id = v_list.id) = 1, 'add_product idempotente (fila offline)';
  perform tests.put('arroz', v_id::text);

  perform tests.expect_error(format('select public.add_product(%L, %L)', v_list.id, '   '), 'invalid_input');
  perform tests.expect_error(format('select public.add_product(%L, %L, -1)', v_list.id, 'Leite'), 'invalid_input');
  perform tests.ok('criar lista e adicionar produto com validação');

  -- Unidade de medida é opcional
  v_p := public.add_product(v_list.id, 'Pão francês', 6);
  assert v_p.unit is null, 'sem unidade informada, fica sem unidade';
  v_p := public.add_product(v_list.id, 'Detergente', 1, '  ');
  assert v_p.unit is null, 'unidade em branco vira sem unidade';
  v_p := public.add_product(v_list.id, 'Coentro', 1, 'maço');
  assert v_p.unit = 'maço', 'unidade livre ("Outros") aceita';
  perform tests.expect_error(format('select public.add_product(%L, %L, 1, %L)', v_list.id, 'Sal', repeat('x', 20)), 'invalid_input');
  perform public.update_product(v_p.id, '{"unit": null}'::jsonb);
  assert (select unit from public.products where id = v_p.id) is null, 'editar para sem unidade';
  perform public.update_product(v_p.id, '{"unit": "kg"}'::jsonb);
  assert (select unit from public.products where id = v_p.id) = 'kg', 'editar unidade';
  perform tests.ok('unidade de medida opcional');
end $$;
-- remove os itens do teste de unidade para não alterar os totais dos próximos cenários
reset role;
delete from public.activity_log where product_name in ('Pão francês', 'Detergente', 'Coentro');
delete from public.notifications where product_id in (select id from public.products where name in ('Pão francês', 'Detergente', 'Coentro'));
delete from public.products where name in ('Pão francês', 'Detergente', 'Coentro');
set role authenticated;

-- Intrusa conhece o ID mas não acessa nada
do $$
declare v_n int;
begin
  perform tests.login(tests.get('M'));
  assert (select count(*) from public.shopping_lists where id = tests.get('list')) = 0, 'M não vê a lista';
  assert (select count(*) from public.products where list_id = tests.get('list')) = 0, 'M não vê produtos';
  assert (select count(*) from public.list_members where list_id = tests.get('list')) = 0, 'M não vê membros';
  assert (select count(*) from public.profiles where id = tests.get('G')) = 0, 'M não vê perfil de G';
  assert (select count(*) from public.list_summaries where list_id = tests.get('list')) = 0, 'M não vê totais';

  perform tests.expect_error(format('select public.add_product(%L, %L)', tests.get('list'), 'Hack'), 'forbidden');
  perform tests.expect_error(format('select public.update_product(%L, %L)', tests.get('arroz'), '{"name":"x"}'), 'product_not_found');
  perform tests.expect_error(format('select public.delete_product(%L)', tests.get('arroz')), 'product_not_found');
  perform tests.expect_error(format('select public.create_invite(%L)', tests.get('list')), 'forbidden');
  perform tests.expect_error(format('select public.send_message(%L, %L)', tests.get('list'), 'oi'), 'forbidden');
  perform tests.expect_error(format('select public.finalize_list(%L)', tests.get('list')), 'forbidden');
  perform tests.expect_error(format('insert into public.list_members (list_id, user_id, status) values (%L, %L, ''active'')',
    tests.get('list'), tests.get('M')), 'permission denied');
  perform tests.expect_error(format('insert into public.products (list_id, name) values (%L, ''x'')', tests.get('list')),
    'permission denied');
  perform tests.expect_error('update public.shopping_lists set owner_id = tests.get(''M'')', 'permission denied');

  update public.shopping_lists set name = 'hackeada' where id = tests.get('list');
  get diagnostics v_n = row_count;
  assert v_n = 0, 'RLS bloqueia update de lista alheia';
  delete from public.shopping_lists where id = tests.get('list');
  get diagnostics v_n = row_count;
  assert v_n = 0, 'RLS bloqueia exclusão de lista alheia';
  perform tests.ok('ID da lista sozinho não dá acesso (leitura, escrita e RPC)');
end $$;

-- Convite
do $$
declare v_inv jsonb; v_inv2 jsonb;
begin
  perform tests.login(tests.get('G'));
  v_inv := public.create_invite(tests.get('list'));
  assert (v_inv ->> 'code') ~ '^[A-Z]{4}-[0-9]{4}$', 'formato ABCD-1234';
  v_inv2 := public.create_invite(tests.get('list'));
  assert v_inv ->> 'code' = v_inv2 ->> 'code', 'convite válido é reaproveitado';
  perform set_config('tests.code', v_inv ->> 'code', false);
  perform tests.ok('gerar código de convite');
end $$;

-- L pede para entrar (código digitado em minúsculas e sem hífen)
do $$
declare v_res jsonb;
begin
  perform tests.login(tests.get('L'));
  v_res := public.request_join(lower(replace(current_setting('tests.code'), '-', '')));
  assert v_res ->> 'status' = 'pending', 'pedido fica pendente: ' || v_res::text;
  v_res := public.request_join(current_setting('tests.code'));
  assert v_res ->> 'status' = 'pending', 'pedido repetido não duplica';
  assert (select count(*) from public.shopping_lists where id = tests.get('list')) = 0, 'pendente ainda não vê a lista';
  assert (select count(*) from public.products where list_id = tests.get('list')) = 0, 'pendente não vê produtos';
  assert (select count(*) from public.list_members where list_id = tests.get('list')) = 1, 'vê apenas o próprio pedido';
  perform tests.ok('entrar com código exige aprovação');
end $$;

-- Força bruta
do $$
declare v_res jsonb; i int;
begin
  perform tests.login(tests.get('M'));
  for i in 1..10 loop
    v_res := public.request_join('ZZZZ-' || lpad(i::text, 4, '0'));
    assert v_res ->> 'status' = 'invalid', 'código inexistente';
  end loop;
  v_res := public.request_join(current_setting('tests.code'));
  assert v_res ->> 'status' = 'rate_limited', 'bloqueia após 10 tentativas inválidas';
  perform tests.ok('limite de tentativas de código');
end $$;

-- G aprova L
do $$
begin
  perform tests.login(tests.get('G'));
  assert (select count(*) from public.notifications where user_id = tests.get('G') and type = 'join_request') = 1,
    'admin recebe pedido de entrada';
  assert (select count(*) from public.profiles where id = tests.get('L')) = 1, 'admin vê perfil de quem pediu';
  perform public.respond_join_request(tests.get('list'), tests.get('L'), true);
  assert (select read_at is not null from public.notifications where user_id = tests.get('G') and type = 'join_request'),
    'pedido some da central após resposta';
  -- Aceitar de novo (outra tela/aviso desatualizado) não é erro e não duplica avisos
  perform public.respond_join_request(tests.get('list'), tests.get('L'), true);
  assert (select count(*) from public.activity_log where list_id = tests.get('list') and action = 'member_joined' and actor_id = tests.get('L')) = 1,
    'segunda aceitação não duplica histórico nem avisos';
  -- Mas não dá para recusar quem já entrou, nem responder a quem nunca pediu
  perform tests.expect_error(format('select public.respond_join_request(%L, %L, false)', tests.get('list'), tests.get('L')),
    'request_not_found');
  perform tests.expect_error(format('select public.respond_join_request(%L, %L, true)', tests.get('list'), tests.get('M')),
    'request_not_found');
  perform tests.ok('aceitar convite (resposta repetida sem erro falso)');
end $$;

-- L participa: vê tudo, altera preço
do $$
declare v_res jsonb;
begin
  perform tests.login(tests.get('L'));
  assert (select count(*) from public.shopping_lists where id = tests.get('list')) = 1, 'L vê a lista';
  assert (select count(*) from public.profiles where id = tests.get('G')) = 1, 'L vê perfil de G';
  assert (select count(*) from public.profiles where id = tests.get('M')) = 0, 'L não vê perfil de M';
  assert exists (select 1 from public.notifications where user_id = tests.get('L') and type = 'join_accepted'),
    'L notificada da aprovação';
  assert (select count(*) from public.notifications where user_id = tests.get('G')) = 0,
    'L não lê notificações de G (só as próprias aparecem)' ;

  v_res := public.update_product(tests.get('arroz'), '{"actual_price": 27.90}', '{"actual_price": null}');
  assert v_res ->> 'status' = 'ok', 'preço alterado: ' || v_res::text;
  assert (select actual_price from public.products where id = tests.get('arroz')) = 27.90, 'preço gravado';
  assert (select version from public.products where id = tests.get('arroz')) = 2, 'versão incrementada';

  perform tests.expect_error(format('select public.create_invite(%L)', tests.get('list')), 'forbidden');
  perform tests.expect_error(format('select public.delete_product(%L)', tests.get('arroz')), 'forbidden');
  perform tests.expect_error(format('select public.update_product(%L, %L)', tests.get('arroz'), '{"status":"approved"}'),
    'invalid_status');
  perform tests.expect_error(format('select public.update_product(%L, %L)', tests.get('arroz'), '{"owner":"x"}'),
    'invalid_input');
  perform tests.ok('participante altera preço; permissões de participante respeitadas');
end $$;

-- Conflito: G edita com base antiga
do $$
declare v_res jsonb; v_p public.products;
begin
  perform tests.login(tests.get('G'));
  assert exists (select 1 from public.notifications where user_id = tests.get('G') and type = 'price_changed'),
    'G notificado da mudança de preço';

  -- G ainda via actual_price = null e quantity = 2
  v_res := public.update_product(tests.get('arroz'), '{"actual_price": 26.50, "quantity": 3}',
                                 '{"actual_price": null, "quantity": 2}');
  select * into v_p from public.products where id = tests.get('arroz');
  assert v_res ->> 'status' = 'conflict', 'conflito detectado';
  assert v_res -> 'conflicts' -> 0 ->> 'field' = 'actual_price', 'campo em conflito informado';
  assert v_p.actual_price = 27.90, 'valor do outro não é sobrescrito';
  assert v_p.quantity = 3, 'campo sem conflito é aplicado';

  -- Resolução: G escolhe manter o próprio valor (base = valor atual)
  v_res := public.update_product(tests.get('arroz'), '{"actual_price": 26.50}', '{"actual_price": 27.90}');
  assert v_res ->> 'status' = 'ok', 'resolução aplicada';

  -- Mesma alteração simultânea não é conflito
  v_res := public.update_product(tests.get('arroz'), '{"quantity": 3}', '{"quantity": 1}');
  assert v_res ->> 'status' = 'ok', 'valores iguais não geram conflito';
  perform tests.ok('edição simultânea sem perda de dados (merge de 3 vias)');
end $$;

-- Comprar, remover, perguntar ao parceiro
do $$
declare v_res jsonb; v_req uuid; v_own public.products;
begin
  perform tests.login(tests.get('L'));
  v_res := public.update_product(tests.get('arroz'), '{"status": "purchased"}', '{"status": "pending"}');
  assert (select purchased_by from public.products where id = tests.get('arroz')) = tests.get('L'), 'quem comprou';

  v_own := public.add_product(tests.get('list'), 'Leite integral', 6, 'L');
  assert v_own.category_id = 'laticinios', 'categoria de leite';
  perform public.delete_product(v_own.id);
  assert (select deleted_at is not null from public.products where id = v_own.id), 'participante remove o próprio item';

  v_res := public.ask_partner(tests.get('list'), 'Chocolate 70%', 12.90, 1, 'un', null, 'Tá na promoção');
  v_req := (v_res -> 'request' ->> 'id')::uuid;
  perform tests.put('req', v_req::text);
  perform tests.put('choc', v_res -> 'product' ->> 'id');
  assert v_res -> 'product' ->> 'status' = 'awaiting_confirmation', 'produto aguardando confirmação';
  perform tests.expect_error(format('select public.respond_approval(%L, true)', v_req), 'cannot_respond_own');
  perform tests.expect_error(format('select public.update_product(%L, %L)', tests.get('choc'), '{"status":"purchased"}'),
    'awaiting_confirmation');
  perform tests.ok('marcar comprado, remover item e perguntar ao parceiro');
end $$;

do $$
declare v_req public.approval_requests;
begin
  perform tests.login(tests.get('G'));
  assert exists (select 1 from public.notifications where user_id = tests.get('G') and type = 'approval_request'
    and title like 'Larissa encontrou “Chocolate 70%”%'), 'G recebe pergunta';
  v_req := public.respond_approval(tests.get('req'), true, 'Pode pegar!');
  assert v_req.status = 'approved', 'pedido aprovado';
  assert (select status from public.products where id = tests.get('choc')) = 'approved', 'produto aprovado';
  assert exists (select 1 from public.messages where product_id = tests.get('choc') and body = 'Pode pegar!'),
    'resposta vira mensagem no chat do produto';
  perform tests.expect_error(format('select public.respond_approval(%L, false)', tests.get('req')), 'already_answered');
  perform tests.ok('aprovar pedido');
end $$;

-- No Supabase real a foto precisa existir no Storage (enviada por quem manda a mensagem)
reset role;
do $$ begin
  if to_regclass('storage.objects') is not null then
    execute format('insert into storage.objects (bucket_id, name, owner_id) values (%L, %L, %L)',
      'chat-images', tests.get('list') || '/00000000-0000-4000-8000-000000000001.jpg', tests.get('L')::text);
  end if;
end $$;
set role authenticated;

do $$
declare v_m public.messages; v_id uuid := gen_random_uuid();
begin
  perform tests.login(tests.get('L'));
  assert exists (select 1 from public.notifications where user_id = tests.get('L') and type = 'approval_approved'),
    'L notificada da aprovação';
  v_m := public.send_message(tests.get('list'), 'Esse é o que você queria?', tests.get('choc'), v_id);
  perform public.send_message(tests.get('list'), 'Esse é o que você queria?', tests.get('choc'), v_id);
  assert (select count(*) from public.messages where id = v_id) = 1, 'mensagem idempotente';
  perform public.send_message(tests.get('list'), 'Já estou no caixa');
  perform tests.expect_error(format('select public.send_message(%L, %L, %L)', tests.get('list'), 'x', gen_random_uuid()),
    'product_not_found');
  perform tests.expect_error(format('select public.send_message(%L, %L)', tests.get('list'), ''), 'invalid_input');
  perform tests.ok('chat geral e por produto');

  -- Foto no chat: legenda opcional, caminho preso à pasta da própria lista
  v_m := public.send_message(tests.get('list'), '', null, null,
    tests.get('list') || '/00000000-0000-4000-8000-000000000001.jpg', 1200, 1600);
  assert v_m.image_path is not null and v_m.body = '' and v_m.image_width = 1200, 'foto sem legenda';
  perform tests.expect_error(format('select public.send_message(%L, %L, null, null, %L)',
    tests.get('list'), 'olha', gen_random_uuid() || '/' || gen_random_uuid() || '.jpg'), 'invalid_input');
  perform tests.expect_error(format('select public.send_message(%L, %L, null, null, %L)',
    tests.get('list'), 'olha', tests.get('list') || '/../x.jpg'), 'invalid_input');
  if to_regclass('storage.objects') is not null then
    -- No Supabase real: foto que não foi enviada ao Storage por quem manda é recusada
    perform tests.expect_error(format('select public.send_message(%L, %L, null, null, %L)',
      tests.get('list'), 'olha', tests.get('list') || '/00000000-0000-4000-8000-000000000002.jpg'), 'invalid_input');
  end if;
  perform tests.ok('foto no chat (caminho validado)');
end $$;

-- Totais e finalização
do $$
declare s record; h public.purchase_history;
begin
  perform tests.login(tests.get('G'));
  assert (select count(*) from public.notifications where user_id = tests.get('G') and type = 'message') = 3,
    'G notificado das mensagens';
  select * into s from public.list_summaries where list_id = tests.get('list');
  -- arroz: 3 × 26,50 (comprado, estimado 25,00) | chocolate: 1 × 12,90 (aprovado)
  assert s.items_count = 2 and s.purchased_count = 1, 'contagem: ' || row_to_json(s)::text;
  assert s.total_estimated = 87.90, 'total estimado: ' || s.total_estimated;
  assert s.total_updated = 92.40, 'total atualizado: ' || s.total_updated;
  assert s.total_spent = 79.50, 'total no carrinho: ' || s.total_spent;

  perform tests.login(tests.get('L'));
  perform tests.expect_error(format('select public.finalize_list(%L)', tests.get('list')), 'forbidden');

  perform tests.login(tests.get('G'));
  h := public.finalize_list(tests.get('list'));
  assert h.total_actual = 79.50 and h.total_estimated = 75.00 and h.purchased_count = 1, 'resumo da compra';
  assert (select status from public.shopping_lists where id = tests.get('list')) = 'completed', 'lista no histórico';

  perform tests.login(tests.get('L'));
  assert exists (select 1 from public.purchase_history where list_id = tests.get('list')), 'L vê o histórico';
  perform tests.expect_error(format('select public.add_product(%L, %L)', tests.get('list'), 'Pão'), 'list_unavailable');
  perform tests.ok('totais, finalização e histórico');
end $$;

-- Histórico de alterações
do $$
begin
  perform tests.login(tests.get('L'));
  assert (select count(*) from public.activity_log where list_id = tests.get('list')) >= 10, 'histórico registrado';
  assert exists (select 1 from public.activity_log where list_id = tests.get('list') and action = 'price_changed'
    and actor_id = tests.get('L') and product_name = 'Arroz 5 kg'), 'histórico com usuário, ação e produto';
  perform tests.ok('histórico de alterações');
end $$;
reset role;

-- Convite expirado
update public.list_invites set expires_at = now() - interval '1 minute';
set role authenticated;
do $$
declare v_res jsonb;
begin
  perform tests.login(tests.get('G'));
  perform public.reopen_list(tests.get('list'));
  perform tests.login(tests.get('J'));
  v_res := public.request_join(current_setting('tests.code'));
  assert v_res ->> 'status' = 'expired', 'convite expirado: ' || v_res::text;

  perform tests.login(tests.get('G'));
  perform public.revoke_invites(tests.get('list'));
  perform tests.ok('expiração e revogação de convites');
end $$;

-- Remover participante, notificações e push token
do $$
declare v_n int;
begin
  perform tests.login(tests.get('G'));
  perform public.remove_member(tests.get('list'), tests.get('L'));
  perform tests.expect_error(format('select public.remove_member(%L, %L)', tests.get('list'), tests.get('G')), 'forbidden');
  perform tests.expect_error(format('select public.leave_list(%L)', tests.get('list')), 'owner_cannot_leave');

  update public.notifications set read_at = now() where user_id = tests.get('L');
  get diagnostics v_n = row_count;
  assert v_n = 0, 'não marca notificação alheia';
  v_n := public.mark_notifications_read();
  assert v_n > 0, 'marca as próprias como lidas';

  perform tests.expect_error('select public.register_push_token(''abc'', ''ios'')', 'invalid_input');
  perform tests.expect_error('update public.profiles set avatar_url = ''https://rastreador.com/x.png'' where id = auth.uid()', 'check constraint');
  update public.profiles set avatar_url = 'https://abc.supabase.co/storage/v1/object/public/avatars/' || auth.uid() || '/f.jpg' where id = auth.uid();
  assert (select avatar_url from public.profiles where id = auth.uid()) like '%/avatars/%', 'foto válida aceita';
  update public.profiles set avatar_url = 'http://127.0.0.1:54321/storage/v1/object/public/avatars/' || auth.uid() || '/f.jpg' where id = auth.uid();
  perform tests.expect_error(format('update public.profiles set avatar_url = %L where id = auth.uid()',
    'https://abc.supabase.co/storage/v1/object/public/avatars/' || tests.get('L') || '/f.jpg'), 'check constraint');
  perform tests.expect_error(format('update public.profiles set avatar_url = %L where id = auth.uid()',
    'https://abc.supabase.co/storage/v1/object/public/avatars/' || auth.uid() || '/../x/f.jpg'), 'check constraint');
  update public.profiles set name = 'hack' where id = tests.get('L');
  get diagnostics v_n = row_count;
  assert v_n = 0, 'não edita perfil alheio';
  perform public.register_push_token('ExponentPushToken[abc123]', 'ios');

  assert exists (select 1 from public.notifications where user_id = tests.get('G') and body = '📷 Foto'),
    'aviso de foto para os outros participantes';
  -- Excluir notificações: uma, ou todas — sempre só as próprias
  v_n := public.delete_notifications(array[(select id from public.notifications where user_id = tests.get('G') limit 1)]);
  assert v_n = 1, 'exclui uma notificação';
  assert public.delete_notifications(array[(select id from public.notifications where user_id <> tests.get('G') limit 1)]) = 0,
    'não exclui notificação alheia';
  perform public.delete_notifications();
  assert (select count(*) from public.notifications where user_id = tests.get('G')) = 0, 'limpa todas as próprias';
  perform tests.login(tests.get('L'));
  assert (select count(*) from public.shopping_lists where id = tests.get('list')) = 0, 'removida perde acesso';
  assert (select count(*) from public.messages where list_id = tests.get('list')) = 0, 'removida não lê mensagens';
  perform public.register_push_token('ExponentPushToken[abc123]', 'android');
  assert (select count(*) from public.push_tokens) = 1, 'token troca de dono (mesmo aparelho)';
  perform tests.ok('remover participante, notificações e push token');
end $$;

-- Exclusão de conta (LGPD)
do $$
begin
  perform tests.login(tests.get('G'));
  perform public.delete_my_account();
end $$;
reset role;
do $$ begin
  assert not exists (select 1 from auth.users where id = tests.get('G')), 'usuário excluído';
  assert not exists (select 1 from public.profiles where id = tests.get('G')), 'perfil excluído';
  assert not exists (select 1 from public.shopping_lists where id = tests.get('list')), 'lista sem outros membros excluída';
  perform tests.ok('exclusão de conta (LGPD)');
end $$;

-- Limpeza automática de dados antigos
do $$ begin
  insert into public.invite_attempts (user_id, success, attempted_at)
    select id, false, now() - interval '8 days' from public.profiles limit 1;
  update public.notifications set read_at = now(), created_at = now() - interval '91 days';
  perform private.cleanup_old_data();
  assert not exists (select 1 from public.invite_attempts where attempted_at < now() - interval '7 days'), 'tentativas antigas removidas';
  assert not exists (select 1 from public.notifications where created_at < now() - interval '90 days'), 'notificações lidas antigas removidas';
  perform tests.ok('limpeza automática de dados antigos');
end $$;

-- Keep-alive acessível sem login, sem expor dados
set role anon;
do $$ begin
  assert public.keepalive() = 'ok', 'keepalive responde';
  perform tests.expect_error('select count(*) from public.profiles', 'permission denied');
  perform tests.ok('keep-alive público não expõe dados');
end $$;
reset role;

\echo 'TODOS OS TESTES DO BANCO PASSARAM'

// Edge Function: send-push
// Chamada pelo banco (trigger em public.notifications via pg_net) a cada notificação criada.
// Envia o push pelo Expo Push Service e remove tokens inválidos.
//
// Variáveis (supabase secrets set ...):
//   PUSH_WEBHOOK_SECRET   segredo compartilhado com o banco (Vault: push_webhook_secret)
//   EXPO_ACCESS_TOKEN     opcional — exigido se "Enhanced push security" estiver ligado no Expo
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetadas automaticamente.
//
// Deploy: supabase functions deploy send-push --no-verify-jwt
// (a autenticação é feita pelo cabeçalho x-webhook-secret, não por JWT de usuário)

import { createClient } from 'npm:@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

type ExpoTicket = { status: 'ok' | 'error'; id?: string; message?: string; details?: { error?: string } };

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const secret = Deno.env.get('PUSH_WEBHOOK_SECRET') ?? '';
  const received = req.headers.get('x-webhook-secret') ?? '';
  if (!secret || !timingSafeEqual(secret, received)) {
    return new Response('Unauthorized', { status: 401 });
  }

  let notificationId: string | undefined;
  try {
    ({ notification_id: notificationId } = await req.json());
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  if (!notificationId) return new Response('Bad request', { status: 400 });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const { data: notif, error } = await admin
    .from('notifications')
    .select('id, user_id, list_id, product_id, type, title, body, data')
    .eq('id', notificationId)
    .maybeSingle();
  if (error || !notif) return new Response('Not found', { status: 404 });

  const { data: profile } = await admin.from('profiles').select('push_enabled').eq('id', notif.user_id).maybeSingle();
  if (!profile?.push_enabled) return Response.json({ skipped: 'push_disabled' });

  const { data: tokens } = await admin.from('push_tokens').select('token').eq('user_id', notif.user_id);
  if (!tokens?.length) return Response.json({ skipped: 'no_tokens' });

  const { count: unread } = await admin
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', notif.user_id)
    .is('read_at', null);

  const messages = tokens.map(({ token }) => ({
    to: token,
    title: notif.title,
    body: notif.body,
    sound: 'default',
    badge: unread ?? undefined,
    channelId: 'default',
    // Agrupa no aparelho as notificações da mesma lista.
    threadId: notif.list_id ?? undefined,
    data: { notificationId: notif.id, type: notif.type, listId: notif.list_id, productId: notif.product_id, ...notif.data },
  }));

  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const expoToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  if (expoToken) headers.Authorization = `Bearer ${expoToken}`;

  const res = await fetch(EXPO_PUSH_URL, { method: 'POST', headers, body: JSON.stringify(messages) });
  if (!res.ok) {
    console.error('expo push error', res.status, await res.text());
    return new Response('Upstream error', { status: 502 });
  }
  const { data: tickets } = (await res.json()) as { data: ExpoTicket[] };

  // Remove tokens de aparelhos que desinstalaram o app ou revogaram permissão.
  const dead = tickets
    .map((t, i) => (t.status === 'error' && t.details?.error === 'DeviceNotRegistered' ? tokens[i].token : null))
    .filter((t): t is string => t !== null);
  if (dead.length) await admin.from('push_tokens').delete().in('token', dead);

  return Response.json({ sent: tickets.filter((t) => t.status === 'ok').length, removed: dead.length });
});

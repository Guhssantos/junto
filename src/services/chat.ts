import { unwrap } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import type { Message } from '@/types/models';

export async function fetchMessages(listId: string, productId: string | null): Promise<Message[]> {
  let q = supabase.from('messages').select('*').eq('list_id', listId).order('created_at', { ascending: false }).limit(200);
  q = productId ? q.eq('product_id', productId) : q.is('product_id', null);
  const rows = unwrap(await q) as Message[];
  return rows.reverse();
}

export async function rpcSendMessage(listId: string, p: { id: string; body: string; product_id: string | null }): Promise<Message> {
  return unwrap(
    await supabase.rpc('send_message', { p_list_id: listId, p_body: p.body, p_product_id: p.product_id, p_id: p.id }),
  ) as Message;
}

export interface Conversation {
  key: string;
  listId: string;
  productId: string | null;
  productName: string | null;
  last: Message;
}

/** Últimas conversas (geral e por produto) das listas do usuário. */
export async function fetchConversations(): Promise<Conversation[]> {
  const rows = unwrap(
    await supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(300),
  ) as Message[];
  const seen = new Map<string, Conversation>();
  for (const m of rows) {
    const key = `${m.list_id}:${m.product_id ?? 'list'}`;
    if (!seen.has(key)) seen.set(key, { key, listId: m.list_id, productId: m.product_id, productName: null, last: m });
  }
  const productIds = [...seen.values()].map((c) => c.productId).filter((id): id is string => !!id);
  if (productIds.length) {
    const products = unwrap(await supabase.from('products').select('id, name').in('id', productIds)) as { id: string; name: string }[];
    const names = new Map(products.map((p) => [p.id, p.name]));
    for (const c of seen.values()) if (c.productId) c.productName = names.get(c.productId) ?? null;
  }
  return [...seen.values()];
}

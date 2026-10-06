import { AppError, unwrap } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { removeListImages } from '@/services/chatImages';
import type {
  ActivityEntry,
  ListMember,
  ListOverview,
  ListSummary,
  PurchaseHistory,
  ShoppingList,
} from '@/types/models';

const MEMBER_SELECT = 'id, list_id, user_id, role_id, status, joined_at, created_at, profile:profiles(id, name, avatar_url)';

const emptySummary = (listId: string): ListSummary => ({
  list_id: listId,
  items_count: 0,
  purchased_count: 0,
  total_estimated: 0,
  total_updated: 0,
  total_spent: 0,
  awaiting_count: 0,
});

function normalizeSummary(s: Record<string, unknown>): ListSummary {
  return {
    list_id: String(s.list_id),
    items_count: Number(s.items_count ?? 0),
    purchased_count: Number(s.purchased_count ?? 0),
    total_estimated: Number(s.total_estimated ?? 0),
    total_updated: Number(s.total_updated ?? 0),
    total_spent: Number(s.total_spent ?? 0),
    awaiting_count: Number(s.awaiting_count ?? 0),
  };
}

/** Listas em que o usuário é membro ativo (RLS garante o filtro). */
export async function fetchLists(status: 'active' | 'completed', userId: string): Promise<ListOverview[]> {
  const lists = unwrap(
    await supabase
      .from('shopping_lists')
      .select(`*, list_members(${MEMBER_SELECT})`)
      .eq('status', status)
      .order(status === 'active' ? 'updated_at' : 'completed_at', { ascending: false })
      .limit(100),
  ) as (ShoppingList & { list_members: ListMember[] })[];
  if (!lists.length) return [];

  const summaries = unwrap(
    await supabase.from('list_summaries').select('*').in('list_id', lists.map((l) => l.id)),
  ) as Record<string, unknown>[];
  const byId = new Map(summaries.map((s) => [String(s.list_id), normalizeSummary(s)]));

  return lists.map(({ list_members, ...l }) => {
    const members = list_members.filter((m) => m.status === 'active');
    return {
      ...l,
      members,
      summary: byId.get(l.id) ?? emptySummary(l.id),
      myRole: members.find((m) => m.user_id === userId)?.role_id ?? 'participant',
    };
  });
}

export async function fetchList(id: string): Promise<ShoppingList> {
  const row = unwrap(await supabase.from('shopping_lists').select('*').eq('id', id).maybeSingle());
  if (!row) throw new AppError('list_unavailable', 'Esta lista não existe ou você não participa mais dela.');
  return row as ShoppingList;
}

export async function createList(input: { name: string; description?: string; purchaseDate?: string | null; note?: string }) {
  const name = input.name.trim();
  if (!name) throw new AppError('validation', 'Dê um nome para a lista.');
  if (name.length > 80) throw new AppError('validation', 'O nome pode ter até 80 caracteres.');
  return unwrap(
    await supabase.rpc('create_list', {
      p_name: name,
      p_description: input.description?.trim() || null,
      p_purchase_date: input.purchaseDate ?? null,
      p_note: input.note?.trim() || null,
    }),
    'Não conseguimos criar a lista. Verifique sua conexão e tente novamente.',
  ) as ShoppingList;
}

export async function updateList(id: string, patch: Partial<Pick<ShoppingList, 'name' | 'description' | 'note' | 'purchase_date'>>) {
  const { data, error } = await supabase.from('shopping_lists').update(patch).eq('id', id).select('*').maybeSingle();
  if (error) unwrap({ data: null, error });
  if (!data) throw new AppError('forbidden', 'Você não tem permissão para editar esta lista.');
  return data as ShoppingList;
}

export async function deleteList(id: string) {
  // Fotos do chat ficam no Storage (o banco não apaga arquivos): remove antes —
  // só se a pessoa pode mesmo excluir a lista (depois disso a permissão deixa de existir).
  const { data: canDelete } = await supabase.rpc('has_list_permission', { p_list_id: id, p_permission: 'list.delete' });
  if (canDelete === true) await removeListImages(id).catch(() => undefined);
  const { data, error } = await supabase.from('shopping_lists').delete().eq('id', id).select('id');
  if (error) unwrap({ data: null, error });
  if (!data?.length) throw new AppError('forbidden', 'Somente o administrador pode excluir a lista.');
}

export async function finalizeList(id: string): Promise<PurchaseHistory> {
  const h = unwrap(await supabase.rpc('finalize_list', { p_list_id: id }), 'Não conseguimos finalizar a compra.') as PurchaseHistory;
  return { ...h, total_actual: Number(h.total_actual), total_estimated: Number(h.total_estimated) };
}

export async function reopenList(id: string) {
  unwrap(await supabase.rpc('reopen_list', { p_list_id: id }));
}

export async function fetchPurchaseHistory(listId: string): Promise<PurchaseHistory | null> {
  const h = unwrap(await supabase.from('purchase_history').select('*').eq('list_id', listId).maybeSingle()) as PurchaseHistory | null;
  return h ? { ...h, total_actual: Number(h.total_actual), total_estimated: Number(h.total_estimated) } : null;
}

export async function fetchActivity(listId: string): Promise<ActivityEntry[]> {
  return unwrap(
    await supabase.from('activity_log').select('*').eq('list_id', listId).order('created_at', { ascending: false }).limit(200),
  ) as ActivityEntry[];
}

export async function fetchMembers(listId: string): Promise<ListMember[]> {
  return unwrap(
    await supabase.from('list_members').select(MEMBER_SELECT).eq('list_id', listId).in('status', ['active', 'pending']).order('created_at'),
  ) as unknown as ListMember[];
}

import { unwrap } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import type { AppNotification } from '@/types/models';

export async function fetchNotifications(): Promise<AppNotification[]> {
  return unwrap(
    await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(100),
  ) as AppNotification[];
}

export async function markNotificationsRead(ids?: string[]) {
  unwrap(await supabase.rpc('mark_notifications_read', { p_ids: ids ?? null }));
}

/** Exclui as notificações indicadas — ou todas, sem `ids`. Só as do próprio usuário. */
export async function deleteNotifications(ids?: string[]): Promise<number> {
  return unwrap(await supabase.rpc('delete_notifications', { p_ids: ids ?? null })) as number;
}

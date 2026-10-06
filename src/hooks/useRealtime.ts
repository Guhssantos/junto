import type { RealtimeChannel } from '@supabase/supabase-js';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { normalizeProduct, upsertProduct } from '@/lib/productCache';
import { queryClient } from '@/lib/queryClient';
import { qk } from '@/lib/queryKeys';
import { supabase } from '@/lib/supabase';
import { showToast } from '@/lib/toast';
import { flushOutbox } from '@/offline/sync';
import { pendingPatchFor } from '@/offline/outbox';
import { setBadge } from '@/services/push';
import type { AppNotification, Message, Product } from '@/types/models';

let channelSeq = 0;

/**
 * Tempo real de uma lista aberta: produtos, mensagens, aprovações, membros e histórico.
 * O Supabase só entrega eventos de linhas que o usuário pode ler (RLS).
 * Ao reconectar, recarrega tudo para não perder eventos ocorridos durante a queda.
 * Cada tela usa um canal próprio (tópico único): várias telas da mesma lista abertas
 * na pilha não disputam o mesmo canal; os eventos repetidos são idempotentes no cache.
 */
export function useListRealtime(listId: string) {
  useEffect(() => {
    if (!listId) return;
    let wasDisconnected = false;
    const filter = `list_id=eq.${listId}`;

    const channel = supabase
      .channel(`list-data:${listId}:${++channelSeq}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter }, (payload) => {
        if (payload.eventType === 'DELETE') {
          queryClient.invalidateQueries({ queryKey: qk.products(listId) });
          return;
        }
        const incoming = normalizeProduct(payload.new as Record<string, unknown>);
        queryClient.setQueryData<Product[]>(qk.products(listId), (old) => upsertProduct(old, incoming, pendingPatchFor(incoming.id)));
        queryClient.invalidateQueries({ queryKey: qk.allLists });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter }, (payload) => {
        const msg = payload.new as Message;
        queryClient.setQueryData<Message[]>(qk.messages(listId, msg.product_id), (old) => {
          const list = old ?? [];
          return list.some((m) => m.id === msg.id) ? list.map((m) => (m.id === msg.id ? msg : m)) : [...list, msg];
        });
        queryClient.invalidateQueries({ queryKey: qk.conversations });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'approval_requests', filter }, () => {
        queryClient.invalidateQueries({ queryKey: qk.approvals(listId) });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'list_members', filter }, () => {
        queryClient.invalidateQueries({ queryKey: qk.members(listId) });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log', filter }, () => {
        queryClient.invalidateQueries({ queryKey: qk.activity(listId) });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'shopping_lists', filter: `id=eq.${listId}` }, () => {
        queryClient.invalidateQueries({ queryKey: qk.list(listId) });
        queryClient.invalidateQueries({ queryKey: qk.allLists });
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          if (wasDisconnected) {
            ['products', 'messages', 'approvals', 'members', 'activity'].forEach((k) =>
              queryClient.invalidateQueries({ queryKey: [k, listId] }),
            );
            void flushOutbox();
          }
          wasDisconnected = false;
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          wasDisconnected = true;
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [listId]);
}

export interface PresenceInfo {
  userId: string;
  name: string;
  shopping: boolean;
}

/** Quem está com a lista aberta agora (ex.: "Larissa comprando também"). Canal compartilhado pelo tópico. */
export function useListPresence(listId: string, me: PresenceInfo | null) {
  const [online, setOnline] = useState<PresenceInfo[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const meRef = useRef(me);
  useEffect(() => {
    meRef.current = me;
  });
  const key = me?.userId;
  const state = me ? `${me.name}|${me.shopping}` : '';

  useEffect(() => {
    if (!listId || !key) return;
    const channel = supabase.channel(`presence:${listId}`, { config: { presence: { key } } });
    channel
      .on('presence', { event: 'sync' }, () => {
        const st = channel.presenceState<PresenceInfo>();
        setOnline(Object.values(st).flat().map(({ userId, name, shopping }) => ({ userId, name, shopping })));
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && meRef.current) void channel.track(meRef.current);
      });
    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [listId, key]);

  useEffect(() => {
    if (meRef.current && channelRef.current) void channelRef.current.track(meRef.current);
  }, [state]);

  return online;
}

/**
 * Tempo real global do usuário: novas notificações (toast + badge) e mudanças de
 * participação (ex.: pedido de entrada aprovado → a lista aparece na Home).
 */
export function useUserRealtime(userId: string | null) {
  useEffect(() => {
    if (!userId) return;
    let wasDisconnected = false;
    const channel = supabase
      .channel(`user:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, (payload) => {
        const n = payload.new as AppNotification;
        queryClient.setQueryData<AppNotification[]>(qk.notifications, (old) => [n, ...(old ?? []).filter((o) => o.id !== n.id)]);
        if (AppState.currentState === 'active' && n.type !== 'message') showToast(n.body, 'info');
        if (n.type === 'join_accepted' || n.type === 'list_completed') queryClient.invalidateQueries({ queryKey: qk.allLists });
        if (n.type === 'join_request' && n.list_id) queryClient.invalidateQueries({ queryKey: qk.members(n.list_id) });
        if (n.type === 'message') queryClient.invalidateQueries({ queryKey: qk.conversations });
        const unread = (queryClient.getQueryData<AppNotification[]>(qk.notifications) ?? []).filter((x) => !x.read_at).length;
        void setBadge(unread);
      })
      // Aviso resolvido em outra tela/aparelho (ex.: pedido aceito por outro administrador):
      // atualiza a central para não sobrar botão "Aceitar" de um pedido já respondido.
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, (payload) => {
        const n = payload.new as AppNotification;
        queryClient.setQueryData<AppNotification[]>(qk.notifications, (old) => (old ?? []).map((o) => (o.id === n.id ? { ...o, ...n } : o)));
        const unread = (queryClient.getQueryData<AppNotification[]>(qk.notifications) ?? []).filter((x) => !x.read_at).length;
        void setBadge(unread);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'list_members', filter: `user_id=eq.${userId}` }, () => {
        queryClient.invalidateQueries({ queryKey: qk.allLists });
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && wasDisconnected) {
          queryClient.invalidateQueries({ queryKey: qk.notifications });
          queryClient.invalidateQueries({ queryKey: qk.allLists });
        }
        wasDisconnected = status !== 'SUBSCRIBED';
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);
}

import NetInfo from '@react-native-community/netinfo';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useNotificationTap } from '@/hooks/useNotificationTap';
import { useUserRealtime } from '@/hooks/useRealtime';
import { loadOutbox } from '@/offline/outbox';
import { flushOutbox } from '@/offline/sync';
import { registerForPush } from '@/services/push';

import { useAuth } from './AuthProvider';

function routeFor(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null;
  const listId = (data.listId ?? data.list_id) as string | undefined;
  const productId = (data.productId ?? data.product_id) as string | undefined;
  const type = data.type as string | undefined;
  if (type === 'join_request' && listId) return `/lists/${listId}/share`;
  if (type === 'message' && listId) return productId ? `/lists/${listId}/product/${productId}?tab=chat` : `/lists/${listId}?tab=chat`;
  if (listId && productId) return `/lists/${listId}/product/${productId}`;
  if (listId) return `/lists/${listId}`;
  return '/notifications';
}

/** Efeitos globais da sessão logada: tempo real, push, fila offline e toques em notificações. */
export function AppEffects() {
  const { userId } = useAuth();
  const lastHandled = useRef<string | null>(null);
  const lastTap = useNotificationTap();

  useUserRealtime(userId);

  useEffect(() => {
    if (!userId) return;
    void loadOutbox().then(flushOutbox);
    void registerForPush();

    const net = NetInfo.addEventListener((s) => {
      if (s.isConnected) void flushOutbox();
    });
    const app = AppState.addEventListener('change', (s) => {
      if (s === 'active') void flushOutbox();
    });
    return () => {
      net();
      app.remove();
    };
  }, [userId]);

  // Toque na notificação push (app aberto em segundo plano ou fechado).
  useEffect(() => {
    if (!userId || !lastTap) return;
    if (lastHandled.current === lastTap.id) return;
    lastHandled.current = lastTap.id;
    const target = routeFor(lastTap.data);
    if (target) setTimeout(() => router.push(target as never), 50);
  }, [userId, lastTap]);

  return null;
}

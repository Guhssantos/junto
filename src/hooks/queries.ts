import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { DEFAULT_CATEGORIES } from '@/lib/categories';
import { buildRoleMap, can } from '@/lib/permissions';
import { normalizeProduct, visibleProducts } from '@/lib/productCache';
import { qk } from '@/lib/queryKeys';
import { loadOutbox, pendingAdds, pendingMessages, pendingPatchFor } from '@/offline/outbox';
import { useAuth } from '@/providers/AuthProvider';
import { fetchConversations, fetchMessages } from '@/services/chat';
import { fetchActivity, fetchList, fetchLists, fetchMembers, fetchPurchaseHistory } from '@/services/lists';
import { fetchRolePermissions } from '@/services/members';
import { fetchNotifications } from '@/services/notifications';
import { fetchApprovals, fetchCategories, fetchProducts } from '@/services/products';
import type { Message, Permission, Product } from '@/types/models';

export function useLists(status: 'active' | 'completed') {
  const { userId } = useAuth();
  return useQuery({ queryKey: qk.lists(status), queryFn: () => fetchLists(status, userId!), enabled: !!userId });
}

export function useList(listId: string) {
  return useQuery({ queryKey: qk.list(listId), queryFn: () => fetchList(listId), enabled: !!listId });
}

/** Produtos do servidor + alterações ainda na fila offline (a tela nunca "perde" o que o usuário fez). */
export function useProducts(listId: string) {
  const query = useQuery({
    queryKey: qk.products(listId),
    enabled: !!listId,
    queryFn: async (): Promise<Product[]> => {
      const server = await fetchProducts(listId);
      await loadOutbox();
      const merged = server.map((p) => {
        const patch = pendingPatchFor(p.id);
        return patch ? { ...p, ...patch, _pending: true } : p;
      });
      const ids = new Set(merged.map((p) => p.id));
      const now = new Date().toISOString();
      for (const op of pendingAdds(listId)) {
        if (ids.has(op.payload.id)) continue;
        merged.push({
          ...normalizeProduct({
            ...op.payload,
            list_id: listId,
            category_id: op.payload.category_id ?? 'outros',
            actual_price: null,
            status: 'pending',
            version: 0,
            created_at: now,
            updated_at: now,
            deleted_at: null,
          }),
          ...pendingPatchFor(op.payload.id),
          _pending: true,
        });
      }
      return merged;
    },
  });
  const visible = useMemo(() => visibleProducts(query.data), [query.data]);
  return { ...query, products: visible };
}

export function useMembers(listId: string) {
  return useQuery({ queryKey: qk.members(listId), queryFn: () => fetchMembers(listId), enabled: !!listId });
}

export function useApprovals(listId: string) {
  return useQuery({ queryKey: qk.approvals(listId), queryFn: () => fetchApprovals(listId), enabled: !!listId });
}

export function useMessages(listId: string, productId: string | null) {
  return useQuery({
    queryKey: qk.messages(listId, productId),
    enabled: !!listId,
    queryFn: async (): Promise<Message[]> => {
      const server = await fetchMessages(listId, productId);
      await loadOutbox();
      const ids = new Set(server.map((m) => m.id));
      const pending = pendingMessages(listId)
        .filter((op) => op.payload.product_id === productId && !ids.has(op.payload.id))
        .map<Message>((op) => ({
          id: op.payload.id,
          list_id: listId,
          product_id: productId,
          sender_id: null,
          body: op.payload.body,
          kind: 'text',
          created_at: new Date(op.createdAt).toISOString(),
          _pending: true,
        }));
      return [...server, ...pending];
    },
  });
}

export function useConversations() {
  return useQuery({ queryKey: qk.conversations, queryFn: fetchConversations });
}

export function useNotifications() {
  const { userId } = useAuth();
  // Sempre confere ao abrir: um aviso de ação (ex.: pedido de entrada) pode ter sido resolvido em outro aparelho.
  return useQuery({ queryKey: qk.notifications, queryFn: fetchNotifications, enabled: !!userId, refetchOnMount: 'always' });
}

export function useUnreadCount() {
  const { data } = useNotifications();
  return useMemo(() => (data ?? []).filter((n) => !n.read_at).length, [data]);
}

export function useActivity(listId: string) {
  return useQuery({ queryKey: qk.activity(listId), queryFn: () => fetchActivity(listId), enabled: !!listId });
}

export function usePurchaseHistory(listId: string, enabled = true) {
  return useQuery({ queryKey: qk.history(listId), queryFn: () => fetchPurchaseHistory(listId), enabled: !!listId && enabled });
}

export function useCategories() {
  const q = useQuery({ queryKey: qk.categories, queryFn: fetchCategories, staleTime: 1000 * 60 * 60 * 24 });
  return q.data?.length ? q.data : DEFAULT_CATEGORIES;
}

/** Papel do usuário na lista + verificação de permissão (apenas para a interface). */
export function usePermissions(listId: string) {
  const { userId } = useAuth();
  const members = useMembers(listId);
  const roles = useQuery({ queryKey: qk.roles, queryFn: fetchRolePermissions, staleTime: 1000 * 60 * 60 * 24 });
  const map = useMemo(() => buildRoleMap(roles.data), [roles.data]);
  const me = members.data?.find((m) => m.user_id === userId && m.status === 'active');
  return {
    role: me?.role_id ?? null,
    can: (perm: Permission) => can(me?.role_id, perm, map),
    loading: members.isLoading,
  };
}

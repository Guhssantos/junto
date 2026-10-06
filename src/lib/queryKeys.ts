// Chaves do React Query centralizadas (evita erros de digitação na invalidação).
export const qk = {
  me: ['me'] as const,
  lists: (status: 'active' | 'completed') => ['lists', status] as const,
  allLists: ['lists'] as const,
  list: (id: string) => ['list', id] as const,
  products: (listId: string) => ['products', listId] as const,
  members: (listId: string) => ['members', listId] as const,
  approvals: (listId: string) => ['approvals', listId] as const,
  messages: (listId: string, productId: string | null) => ['messages', listId, productId ?? 'list'] as const,
  listMessages: (listId: string) => ['messages', listId] as const,
  conversations: ['conversations'] as const,
  notifications: ['notifications'] as const,
  activity: (listId: string) => ['activity', listId] as const,
  history: (listId: string) => ['history', listId] as const,
  invite: (listId: string) => ['invite', listId] as const,
  categories: ['categories'] as const,
  roles: ['role_permissions'] as const,
};

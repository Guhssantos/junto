import type { Product } from '@/types/models';

// Regras para combinar o que chega do servidor (consulta ou realtime) com o cache local.

/**
 * Insere/atualiza um produto vindo do servidor.
 * - Ignora versões mais antigas que a do cache (eventos realtime fora de ordem).
 * - `pendingPatch`: alterações locais ainda na fila offline, reaplicadas por cima
 *   para a tela não "voltar" ao valor antigo enquanto a fila não sincroniza.
 */
export function upsertProduct(list: Product[] | undefined, incoming: Product, pendingPatch?: Partial<Product>): Product[] {
  const items = list ?? [];
  const merged: Product = pendingPatch ? { ...incoming, ...pendingPatch, _pending: true } : incoming;
  const idx = items.findIndex((p) => p.id === incoming.id);
  if (idx === -1) return [...items, merged];
  const current = items[idx];
  if (!pendingPatch && !current._pending && current.version > incoming.version) return items;
  const next = items.slice();
  next[idx] = merged;
  return next;
}

export function patchProduct(list: Product[] | undefined, id: string, patch: Partial<Product>): Product[] {
  return (list ?? []).map((p) => (p.id === id ? { ...p, ...patch } : p));
}

export function visibleProducts(list: Product[] | undefined): Product[] {
  return (list ?? []).filter((p) => !p.deleted_at);
}

/** Normaliza números que o PostgREST devolve como string (numeric). */
export function normalizeProduct(raw: Record<string, unknown>): Product {
  const num = (v: unknown) => (v == null ? null : Number(v));
  return {
    ...(raw as unknown as Product),
    quantity: Number(raw.quantity ?? 1),
    estimated_price: num(raw.estimated_price),
    actual_price: num(raw.actual_price),
    version: Number(raw.version ?? 1),
  };
}

/** Agrupa por categoria mantendo a ordem das categorias; comprados vão para o fim do grupo. */
export function groupByCategory<T extends Pick<Product, 'category_id' | 'status' | 'name'>>(
  items: T[],
  order: string[],
): { categoryId: string; items: T[] }[] {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const arr = map.get(it.category_id) ?? [];
    arr.push(it);
    map.set(it.category_id, arr);
  }
  const rank = (id: string) => {
    const i = order.indexOf(id);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...map.entries()]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([categoryId, arr]) => ({
      categoryId,
      items: arr.slice().sort((a, b) => {
        const da = a.status === 'purchased' ? 1 : 0;
        const db = b.status === 'purchased' ? 1 : 0;
        return da - db || a.name.localeCompare(b.name, 'pt-BR');
      }),
    }));
}

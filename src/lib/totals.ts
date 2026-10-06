import type { Product, ProductStatus } from '@/types/models';

// Mesmas regras da view public.list_summaries (supabase/migrations/..._security.sql).
// Itens recusados, cancelados, indisponíveis ou aguardando resposta não entram nos totais.
export const COUNTABLE: ReadonlySet<ProductStatus> = new Set(['pending', 'in_review', 'approved', 'purchased']);

const round2 = (n: number) => Math.round(n * 100) / 100;

export function subtotal(p: Pick<Product, 'quantity' | 'estimated_price' | 'actual_price'>): number {
  return round2(Number(p.quantity) * Number(p.actual_price ?? p.estimated_price ?? 0));
}

/** Diferença unitária entre preço encontrado e estimado (null se faltar um deles). */
export function priceDifference(p: Pick<Product, 'estimated_price' | 'actual_price'>): number | null {
  if (p.estimated_price == null || p.actual_price == null) return null;
  return round2(Number(p.actual_price) - Number(p.estimated_price));
}

export interface Totals {
  itemsCount: number;
  purchasedCount: number;
  totalEstimated: number;
  totalUpdated: number;
  totalSpent: number;
  difference: number;
  progress: number; // 0..1
  awaitingCount: number;
}

export function computeTotals(products: Product[]): Totals {
  let itemsCount = 0;
  let purchasedCount = 0;
  let totalEstimated = 0;
  let totalUpdated = 0;
  let totalSpent = 0;
  let awaitingCount = 0;

  for (const p of products) {
    if (p.deleted_at) continue;
    if (p.status === 'awaiting_confirmation') awaitingCount++;
    if (!COUNTABLE.has(p.status)) continue;
    const q = Number(p.quantity);
    itemsCount++;
    totalEstimated += q * Number(p.estimated_price ?? p.actual_price ?? 0);
    totalUpdated += q * Number(p.actual_price ?? p.estimated_price ?? 0);
    if (p.status === 'purchased') {
      purchasedCount++;
      totalSpent += q * Number(p.actual_price ?? p.estimated_price ?? 0);
    }
  }

  return {
    itemsCount,
    purchasedCount,
    totalEstimated: round2(totalEstimated),
    totalUpdated: round2(totalUpdated),
    totalSpent: round2(totalSpent),
    difference: round2(totalUpdated - totalEstimated),
    progress: itemsCount === 0 ? 0 : purchasedCount / itemsCount,
    awaitingCount,
  };
}

/** Resumo exibido na conclusão (somente itens comprados), igual a finalize_list(). */
export function computeCompletion(products: Product[]) {
  const bought = products.filter((p) => !p.deleted_at && p.status === 'purchased');
  const estimated = round2(bought.reduce((s, p) => s + Number(p.quantity) * Number(p.estimated_price ?? p.actual_price ?? 0), 0));
  const final = round2(bought.reduce((s, p) => s + subtotal(p), 0));
  return { count: bought.length, estimated, final, difference: round2(final - estimated) };
}

export function progressLabel(t: Pick<Totals, 'purchasedCount' | 'itemsCount' | 'progress'>): string {
  return `${t.purchasedCount} de ${t.itemsCount} ${t.itemsCount === 1 ? 'item comprado' : 'itens comprados'}`;
}

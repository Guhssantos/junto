import { computeCompletion, computeTotals, priceDifference, progressLabel, subtotal } from '@/lib/totals';

import { product } from './fixtures';

describe('subtotal e diferença', () => {
  it('usa o preço encontrado e, sem ele, o estimado', () => {
    expect(subtotal(product({ quantity: 2, estimated_price: 25, actual_price: 27.9 }))).toBe(55.8);
    expect(subtotal(product({ quantity: 3, estimated_price: 8.9 }))).toBe(26.7);
    expect(subtotal(product({ quantity: 1.2, estimated_price: 49.9 }))).toBe(59.88);
  });
  it('calcula a diferença entre encontrado e estimado (exemplo do arroz)', () => {
    expect(priceDifference(product({ estimated_price: 25, actual_price: 27.9 }))).toBe(2.9);
    expect(priceDifference(product({ estimated_price: 25 }))).toBeNull();
  });
});

describe('computeTotals', () => {
  // Mesmo cenário dos testes SQL (list_summaries) — os dois cálculos precisam bater.
  const items = [
    product({ quantity: 3, estimated_price: 25, actual_price: 26.5, status: 'purchased' }),
    product({ quantity: 1, estimated_price: 12.9, actual_price: 12.9, status: 'approved' }),
    product({ quantity: 6, estimated_price: 5.49, status: 'pending', deleted_at: '2026-10-05T12:10:00Z' }),
    product({ quantity: 1, estimated_price: 24.9, status: 'rejected' }),
    product({ quantity: 1, estimated_price: 10, status: 'awaiting_confirmation' }),
    product({ quantity: 1, estimated_price: 5, status: 'cancelled' }),
    product({ quantity: 1, estimated_price: 5, status: 'unavailable' }),
  ];
  const t = computeTotals(items);

  it('ignora removidos, recusados, cancelados, indisponíveis e aguardando', () => {
    expect(t.itemsCount).toBe(2);
    expect(t.purchasedCount).toBe(1);
    expect(t.awaitingCount).toBe(1);
  });
  it('soma estimado, atualizado e no carrinho', () => {
    expect(t.totalEstimated).toBe(87.9);
    expect(t.totalUpdated).toBe(92.4);
    expect(t.totalSpent).toBe(79.5);
    expect(t.difference).toBe(4.5);
  });
  it('calcula progresso', () => {
    expect(t.progress).toBe(0.5);
    expect(progressLabel(t)).toBe('1 de 2 itens comprados');
  });
  it('lista vazia não divide por zero', () => {
    expect(computeTotals([]).progress).toBe(0);
  });
});

describe('computeCompletion', () => {
  it('resume apenas os comprados (igual a finalize_list)', () => {
    const r = computeCompletion([
      product({ quantity: 3, estimated_price: 25, actual_price: 26.5, status: 'purchased' }),
      product({ quantity: 1, estimated_price: 12.9, status: 'approved' }),
    ]);
    expect(r).toEqual({ count: 1, estimated: 75, final: 79.5, difference: 4.5 });
  });
});

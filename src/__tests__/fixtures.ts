import type { Product } from '@/types/models';

let n = 0;
export function product(over: Partial<Product> = {}): Product {
  n++;
  return {
    id: `p-${n}`,
    list_id: 'list-1',
    name: `Produto ${n}`,
    category_id: 'outros',
    quantity: 1,
    unit: 'un',
    estimated_price: null,
    actual_price: null,
    note: null,
    status: 'pending',
    added_by: 'u-1',
    assigned_to: null,
    updated_by: 'u-1',
    purchased_by: null,
    purchased_at: null,
    version: 1,
    created_at: '2026-10-05T12:00:00Z',
    updated_at: '2026-10-05T12:00:00Z',
    deleted_at: null,
    ...over,
  };
}

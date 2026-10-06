import type { FieldConflict } from '@/types/models';

// Conflitos devolvidos pelo servidor (dois participantes mudaram o mesmo campo).
// A interface (ConflictDialog) mostra um por vez e pergunta qual valor manter.

export interface PendingConflict {
  id: string;
  listId: string;
  productId: string;
  productName: string;
  conflicts: FieldConflict[];
}

let items: PendingConflict[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function pushConflict(c: PendingConflict) {
  items = [...items.filter((i) => i.productId !== c.productId), c];
  emit();
}

export function shiftConflict(id: string) {
  items = items.filter((i) => i.id !== id);
  emit();
}

export function getConflicts() {
  return items;
}

export function subscribeConflicts(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

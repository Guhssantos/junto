import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Product } from '@/types/models';

// Fila de alterações feitas sem internet (ou enquanto a requisição não terminou).
// Persistida no aparelho: fechar o app no mercado não perde nada.
// Todas as operações são idempotentes no servidor (IDs gerados no aparelho e merge de 3 vias).

export type OutboxOp =
  | {
      id: string;
      kind: 'add_product';
      listId: string;
      createdAt: number;
      payload: {
        id: string;
        name: string;
        quantity: number;
        unit: string | null;
        category_id: string | null;
        estimated_price: number | null;
        note: string | null;
      };
    }
  | {
      id: string;
      kind: 'update_product';
      listId: string;
      createdAt: number;
      productId: string;
      productName: string;
      patch: Partial<Product>;
      base: Partial<Product>;
    }
  | { id: string; kind: 'delete_product'; listId: string; createdAt: number; productId: string }
  | {
      id: string;
      kind: 'send_message';
      listId: string;
      createdAt: number;
      payload: { id: string; body: string; product_id: string | null };
    };

const KEY = 'junto.outbox.v1';
let ops: OutboxOp[] = [];
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
  AsyncStorage.setItem(KEY, JSON.stringify(ops)).catch(() => undefined);
}

export async function loadOutbox(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const stored = JSON.parse(raw) as OutboxOp[];
      // Mantém o que foi enfileirado nesta sessão antes da leitura terminar.
      const ids = new Set(ops.map((o) => o.id));
      ops = [...stored.filter((o) => !ids.has(o.id)), ...ops];
    }
  } catch {
    // arquivo corrompido: começa vazio
  }
  listeners.forEach((l) => l());
}

export function subscribeOutbox(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getOutbox(): OutboxOp[] {
  return ops;
}

/**
 * Enfileira uma operação. Atualizações seguidas do mesmo produto são combinadas:
 * o patch mais recente vence, e a base de cada campo é a mais antiga (o que o usuário
 * viu antes da primeira edição) — assim o servidor ainda detecta conflitos.
 */
export function enqueue(op: OutboxOp): void {
  if (op.kind === 'update_product') {
    const idx = ops.findIndex((o) => o.kind === 'update_product' && o.productId === op.productId);
    if (idx !== -1) {
      const prev = ops[idx] as Extract<OutboxOp, { kind: 'update_product' }>;
      ops = ops.slice();
      ops[idx] = { ...prev, patch: { ...prev.patch, ...op.patch }, base: { ...op.base, ...prev.base } };
      emit();
      return;
    }
    // Produto criado offline e ainda não enviado: aplica a alteração direto na criação.
    const addIdx = ops.findIndex((o) => o.kind === 'add_product' && o.payload.id === op.productId);
    const onlyCreateFields = Object.keys(op.patch).every((k) =>
      ['name', 'quantity', 'unit', 'category_id', 'estimated_price', 'note'].includes(k),
    );
    if (addIdx !== -1 && onlyCreateFields) {
      const prev = ops[addIdx] as Extract<OutboxOp, { kind: 'add_product' }>;
      ops = ops.slice();
      ops[addIdx] = { ...prev, payload: { ...prev.payload, ...(op.patch as object) } } as OutboxOp;
      emit();
      return;
    }
  }
  if (op.kind === 'delete_product') {
    const addIdx = ops.findIndex((o) => o.kind === 'add_product' && o.payload.id === op.productId);
    if (addIdx !== -1) {
      // Criado e removido offline: nada precisa ir ao servidor.
      ops = ops.filter((o) => !(o.kind === 'add_product' && o.payload.id === op.productId) &&
        !(o.kind === 'update_product' && o.productId === op.productId));
      emit();
      return;
    }
    ops = ops.filter((o) => !(o.kind === 'update_product' && o.productId === op.productId));
  }
  ops = [...ops, op];
  emit();
}

export function remove(opId: string): void {
  ops = ops.filter((o) => o.id !== opId);
  emit();
}

export function clearOutbox(): void {
  ops = [];
  emit();
}

/** Alterações locais pendentes de um produto (para reaplicar sobre dados do servidor). */
export function pendingPatchFor(productId: string): Partial<Product> | undefined {
  let patch: Partial<Product> | undefined;
  for (const o of ops) {
    if (o.kind === 'update_product' && o.productId === productId) patch = { ...patch, ...o.patch };
    if (o.kind === 'delete_product' && o.productId === productId) patch = { ...patch, deleted_at: new Date(o.createdAt).toISOString() };
  }
  return patch;
}

export function pendingAdds(listId: string) {
  return ops.filter((o): o is Extract<OutboxOp, { kind: 'add_product' }> => o.kind === 'add_product' && o.listId === listId);
}

export function pendingMessages(listId: string) {
  return ops.filter((o): o is Extract<OutboxOp, { kind: 'send_message' }> => o.kind === 'send_message' && o.listId === listId);
}

/** Somente para testes. */
export function __resetOutboxForTests(): void {
  ops = [];
  loaded = true;
}

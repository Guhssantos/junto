import NetInfo from '@react-native-community/netinfo';

import { AppError, isNetworkError, toAppError } from '@/lib/errors';
import { normalizeProduct, patchProduct, upsertProduct } from '@/lib/productCache';
import { queryClient } from '@/lib/queryClient';
import { qk } from '@/lib/queryKeys';
import { showToast } from '@/lib/toast';
import { uuid } from '@/lib/uuid';
import { rpcSendMessage } from '@/services/chat';
import { type PickedImage, prepareImage, rpcSendImageMessage, uploadChatImage } from '@/services/chatImages';
import { rpcAddProduct, rpcDeleteProduct, rpcUpdateProduct, validateProductInput } from '@/services/products';
import type { Message, Product } from '@/types/models';

import { pushConflict } from './conflicts';
import { enqueue, getOutbox, loadOutbox, pendingPatchFor, remove, type OutboxOp } from './outbox';

// Ações de produto e chat que funcionam offline:
// 1) atualizam a tela na hora (otimista); 2) entram na fila; 3) a fila é enviada
// assim que houver conexão. O servidor responde com o estado oficial.

let flushing: Promise<void> | null = null;

export function flushOutbox(): Promise<void> {
  if (!flushing) {
    flushing = runFlush().finally(() => {
      flushing = null;
    });
  }
  return flushing;
}

async function runFlush() {
  await loadOutbox();
  const net = await NetInfo.fetch();
  if (net.isConnected === false) return;

  for (const op of [...getOutbox()]) {
    try {
      await execute(op);
      remove(op.id);
    } catch (err) {
      if (isNetworkError(err)) return; // tenta de novo quando a conexão voltar
      remove(op.id);
      const e = toAppError(err);
      showToast(describeFailure(op, e.message), 'error');
      queryClient.invalidateQueries({ queryKey: qk.products(op.listId) });
      queryClient.invalidateQueries({ queryKey: qk.listMessages(op.listId) });
    }
  }
}

function describeFailure(op: OutboxOp, reason: string) {
  switch (op.kind) {
    case 'add_product':
      return `Não conseguimos adicionar “${op.payload.name}”. ${reason}`;
    case 'update_product':
      return `Não conseguimos atualizar “${op.productName}”. ${reason}`;
    case 'delete_product':
      return `Não conseguimos remover o produto. ${reason}`;
    case 'send_message':
      return `Mensagem não enviada. ${reason}`;
  }
}

async function execute(op: OutboxOp) {
  switch (op.kind) {
    case 'add_product': {
      const product = await rpcAddProduct(op.listId, op.payload);
      queryClient.setQueryData<Product[]>(qk.products(op.listId), (old) =>
        upsertProduct(old, product, pendingPatchFor(product.id)),
      );
      return;
    }
    case 'update_product': {
      const res = await rpcUpdateProduct(op.productId, op.patch, op.base);
      queryClient.setQueryData<Product[]>(qk.products(op.listId), (old) => upsertProduct(old, res.product));
      if (res.status === 'conflict') {
        pushConflict({ id: op.id, listId: op.listId, productId: op.productId, productName: res.product.name, conflicts: res.conflicts });
      }
      return;
    }
    case 'delete_product':
      await rpcDeleteProduct(op.productId);
      return;
    case 'send_message': {
      const msg = await rpcSendMessage(op.listId, op.payload);
      queryClient.setQueryData<Message[]>(qk.messages(op.listId, op.payload.product_id), (old) =>
        (old ?? []).map((m) => (m.id === msg.id ? msg : m)),
      );
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// API usada pelas telas
// ---------------------------------------------------------------------------

export interface NewProductInput {
  name: string;
  quantity: number;
  unit: string | null;
  categoryId: string | null;
  estimatedPrice: number | null;
  note?: string | null;
}

export function addProduct(listId: string, userId: string, input: NewProductInput): Product {
  validateProductInput(input);
  const id = uuid();
  const now = new Date().toISOString();
  const optimistic: Product = normalizeProduct({
    id,
    list_id: listId,
    name: input.name.trim(),
    category_id: input.categoryId ?? 'outros',
    quantity: input.quantity,
    unit: input.unit,
    estimated_price: input.estimatedPrice,
    actual_price: null,
    note: input.note ?? null,
    status: 'pending',
    added_by: userId,
    assigned_to: null,
    updated_by: userId,
    purchased_by: null,
    purchased_at: null,
    version: 0,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  });
  queryClient.setQueryData<Product[]>(qk.products(listId), (old) => [...(old ?? []), { ...optimistic, _pending: true }]);
  enqueue({
    id: uuid(),
    kind: 'add_product',
    listId,
    createdAt: Date.now(),
    payload: {
      id,
      name: optimistic.name,
      quantity: optimistic.quantity,
      unit: optimistic.unit,
      category_id: input.categoryId,
      estimated_price: input.estimatedPrice,
      note: input.note?.trim() || null,
    },
  });
  void flushOutbox();
  return optimistic;
}

/** Envia apenas os campos alterados, junto com o valor visto antes (para detectar conflito). */
export function updateProduct(product: Product, patch: Partial<Product>) {
  const keys = Object.keys(patch) as (keyof Product)[];
  const changed = keys.filter((k) => patch[k] !== product[k]);
  if (!changed.length) return;
  const cleanPatch = Object.fromEntries(changed.map((k) => [k, patch[k]])) as Partial<Product>;
  const base = Object.fromEntries(changed.map((k) => [k, product[k]])) as Partial<Product>;

  const local: Partial<Product> = { ...cleanPatch, _pending: true };
  if (cleanPatch.status === 'purchased') local.purchased_at = new Date().toISOString();
  queryClient.setQueryData<Product[]>(qk.products(product.list_id), (old) => patchProduct(old, product.id, local));

  enqueue({
    id: uuid(),
    kind: 'update_product',
    listId: product.list_id,
    createdAt: Date.now(),
    productId: product.id,
    productName: product.name,
    patch: cleanPatch,
    base,
  });
  void flushOutbox();
}

export function togglePurchased(product: Product) {
  updateProduct(product, { status: product.status === 'purchased' ? 'pending' : 'purchased' });
}

export function deleteProduct(product: Product) {
  queryClient.setQueryData<Product[]>(qk.products(product.list_id), (old) =>
    patchProduct(old, product.id, { deleted_at: new Date().toISOString(), _pending: true }),
  );
  enqueue({ id: uuid(), kind: 'delete_product', listId: product.list_id, createdAt: Date.now(), productId: product.id });
  void flushOutbox();
}

export function sendMessage(listId: string, userId: string, body: string, productId: string | null) {
  const text = body.trim();
  if (!text) return;
  if (text.length > 2000) {
    showToast('A mensagem pode ter até 2.000 caracteres.', 'warning');
    return;
  }
  const id = uuid();
  const optimistic: Message = {
    id,
    list_id: listId,
    product_id: productId,
    sender_id: userId,
    body: text,
    kind: 'text',
    created_at: new Date().toISOString(),
    _pending: true,
  };
  queryClient.setQueryData<Message[]>(qk.messages(listId, productId), (old) => [...(old ?? []), optimistic]);
  enqueue({ id: uuid(), kind: 'send_message', listId, createdAt: Date.now(), payload: { id, body: text, product_id: productId } });
  void flushOutbox();
}

/**
 * Foto no chat (com legenda opcional). Precisa de conexão: o arquivo vai para o
 * Storage antes da mensagem. A foto aparece na hora ("enviando…") a partir do aparelho.
 */
export async function sendImageMessage(listId: string, userId: string, image: PickedImage, caption: string, productId: string | null): Promise<void> {
  const text = caption.trim();
  if (text.length > 2000) throw new AppError('validation', 'A legenda pode ter até 2.000 caracteres.');
  const net = await NetInfo.fetch();
  if (net.isConnected === false) throw new AppError('offline', 'Sem internet. Fotos são enviadas só com conexão — tente de novo quando voltar.');

  const id = uuid();
  const key = qk.messages(listId, productId);
  const optimistic: Message = {
    id,
    list_id: listId,
    product_id: productId,
    sender_id: userId,
    body: text,
    kind: 'text',
    created_at: new Date().toISOString(),
    image_width: image.width,
    image_height: image.height,
    _pending: true,
    _localUri: image.uri,
  };
  queryClient.setQueryData<Message[]>(key, (old) => [...(old ?? []), optimistic]);
  try {
    const prepared = await prepareImage(image);
    const path = await uploadChatImage(listId, prepared);
    const msg = await rpcSendImageMessage(listId, {
      id,
      body: text,
      product_id: productId,
      image_path: path,
      image_width: prepared.width,
      image_height: prepared.height,
    });
    queryClient.setQueryData<Message[]>(key, (old) => (old ?? []).map((m) => (m.id === id ? { ...msg, _localUri: image.uri } : m)));
    queryClient.invalidateQueries({ queryKey: qk.conversations });
  } catch (e) {
    queryClient.setQueryData<Message[]>(key, (old) => (old ?? []).filter((m) => m.id !== id));
    throw toAppError(e, 'Não conseguimos enviar a foto.');
  }
}

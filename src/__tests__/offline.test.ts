import { __resetOutboxForTests, enqueue, getOutbox, pendingPatchFor, type OutboxOp } from '@/offline/outbox';
import { groupByCategory, upsertProduct } from '@/lib/productCache';

import { product } from './fixtures';

const base = { listId: 'list-1', createdAt: 1 };
let seq = 0;
const opId = () => `op-${++seq}`;

beforeEach(() => __resetOutboxForTests());

describe('fila offline', () => {
  it('combina edições do mesmo produto mantendo a base mais antiga', () => {
    enqueue({ ...base, id: opId(), kind: 'update_product', productId: 'p1', productName: 'Arroz', patch: { actual_price: 26 }, base: { actual_price: 25 } });
    enqueue({ ...base, id: opId(), kind: 'update_product', productId: 'p1', productName: 'Arroz', patch: { actual_price: 27.9, quantity: 3 }, base: { actual_price: 26, quantity: 2 } });
    const ops = getOutbox();
    expect(ops).toHaveLength(1);
    const op = ops[0] as Extract<OutboxOp, { kind: 'update_product' }>;
    expect(op.patch).toEqual({ actual_price: 27.9, quantity: 3 });
    expect(op.base).toEqual({ actual_price: 25, quantity: 2 }); // base original preservada → servidor detecta conflitos
  });

  it('produto criado e removido offline não vai ao servidor', () => {
    enqueue({ ...base, id: opId(), kind: 'add_product', payload: { id: 'new', name: 'Leite', quantity: 1, unit: 'un', category_id: null, estimated_price: null, note: null } });
    enqueue({ ...base, id: opId(), kind: 'update_product', productId: 'new', productName: 'Leite', patch: { status: 'purchased' }, base: { status: 'pending' } });
    enqueue({ ...base, id: opId(), kind: 'delete_product', productId: 'new' });
    expect(getOutbox()).toHaveLength(0);
  });

  it('edição de produto ainda não enviado é aplicada na criação', () => {
    enqueue({ ...base, id: opId(), kind: 'add_product', payload: { id: 'n2', name: 'Pão', quantity: 1, unit: 'un', category_id: null, estimated_price: null, note: null } });
    enqueue({ ...base, id: opId(), kind: 'update_product', productId: 'n2', productName: 'Pão', patch: { quantity: 6 }, base: { quantity: 1 } });
    const ops = getOutbox();
    expect(ops).toHaveLength(1);
    expect((ops[0] as Extract<OutboxOp, { kind: 'add_product' }>).payload.quantity).toBe(6);
  });

  it('expõe as alterações pendentes para reaplicar sobre dados do servidor', () => {
    enqueue({ ...base, id: opId(), kind: 'update_product', productId: 'p9', productName: 'X', patch: { status: 'purchased' }, base: { status: 'pending' } });
    expect(pendingPatchFor('p9')).toEqual({ status: 'purchased' });
    expect(pendingPatchFor('outro')).toBeUndefined();
  });
});

describe('cache de produtos (tempo real)', () => {
  it('ignora evento mais antigo que o cache', () => {
    const v3 = product({ id: 'a', version: 3, actual_price: 27.9 });
    const v2 = { ...v3, version: 2, actual_price: 25 };
    expect(upsertProduct([v3], v2)[0].actual_price).toBe(27.9);
  });
  it('aplica versão nova e reaplica alterações pendentes', () => {
    const local = product({ id: 'a', version: 1 });
    const server = { ...local, version: 2, actual_price: 30 };
    const merged = upsertProduct([local], server, { status: 'purchased' });
    expect(merged[0]).toMatchObject({ version: 2, actual_price: 30, status: 'purchased', _pending: true });
  });
  it('agrupa por categoria e deixa comprados no fim', () => {
    const groups = groupByCategory(
      [
        product({ name: 'Detergente', category_id: 'limpeza' }),
        product({ name: 'Arroz', category_id: 'alimentos', status: 'purchased' }),
        product({ name: 'Feijão', category_id: 'alimentos' }),
      ],
      ['alimentos', 'limpeza'],
    );
    expect(groups.map((g) => g.categoryId)).toEqual(['alimentos', 'limpeza']);
    expect(groups[0].items.map((i) => i.name)).toEqual(['Feijão', 'Arroz']);
  });
});

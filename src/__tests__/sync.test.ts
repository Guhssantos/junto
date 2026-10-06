import NetInfo from '@react-native-community/netinfo';

import { queryClient } from '@/lib/queryClient';
import { qk } from '@/lib/queryKeys';
import { getConflicts } from '@/offline/conflicts';
import { __resetOutboxForTests, getOutbox } from '@/offline/outbox';
import { addProduct, flushOutbox, sendMessage, togglePurchased, updateProduct } from '@/offline/sync';
import * as products from '@/services/products';
import * as chat from '@/services/chat';
import type { Message, Product } from '@/types/models';

import { product } from './fixtures';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/services/products', () => ({
  ...jest.requireActual('@/services/products'),
  rpcAddProduct: jest.fn(),
  rpcUpdateProduct: jest.fn(),
  rpcDeleteProduct: jest.fn(),
}));
jest.mock('@/services/chat', () => ({ rpcSendMessage: jest.fn() }));
jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));

const mocked = products as jest.Mocked<typeof products>;
const mockedChat = chat as jest.Mocked<typeof chat>;
const setOnline = (online: boolean) =>
  (NetInfo.fetch as jest.Mock).mockResolvedValue({ isConnected: online, isInternetReachable: online });
const cached = () => queryClient.getQueryData<Product[]>(qk.products('list-1')) ?? [];

beforeEach(() => {
  __resetOutboxForTests();
  queryClient.clear();
  jest.clearAllMocks();
  setOnline(true);
});

afterAll(() => queryClient.clear());

describe('sincronização offline', () => {
  it('adiciona na hora (otimista) e confirma com o servidor', async () => {
    mocked.rpcAddProduct.mockImplementation(async (_l, p) => product({ id: p.id, name: p.name, version: 1 }));
    addProduct('list-1', 'u-1', { name: 'Leite', quantity: 2, unit: 'L', categoryId: 'laticinios', estimatedPrice: 5.49 });
    expect(cached()).toHaveLength(1);
    expect(cached()[0]._pending).toBe(true);
    await flushOutbox();
    expect(mocked.rpcAddProduct).toHaveBeenCalledTimes(1);
    expect(getOutbox()).toHaveLength(0);
    expect(cached()[0]._pending).toBeUndefined();
  });

  it('sem internet mantém na fila e envia quando a conexão volta', async () => {
    setOnline(false);
    addProduct('list-1', 'u-1', { name: 'Pão', quantity: 1, unit: 'un', categoryId: null, estimatedPrice: null });
    await flushOutbox();
    expect(mocked.rpcAddProduct).not.toHaveBeenCalled();
    expect(getOutbox()).toHaveLength(1);

    setOnline(true);
    mocked.rpcAddProduct.mockImplementation(async (_l, p) => product({ id: p.id, name: p.name }));
    await flushOutbox();
    expect(getOutbox()).toHaveLength(0);
  });

  it('falha de rede durante o envio não perde a alteração', async () => {
    mocked.rpcUpdateProduct.mockRejectedValue(new TypeError('Network request failed'));
    const p = product({ id: 'x1' });
    queryClient.setQueryData(qk.products('list-1'), [p]);
    togglePurchased(p);
    await flushOutbox();
    expect(getOutbox()).toHaveLength(1);
    expect(cached()[0].status).toBe('purchased'); // a tela mostra o que o usuário fez
  });

  it('erro de regra de negócio descarta a operação e recarrega', async () => {
    mocked.rpcUpdateProduct.mockRejectedValue({ message: 'forbidden' });
    const p = product({ id: 'x2' });
    queryClient.setQueryData(qk.products('list-1'), [p]);
    updateProduct(p, { actual_price: 10 });
    await flushOutbox();
    expect(getOutbox()).toHaveLength(0);
  });

  it('envia só os campos alterados com a base para detectar conflito', async () => {
    const p = product({ id: 'x3', actual_price: 25, quantity: 2 });
    queryClient.setQueryData(qk.products('list-1'), [p]);
    mocked.rpcUpdateProduct.mockResolvedValue({
      status: 'conflict',
      product: { ...p, actual_price: 27.9, version: 3 },
      conflicts: [{ field: 'actual_price', yours: 26.5, theirs: 27.9, base: 25 }],
    });
    updateProduct(p, { actual_price: 26.5, quantity: 2 });
    await flushOutbox();
    expect(mocked.rpcUpdateProduct).toHaveBeenCalledWith('x3', { actual_price: 26.5 }, { actual_price: 25 });
    expect(getConflicts()).toHaveLength(1);
    expect(cached()[0].actual_price).toBe(27.9); // valor do outro participante preservado
  });

  it('mensagem aparece na hora e é confirmada', async () => {
    mockedChat.rpcSendMessage.mockImplementation(async (listId, m) => ({
      id: m.id, list_id: listId, product_id: m.product_id, sender_id: 'u-1', body: m.body, kind: 'text', created_at: 'now',
    }));
    sendMessage('list-1', 'u-1', '  Esse é o que você queria?  ', 'prod-1');
    const before = queryClient.getQueryData<Message[]>(qk.messages('list-1', 'prod-1'))!;
    expect(before[0]).toMatchObject({ body: 'Esse é o que você queria?', _pending: true, product_id: 'prod-1' });
    await flushOutbox();
    const after = queryClient.getQueryData<Message[]>(qk.messages('list-1', 'prod-1'))!;
    expect(after[0]._pending).toBeUndefined();
  });

  it('valida antes de enfileirar', () => {
    expect(() => addProduct('list-1', 'u-1', { name: '  ', quantity: 1, unit: 'un', categoryId: null, estimatedPrice: null })).toThrow('Digite o nome do produto.');
    expect(() => addProduct('list-1', 'u-1', { name: 'Leite', quantity: 0, unit: 'un', categoryId: null, estimatedPrice: null })).toThrow();
    expect(getOutbox()).toHaveLength(0);
  });
});

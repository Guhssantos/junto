import { fireEvent, render, screen } from '@testing-library/react-native';

import { ProductRow } from '@/components/products/ProductRow';
import { togglePurchased } from '@/offline/sync';
import { ThemeProvider } from '@/theme/ThemeProvider';

import { product } from './fixtures';

jest.mock('@/offline/sync', () => ({ togglePurchased: jest.fn() }));
jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(() => Promise.resolve()), ImpactFeedbackStyle: { Light: 'light' } }));

const renderRow = async (p = product({ name: 'Arroz', quantity: 2, estimated_price: 25, actual_price: 27.9 }), canPurchase = true) =>
  await render(
    <ThemeProvider>
      <ProductRow product={p} canPurchase={canPurchase} onPress={jest.fn()} />
    </ThemeProvider>,
  );

describe('ProductRow', () => {
  it('mostra nome, subtotal e diferença de preço', async () => {
    await renderRow();
    expect(screen.getByText('Arroz')).toBeTruthy();
    expect(screen.getByText('R$ 55,80')).toBeTruthy();
    expect(screen.getByText(/\+R\$ 2,90/)).toBeTruthy();
  });

  it('marca como comprado com um toque', async () => {
    await renderRow();
    await fireEvent.press(screen.getByLabelText('Marcar Arroz como comprado'));
    expect(togglePurchased).toHaveBeenCalledTimes(1);
  });

  it('sem permissão de compra não mostra a caixa de seleção', async () => {
    await renderRow(product({ name: 'Leite' }), false);
    expect(screen.queryByLabelText('Marcar Leite como comprado')).toBeNull();
  });

  it('item aguardando confirmação mostra o status', async () => {
    await renderRow(product({ name: 'Chocolate', status: 'awaiting_confirmation' }));
    expect(screen.getByText('Aguardando')).toBeTruthy();
    expect(screen.queryByLabelText('Marcar Chocolate como comprado')).toBeNull();
  });
});

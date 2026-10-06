import { useState } from 'react';
import { View } from 'react-native';

import { Button, Input, Sheet, Text } from '@/components/ui';
import { formatBRL, maskBRLInput, parseBRL } from '@/lib/money';
import { updateProduct } from '@/offline/sync';
import type { Product } from '@/types/models';

const toInput = (v: number | null) => (v == null ? '' : maskBRLInput(Math.round(v * 100).toString()));

/** Produto → Preço → Salvar. Mostra a diferença para o estimado enquanto digita. */
export function PriceSheet({ product, visible, onClose, markPurchased }: { product: Product | null; visible: boolean; onClose: () => void; markPurchased?: boolean }) {
  if (!product) return null;
  return (
    <Sheet visible={visible} onClose={onClose} title={product.name}>
      {visible ? <PriceForm key={product.id} product={product} onClose={onClose} markPurchased={markPurchased} /> : null}
    </Sheet>
  );
}

function PriceForm({ product, onClose, markPurchased }: { product: Product; onClose: () => void; markPurchased?: boolean }) {
  const [value, setValue] = useState(() => toInput(product.actual_price ?? product.estimated_price));
  const [error, setError] = useState<string | null>(null);
  const parsed = value ? parseBRL(value) : null;
  const diff = parsed != null && product.estimated_price != null ? parsed - product.estimated_price : null;

  const save = (purchase: boolean) => {
    if (value && parsed == null) {
      setError('Digite um preço válido, como 12,90.');
      return;
    }
    const patch: Partial<Product> = { actual_price: parsed };
    if (purchase && product.status !== 'purchased') patch.status = 'purchased';
    updateProduct(product, patch);
    onClose();
  };

  return (
    <>
      <Input
        label="Preço encontrado (por unidade)"
        placeholder="0,00"
        keyboardType="number-pad"
        autoFocus
        value={value}
        onChangeText={(t) => {
          setValue(maskBRLInput(t));
          setError(null);
        }}
        error={error}
        hint={product.estimated_price != null ? `Estimado: ${formatBRL(product.estimated_price)}` : undefined}
      />
      {diff != null && Math.abs(diff) >= 0.005 ? (
        <Text variant="caption" tone={diff > 0 ? 'danger' : 'primary'}>
          {formatBRL(diff, { signed: true })} {diff > 0 ? 'acima' : 'abaixo'} do estimado · subtotal {formatBRL((parsed ?? 0) * product.quantity)}
        </Text>
      ) : null}
      <View style={{ gap: 8 }}>
        {markPurchased && product.status !== 'purchased' ? <Button label="Salvar e marcar como comprado" onPress={() => save(true)} icon="check" /> : null}
        <Button label="Salvar preço" variant={markPurchased && product.status !== 'purchased' ? 'secondary' : 'primary'} onPress={() => save(false)} />
      </View>
    </>
  );
}

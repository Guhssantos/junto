import { View } from 'react-native';

import { Button, Sheet, Text } from '@/components/ui';
import { useConflicts } from '@/hooks/useOutbox';
import { formatBRL } from '@/lib/money';
import { STATUS_LABEL } from '@/lib/status';
import { queryClient } from '@/lib/queryClient';
import { qk } from '@/lib/queryKeys';
import { shiftConflict } from '@/offline/conflicts';
import { updateProduct } from '@/offline/sync';
import type { Product, ProductStatus } from '@/types/models';

const FIELD_LABEL: Record<string, string> = {
  actual_price: 'preço encontrado',
  estimated_price: 'preço estimado',
  quantity: 'quantidade',
  name: 'nome',
  unit: 'unidade',
  note: 'observação',
  status: 'status',
  category_id: 'categoria',
  assigned_to: 'responsável',
};

function show(field: string, v: unknown): string {
  if (v == null || v === '') return 'vazio';
  if (field.endsWith('_price')) return formatBRL(Number(v));
  if (field === 'status') return STATUS_LABEL[v as ProductStatus] ?? String(v);
  return String(v);
}

/**
 * Quando duas pessoas alteram o mesmo campo ao mesmo tempo, o servidor não sobrescreve
 * nada e pergunta aqui qual valor manter.
 */
export function ConflictDialog() {
  const conflicts = useConflicts();
  const current = conflicts[0];
  if (!current) return null;

  const keepTheirs = () => shiftConflict(current.id);
  const keepMine = () => {
    const product = queryClient.getQueryData<Product[]>(qk.products(current.listId))?.find((p) => p.id === current.productId);
    if (product) {
      const patch = Object.fromEntries(current.conflicts.map((c) => [c.field, c.yours])) as Partial<Product>;
      // base = valor atual do servidor → o servidor aceita como decisão consciente.
      updateProduct({ ...product, ...Object.fromEntries(current.conflicts.map((c) => [c.field, c.theirs])) } as Product, patch);
    }
    shiftConflict(current.id);
  };

  return (
    <Sheet visible onClose={keepTheirs} title="Alteração ao mesmo tempo">
      <Text>
        Alguém alterou <Text variant="bodyStrong">“{current.productName}”</Text> enquanto você editava. Qual valor devemos manter?
      </Text>
      {current.conflicts.map((c) => (
        <View key={String(c.field)} style={{ gap: 4 }}>
          <Text variant="overline" tone="muted">{FIELD_LABEL[String(c.field)] ?? String(c.field)}</Text>
          <Text>Seu valor: <Text variant="bodyStrong">{show(String(c.field), c.yours)}</Text></Text>
          <Text>Valor atual: <Text variant="bodyStrong">{show(String(c.field), c.theirs)}</Text></Text>
        </View>
      ))}
      <Button label="Manter o meu" onPress={keepMine} />
      <Button label="Manter o valor atual" variant="secondary" onPress={keepTheirs} />
    </Sheet>
  );
}

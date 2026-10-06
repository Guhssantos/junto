import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { Button, Card, EmptyState, Loading, ProgressBar, Screen, Text } from '@/components/ui';
import { useLists } from '@/hooks/queries';
import { formatBRL } from '@/lib/money';

/** Aba "Compras": escolha a lista e entre no modo mercado. */
export default function Shopping() {
  const { data, isLoading } = useLists('active');

  if (isLoading && !data) return <Screen><Loading /></Screen>;
  if (!data?.length) {
    return (
      <Screen>
        <EmptyState
          icon="cart"
          title="Nenhuma compra em andamento"
          body="Crie uma lista e toque em “Começar compras” quando estiver no mercado."
          action={{ label: 'Criar lista', onPress: () => router.push('/lists/new') }}
        />
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
        <Text variant="title" accessibilityRole="header">Compras</Text>
        <Text tone="muted">Escolha a lista para entrar no modo mercado: só produtos, preços e um toque para marcar.</Text>
        {data.map((l) => {
          const s = l.summary;
          return (
            <Card key={l.id} style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                <Text variant="bodyStrong" style={{ flex: 1, fontFamily: 'Manrope_800ExtraBold' }}>{l.name}</Text>
                <Text variant="bodyStrong" style={{ fontVariant: ['tabular-nums'] }}>{formatBRL(s.total_updated)}</Text>
              </View>
              <ProgressBar value={s.items_count ? s.purchased_count / s.items_count : 0} height={6} />
              <Text variant="caption" tone="muted">{s.purchased_count} de {s.items_count} itens no carrinho</Text>
              <Button label={s.purchased_count > 0 ? 'Continuar compras' : 'Começar compras'} icon="cart" onPress={() => router.push(`/lists/${l.id}/market`)} />
            </Card>
          );
        })}
      </ScrollView>
    </Screen>
  );
}

import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AskPartnerSheet } from '@/components/products/AskPartnerSheet';
import { PriceSheet } from '@/components/products/PriceSheet';
import { Button, CheckCircle, EmptyState, Icon, Loading, OfflineBanner, ProgressBar, Screen, StatusBadge, Text } from '@/components/ui';
import { useCategories, useList, usePermissions, useProducts } from '@/hooks/queries';
import { useListPresence, useListRealtime } from '@/hooks/useRealtime';
import { categoryById } from '@/lib/categories';
import { firstName } from '@/lib/format';
import { formatBRL, formatQuantity } from '@/lib/money';
import { subtotal, computeTotals } from '@/lib/totals';
import { togglePurchased } from '@/offline/sync';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeProvider';
import type { Product } from '@/types/models';

type Filter = 'todo' | 'done';

/** Modo "Estou no mercado": só o essencial, botões grandes, um toque para marcar. */
export default function Market() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId, profile } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const list = useList(id);
  const { products, isLoading } = useProducts(id);
  const categories = useCategories();
  const perms = usePermissions(id);
  const [filter, setFilter] = useState<Filter>('todo');
  const [priceFor, setPriceFor] = useState<Product | null>(null);
  const [askFor, setAskFor] = useState<Product | null | undefined>(undefined); // undefined = fechado; null = item novo

  useListRealtime(id);
  const me = useMemo(() => (userId ? { userId, name: profile?.name ?? '', shopping: true } : null), [userId, profile?.name]);
  const online = useListPresence(id, me);
  const others = online.filter((o) => o.userId !== userId && o.shopping);

  const totals = useMemo(() => computeTotals(products), [products]);
  const order = useMemo(() => categories.map((c) => c.id), [categories]);
  const items = useMemo(() => {
    const open = products.filter((p) => ['pending', 'in_review', 'approved', 'awaiting_confirmation'].includes(p.status));
    const done = products.filter((p) => p.status === 'purchased');
    const src = filter === 'todo' ? open : done;
    return src.slice().sort((a, b) => order.indexOf(a.category_id) - order.indexOf(b.category_id) || a.name.localeCompare(b.name, 'pt-BR'));
  }, [products, filter, order]);
  const openCount = products.filter((p) => ['pending', 'in_review', 'approved', 'awaiting_confirmation'].includes(p.status)).length;

  const readOnly = list.data?.status === 'completed';

  const renderItem = ({ item }: { item: Product }) => {
    const waiting = item.status === 'awaiting_confirmation';
    const done = item.status === 'purchased';
    const price = item.actual_price ?? item.estimated_price;
    return (
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <View style={styles.cardRow}>
          {waiting || readOnly || !perms.can('product.purchase') ? (
            <View style={[styles.bigCheck, { borderColor: colors.line }]}>
              <Icon name={waiting ? 'question' : 'check'} size={22} color={colors.textMuted} />
            </View>
          ) : (
            <CheckCircle
              square
              size={52}
              checked={done}
              label={done ? `Tirar ${item.name} do carrinho` : `Marcar ${item.name} como comprado`}
              onPress={() => {
                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
                togglePurchased(item);
              }}
            />
          )}
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text variant="subheading" numberOfLines={2} style={{ fontSize: 18, textDecorationLine: done ? 'line-through' : 'none' }}>{item.name}</Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {formatQuantity(item.quantity, item.unit)} · {categoryById(item.category_id, categories).name}
              {item.note ? ` · ${item.note}` : ''}
            </Text>
            {waiting || item.status === 'approved' ? <StatusBadge status={item.status} /> : null}
          </View>
          <Text variant="subheading" style={{ fontVariant: ['tabular-nums'] }}>{price != null ? formatBRL(subtotal(item)) : 'sem preço'}</Text>
        </View>
        {!readOnly ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {perms.can('product.price') ? (
              <Pressable accessibilityRole="button" onPress={() => setPriceFor(item)} style={[styles.action, { backgroundColor: colors.surfaceAlt }]}>
                <Icon name="tag" size={16} />
                <Text variant="caption" style={{ fontSize: 14, fontFamily: 'Manrope_700Bold' }}>{item.actual_price != null ? 'Alterar preço' : 'Informar preço'}</Text>
              </Pressable>
            ) : null}
            {!waiting && !done && perms.can('approval.request') ? (
              <Pressable accessibilityRole="button" onPress={() => setAskFor(item)} style={[styles.action, { backgroundColor: colors.surfaceAlt }]}>
                <Icon name="chat" size={16} />
                <Text variant="caption" style={{ fontSize: 14, fontFamily: 'Manrope_700Bold' }}>Perguntar</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <Screen padded={false}>
      <OfflineBanner />
      <View style={styles.header}>
        <View style={styles.between}>
          <Pressable accessibilityRole="button" onPress={() => (router.canGoBack() ? router.back() : router.replace(`/lists/${id}`))} style={[styles.exit, { backgroundColor: colors.surfaceAlt }]}>
            <Text variant="caption" style={{ fontSize: 14, fontFamily: 'Manrope_700Bold' }}>Sair do modo</Text>
          </Pressable>
          {others.length ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }} accessibilityLiveRegion="polite">
              <View style={[styles.liveDot, { backgroundColor: colors.primary }]} />
              <Text variant="caption" tone="muted" numberOfLines={1}>{others.map((o) => firstName(o.name)).join(' e ')} comprando também</Text>
            </View>
          ) : null}
        </View>
        <View style={[styles.between, { alignItems: 'flex-end' }]}>
          <View>
            <Text variant="caption" tone="muted">Total no carrinho</Text>
            <Text variant="display" style={{ fontVariant: ['tabular-nums'] }}>{formatBRL(totals.totalSpent)}</Text>
          </View>
          <Text variant="bodyStrong" tone="primary" style={{ fontFamily: 'Manrope_800ExtraBold' }}>
            {totals.purchasedCount} de {totals.itemsCount} · {Math.round(totals.progress * 100)}%
          </Text>
        </View>
        <ProgressBar value={totals.progress} height={10} />
        <View style={{ flexDirection: 'row', gap: 8 }} accessibilityRole="tablist">
          {([
            ['todo', `Faltam ${openCount}`],
            ['done', `No carrinho ${totals.purchasedCount}`],
          ] as const).map(([v, label]) => (
            <Pressable
              key={v}
              accessibilityRole="tab"
              accessibilityState={{ selected: filter === v }}
              onPress={() => setFilter(v)}
              style={[styles.filter, filter === v ? { backgroundColor: colors.inverse } : { borderColor: colors.lineStrong, borderWidth: 1 }]}
            >
              <Text variant="caption" style={{ fontSize: 14, fontFamily: 'Manrope_800ExtraBold', color: filter === v ? colors.onInverse : colors.textSubtle }}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {isLoading && !products.length ? (
        <Loading />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 110, gap: 10 }}
          ListEmptyComponent={
            filter === 'todo' && totals.itemsCount > 0 ? (
              <EmptyState icon="check" title="Tudo no carrinho!" body="Confira o resumo e finalize a compra." action={{ label: 'Ver resumo', onPress: () => router.push(`/lists/${id}/done`) }} />
            ) : (
              <EmptyState icon="cart" title={filter === 'todo' ? 'Nada para comprar' : 'Carrinho vazio'} body={filter === 'todo' ? 'Adicione produtos na lista.' : 'Toque no quadrado ao lado do produto para colocá-lo no carrinho.'} />
            )
          }
        />
      )}

      {!readOnly && perms.can('approval.request') ? (
        <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 12), backgroundColor: colors.bg }]}>
          <Button label="Achei algo fora da lista — perguntar" variant="accent" icon="question" onPress={() => setAskFor(null)} />
        </View>
      ) : null}

      <PriceSheet product={priceFor} visible={!!priceFor} onClose={() => setPriceFor(null)} markPurchased />
      <AskPartnerSheet listId={id} product={askFor ?? null} visible={askFor !== undefined} onClose={() => setAskFor(undefined)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, gap: 14 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  exit: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, justifyContent: 'center' },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  filter: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, justifyContent: 'center' },
  card: { borderWidth: 1, borderRadius: 20, padding: 14, gap: 12 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bigCheck: { width: 52, height: 52, borderRadius: 16, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  action: { flex: 1, minHeight: 44, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 10 },
});

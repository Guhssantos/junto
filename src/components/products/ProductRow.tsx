import * as Haptics from 'expo-haptics';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CheckCircle, Icon, StatusBadge, Text } from '@/components/ui';
import { formatBRL, formatQuantity } from '@/lib/money';
import { priceDifference, subtotal } from '@/lib/totals';
import { togglePurchased } from '@/offline/sync';
import { useTheme } from '@/theme/ThemeProvider';
import type { Product } from '@/types/models';

const CHECKABLE = new Set(['pending', 'in_review', 'approved', 'purchased']);

function meta(p: Product) {
  const parts = [formatQuantity(p.quantity, p.unit)];
  const unitPrice = p.actual_price ?? p.estimated_price;
  // Preço por kg/L/pct… quando há unidade de medida; "cada" para unidades ou sem unidade.
  if (unitPrice != null) parts.push(p.unit && p.unit !== 'un' ? `${formatBRL(unitPrice)}/${p.unit}` : `${formatBRL(unitPrice)} cada`);
  return parts.join(' · ');
}

export const ProductRow = memo(function ProductRow({ product, onPress, canPurchase }: { product: Product; onPress: () => void; canPurchase: boolean }) {
  const { colors } = useTheme();
  const done = product.status === 'purchased';
  const diff = priceDifference(product);
  const hasPrice = product.actual_price != null || product.estimated_price != null;

  return (
    <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.line, opacity: product._pending ? 0.75 : 1 }]}>
      {canPurchase && CHECKABLE.has(product.status) ? (
        <CheckCircle
          checked={done}
          label={done ? `Desmarcar ${product.name}` : `Marcar ${product.name} como comprado`}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
            togglePurchased(product);
          }}
        />
      ) : (
        <View style={styles.checkPlaceholder}>
          <Icon name={product.status === 'awaiting_confirmation' ? 'question' : 'close'} size={20} color={colors.textMuted} />
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${product.name}, ${meta(product)}. Abrir detalhes`}
        onPress={onPress}
        style={styles.body}
      >
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Text
            variant="bodyStrong"
            numberOfLines={2}
            style={{ textDecorationLine: done ? 'line-through' : 'none', color: done ? colors.textMuted : colors.text }}
          >
            {product.name}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {meta(product)}
            {diff ? `  ${formatBRL(diff, { signed: true })}` : ''}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Text variant="bodyStrong" style={{ fontFamily: 'Manrope_800ExtraBold', fontVariant: ['tabular-nums'] }}>
            {hasPrice ? formatBRL(subtotal(product)) : 'sem preço'}
          </Text>
          {product.status !== 'pending' ? <StatusBadge status={product.status} /> : null}
        </View>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 16, minHeight: 64, paddingLeft: 6, paddingRight: 14, paddingVertical: 8 },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 },
  checkPlaceholder: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});

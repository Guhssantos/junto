import { useMutation } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Divider, Header, Icon, Loading, Screen, Text } from '@/components/ui';
import { useList, usePermissions, useProducts, usePurchaseHistory } from '@/hooks/queries';
import { toAppError } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { formatBRL, formatQuantity } from '@/lib/money';
import { queryClient } from '@/lib/queryClient';
import { qk } from '@/lib/queryKeys';
import { showToast } from '@/lib/toast';
import { computeCompletion, priceDifference, subtotal } from '@/lib/totals';
import { finalizeList, reopenList } from '@/services/lists';
import { useTheme } from '@/theme/ThemeProvider';

/** Resumo da compra: antes de finalizar (prévia) e depois (histórico). */
export default function Done() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const list = useList(id);
  const { products, isLoading } = useProducts(id);
  const perms = usePermissions(id);
  const completed = list.data?.status === 'completed';
  const history = usePurchaseHistory(id, completed);

  const preview = useMemo(() => computeCompletion(products), [products]);
  const bought = useMemo(() => products.filter((p) => p.status === 'purchased'), [products]);
  const notBought = products.filter((p) => ['pending', 'in_review', 'approved'].includes(p.status)).length;
  const diffs = useMemo(
    () =>
      bought
        .map((p) => ({ p, d: (priceDifference(p) ?? 0) * p.quantity }))
        .filter((x) => Math.abs(x.d) >= 0.01)
        .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
        .slice(0, 5),
    [bought],
  );

  const h = history.data;
  const summary = completed && h
    ? { count: h.purchased_count, estimated: h.total_estimated, final: h.total_actual, difference: h.total_actual - h.total_estimated }
    : preview;

  const finalize = useMutation({
    mutationFn: () => finalizeList(id),
    onSuccess: () => {
      ['lists', 'list', 'history'].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
      queryClient.invalidateQueries({ queryKey: qk.list(id) });
      showToast('Compra finalizada e salva no histórico', 'success');
      router.replace('/home');
    },
    onError: (e) => showToast(toAppError(e).message, 'error'),
  });

  const reopen = useMutation({
    mutationFn: () => reopenList(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.list(id) });
      queryClient.invalidateQueries({ queryKey: qk.allLists });
      router.replace(`/lists/${id}`);
    },
    onError: (e) => showToast(toAppError(e).message, 'error'),
  });

  if (isLoading && !products.length) return <Screen><Loading /></Screen>;

  return (
    <Screen scroll edges={['top', 'bottom']} style={{ gap: 18 }}>
      <Header title={completed ? 'Resumo da compra' : 'Concluir compra'} />
      <View style={{ alignItems: 'center', gap: 12 }}>
        <View style={[styles.ring, { backgroundColor: colors.primarySoft }]}>
          <View style={[styles.core, { backgroundColor: colors.primary }]}>
            <Icon name="check" size={36} color={colors.onPrimary} strokeWidth={3} />
          </View>
        </View>
        <Text variant="title" style={{ textAlign: 'center' }}>{completed ? 'Compra concluída!' : notBought ? 'Quase lá!' : 'Compra concluída! 🎉'}</Text>
        <Text tone="muted" style={{ textAlign: 'center' }}>
          {list.data?.name}
          {completed && list.data?.completed_at ? ` · ${formatDate(list.data.completed_at)}` : ''}
        </Text>
      </View>

      <Card style={styles.grid}>
        <Stat label="Produtos" value={String(summary.count)} />
        <Stat label="Valor estimado" value={formatBRL(summary.estimated)} />
        <Stat label="Valor final" value={formatBRL(summary.final)} />
        <Stat
          label="Diferença"
          value={formatBRL(summary.difference, { signed: true })}
          tone={summary.difference > 0.005 ? 'danger' : summary.difference < -0.005 ? 'primary' : 'default'}
        />
      </Card>

      {!completed && notBought ? (
        <Card style={{ backgroundColor: colors.warningSoft, borderColor: colors.warningSoft }}>
          <Text style={{ color: colors.onWarningSoft }}>
            {notBought} {notBought === 1 ? 'item ainda não foi marcado' : 'itens ainda não foram marcados'} como comprado. Eles ficam registrados como não comprados.
          </Text>
        </Card>
      ) : null}

      {diffs.length ? (
        <View style={{ gap: 6 }}>
          <Text variant="subheading">Maiores diferenças</Text>
          {diffs.map(({ p, d }) => (
            <View key={p.id} style={styles.line}>
              <Text style={{ flex: 1 }}>{p.name}</Text>
              <Text variant="bodyStrong" tone={d > 0 ? 'danger' : 'primary'}>{formatBRL(d, { signed: true })}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={{ gap: 6 }}>
        <Text variant="subheading">Itens comprados</Text>
        {bought.length === 0 ? <Text tone="muted">Nenhum item marcado como comprado.</Text> : null}
        {bought.map((p, i) => (
          <View key={p.id}>
            {i > 0 ? <Divider /> : null}
            <View style={styles.line}>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{p.name}</Text>
                <Text variant="caption" tone="muted">
                  {formatQuantity(p.quantity, p.unit)} × {formatBRL(p.actual_price ?? p.estimated_price ?? 0)}
                </Text>
              </View>
              <Text variant="bodyStrong" style={{ fontVariant: ['tabular-nums'] }}>{formatBRL(subtotal(p))}</Text>
            </View>
          </View>
        ))}
      </View>

      {!completed && perms.can('list.close') ? (
        <Button label="Finalizar compra" icon="check" loading={finalize.isPending} onPress={() => finalize.mutate()} />
      ) : null}
      {!completed && !perms.can('list.close') ? <Text tone="muted" style={{ textAlign: 'center' }}>O administrador da lista finaliza a compra.</Text> : null}
      {completed && perms.can('list.close') ? <Button label="Reabrir lista" variant="secondary" loading={reopen.isPending} onPress={() => reopen.mutate()} /> : null}
    </Screen>
  );
}

function Stat({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'danger' | 'primary' }) {
  return (
    <View style={{ width: '50%', gap: 2, paddingVertical: 8 }}>
      <Text variant="caption" tone="muted">{label}</Text>
      <Text variant="heading" tone={tone} style={{ fontVariant: ['tabular-nums'] }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  core: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingVertical: 6 },
});

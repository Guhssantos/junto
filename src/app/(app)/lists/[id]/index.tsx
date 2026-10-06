import { useMutation } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatView } from '@/components/chat/ChatView';
import { AddProductSheet } from '@/components/products/AddProductSheet';
import { ApprovalCard } from '@/components/products/ApprovalCard';
import { ProductRow } from '@/components/products/ProductRow';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Header,
  Icon,
  IconButton,
  Loading,
  OfflineBanner,
  ProgressBar,
  Screen,
  Segmented,
  Text,
} from '@/components/ui';
import { useActivity, useApprovals, useCategories, useList, useMembers, usePermissions, useProducts } from '@/hooks/queries';
import { useListRealtime } from '@/hooks/useRealtime';
import { describeActivity } from '@/lib/activity';
import { categoryById } from '@/lib/categories';
import { toAppError } from '@/lib/errors';
import { showDialog } from '@/lib/dialog';
import { firstName, formatTime, formatShortDate } from '@/lib/format';
import { formatBRL } from '@/lib/money';
import { groupByCategory } from '@/lib/productCache';
import { queryClient } from '@/lib/queryClient';
import { qk } from '@/lib/queryKeys';
import { showToast } from '@/lib/toast';
import { computeTotals, progressLabel } from '@/lib/totals';
import { useAuth } from '@/providers/AuthProvider';
import { deleteList } from '@/services/lists';
import { leaveList } from '@/services/members';
import { useTheme } from '@/theme/ThemeProvider';

type Tab = 'items' | 'chat' | 'history';

export default function ListDetail() {
  const { id, tab: initialTab } = useLocalSearchParams<{ id: string; tab?: Tab }>();
  const { userId } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>(initialTab === 'chat' || initialTab === 'history' ? initialTab : 'items');
  const [adding, setAdding] = useState(false);

  const list = useList(id);
  const { products, isLoading, error, refetch } = useProducts(id);
  const members = useMembers(id);
  const approvals = useApprovals(id);
  const perms = usePermissions(id);
  const categories = useCategories();
  useListRealtime(id);

  const totals = useMemo(() => computeTotals(products), [products]);
  const sections = useMemo(
    () =>
      groupByCategory(products, categories.map((c) => c.id)).map((g) => ({
        key: g.categoryId,
        title: categoryById(g.categoryId, categories),
        data: g.items,
      })),
    [products, categories],
  );
  const profiles = useMemo(() => new Map((members.data ?? []).map((m) => [m.user_id, m.profile])), [members.data]);
  const pendingApprovals = (approvals.data ?? []).filter((a) => a.status === 'pending');
  const completed = list.data?.status === 'completed';
  const canEdit = !completed && perms.can('product.create');

  const remove = useMutation({
    mutationFn: () => deleteList(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.allLists });
      router.replace('/home');
      showToast('Lista excluída', 'success');
    },
    onError: (e) => showToast(toAppError(e).message, 'error'),
  });

  const leave = useMutation({
    mutationFn: () => leaveList(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.allLists });
      router.replace('/home');
    },
    onError: (e) => showToast(toAppError(e).message, 'error'),
  });

  const openMenu = () => {
    const options: { text: string; style?: 'destructive' | 'cancel'; onPress?: () => void }[] = [];
    if (perms.can('list.update')) options.push({ text: 'Editar lista', onPress: () => router.push(`/lists/${id}/edit`) });
    options.push({ text: 'Participantes e convite', onPress: () => router.push(`/lists/${id}/share`) });
    if (perms.can('list.delete')) {
      options.push({
        text: 'Excluir lista',
        style: 'destructive',
        onPress: () =>
          showDialog('Excluir lista?', 'Todos os itens, mensagens e o histórico desta lista serão apagados para todos.', [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Excluir', style: 'destructive', onPress: () => remove.mutate() },
          ]),
      });
    } else {
      options.push({
        text: 'Sair da lista',
        style: 'destructive',
        onPress: () =>
          showDialog('Sair da lista?', 'Você deixará de ver esta lista. Para voltar, precisará de um novo convite.', [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Sair', style: 'destructive', onPress: () => leave.mutate() },
          ]),
      });
    }
    options.push({ text: 'Cancelar', style: 'cancel' });
    showDialog(list.data?.name ?? 'Lista', undefined, options);
  };

  if (list.error && !list.data) {
    return (
      <Screen>
        <Header title="Lista" />
        <ErrorState message={toAppError(list.error).message} onRetry={() => list.refetch()} />
      </Screen>
    );
  }

  const summary = (
    <Card style={{ gap: 12, marginBottom: 12 }}>
      <View style={styles.between}>
        <Text variant="bodyStrong">{progressLabel(totals)}</Text>
        <Text variant="bodyStrong" tone="primary" style={{ fontFamily: 'Manrope_800ExtraBold' }}>{Math.round(totals.progress * 100)}%</Text>
      </View>
      <ProgressBar value={totals.progress} />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="caption" tone="muted">Estimado</Text>
          <Text variant="subheading" style={{ fontVariant: ['tabular-nums'] }}>{formatBRL(totals.totalEstimated)}</Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="caption" tone="muted">Atualizado</Text>
          <Text variant="subheading" style={{ fontVariant: ['tabular-nums'] }}>
            {formatBRL(totals.totalUpdated)}{' '}
            {Math.abs(totals.difference) >= 0.01 ? (
              <Text variant="caption" tone={totals.difference > 0 ? 'danger' : 'primary'}>{formatBRL(totals.difference, { signed: true })}</Text>
            ) : null}
          </Text>
        </View>
      </View>
    </Card>
  );

  const header = (
    <View>
      {completed ? (
        <Card style={{ marginBottom: 12, gap: 8, borderColor: colors.primary }}>
          <Text variant="bodyStrong">Compra finalizada{list.data?.completed_at ? ` em ${formatShortDate(list.data.completed_at)}` : ''}</Text>
          <Button label="Ver resumo" size="md" variant="secondary" onPress={() => router.push(`/lists/${id}/done`)} />
        </Card>
      ) : totals.itemsCount > 0 && totals.purchasedCount === totals.itemsCount ? (
        <Card style={{ marginBottom: 12, gap: 8, borderColor: colors.primary }}>
          <Text variant="bodyStrong">Tudo no carrinho!</Text>
          <Button label="Ver resumo e finalizar" size="md" onPress={() => router.push(`/lists/${id}/done`)} />
        </Card>
      ) : null}
      {summary}
      {pendingApprovals.map((a) => (
        <View key={a.id} style={{ marginBottom: 12 }}>
          <ApprovalCard
            request={a}
            product={products.find((p) => p.id === a.product_id)}
            requester={a.requested_by ? profiles.get(a.requested_by) : null}
            canRespond={a.requested_by !== userId && perms.can('approval.respond')}
          />
        </View>
      ))}
    </View>
  );

  return (
    <Screen padded={false}>
      <OfflineBanner />
      <View style={{ paddingHorizontal: 12 }}>
        <Header
          title={list.data?.name ?? ''}
          subtitle={members.data ? members.data.filter((m) => m.status === 'active').map((m) => firstName(m.profile?.name)).join(', ') : undefined}
          right={
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {!completed && perms.can('member.invite') ? <IconButton icon="invite" label="Compartilhar lista" onPress={() => router.push(`/lists/${id}/share`)} /> : null}
              <IconButton icon="dots" label="Mais opções" variant="plain" onPress={openMenu} />
            </View>
          }
        />
      </View>
      <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'items', label: 'Itens' },
            { value: 'chat', label: 'Chat' },
            { value: 'history', label: 'Histórico' },
          ]}
        />
      </View>

      {tab === 'items' ? (
        <>
          {isLoading && !products.length ? (
            <Loading label="Carregando itens…" />
          ) : error && !products.length ? (
            <ErrorState message={toAppError(error).message} onRetry={() => refetch()} />
          ) : (
            <SectionList
              sections={sections}
              keyExtractor={(p) => p.id}
              ListHeaderComponent={header}
              stickySectionHeadersEnabled={false}
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}
              renderSectionHeader={({ section }) => (
                <View style={styles.sectionHeader}>
                  <Text>{section.title.emoji}</Text>
                  <Text variant="overline" tone="muted">{section.title.name}</Text>
                </View>
              )}
              ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
              renderItem={({ item }) => (
                <ProductRow
                  product={item}
                  canPurchase={!completed && perms.can('product.purchase')}
                  onPress={() => router.push(`/lists/${id}/product/${item.id}`)}
                />
              )}
              ListEmptyComponent={
                <EmptyState
                  icon="plus"
                  title="Lista vazia"
                  body="Adicione os primeiros produtos. Quem participa da lista vê tudo na hora."
                  action={canEdit ? { label: 'Adicionar produto', onPress: () => setAdding(true) } : undefined}
                />
              }
            />
          )}
          {!completed ? (
            <View style={[styles.bottomBar, { backgroundColor: colors.bg, borderTopColor: colors.line, paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
              {canEdit ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Adicionar produto" onPress={() => setAdding(true)} style={[styles.addBtn, { borderColor: colors.text, backgroundColor: colors.surface }]}>
                  <Icon name="plus" size={22} strokeWidth={2.4} />
                </Pressable>
              ) : null}
              <Button label={totals.purchasedCount > 0 ? 'Continuar compras' : 'Começar compras'} icon="cart" style={{ flex: 1 }} onPress={() => router.push(`/lists/${id}/market`)} />
            </View>
          ) : null}
        </>
      ) : tab === 'chat' ? (
        <View style={{ flex: 1, paddingBottom: insets.bottom }}>
          <ChatView listId={id} productId={null} readOnly={completed} />
        </View>
      ) : (
        <ActivityTab listId={id} names={new Map([...profiles].map(([k, v]) => [k, firstName(v?.name)]))} />
      )}

      <AddProductSheet listId={id} visible={adding} onClose={() => setAdding(false)} />
    </Screen>
  );
}

function ActivityTab({ listId, names }: { listId: string; names: Map<string, string> }) {
  const { colors } = useTheme();
  const { data, isLoading, error, refetch } = useActivity(listId);
  if (isLoading && !data) return <Loading />;
  if (error && !data) return <ErrorState message={toAppError(error).message} onRetry={() => refetch()} />;
  if (!data?.length) return <EmptyState icon="history" title="Sem alterações ainda" />;
  return (
    <SectionList
      sections={[{ title: '', data }]}
      keyExtractor={(e) => String(e.id)}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
      renderItem={({ item }) => (
        <View style={[styles.activity, { borderBottomColor: colors.line }]}>
          <Text variant="caption" tone="muted" style={{ width: 64, fontVariant: ['tabular-nums'] }}>
            {formatShortDate(item.created_at)}{'\n'}{formatTime(item.created_at)}
          </Text>
          <Text style={{ flex: 1 }}>{describeActivity(item, item.actor_id ? names.get(item.actor_id) ?? 'Ex-participante' : 'Sistema')}</Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 14, paddingBottom: 8 },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  addBtn: { width: 56, height: 56, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  activity: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
});

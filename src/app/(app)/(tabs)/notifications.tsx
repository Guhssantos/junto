import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { Button, EmptyState, ErrorState, Icon, Loading, Screen, SwipeToDelete, Text, type IconName } from '@/components/ui';
import { useNotifications } from '@/hooks/queries';
import { showDialog } from '@/lib/dialog';
import { toAppError } from '@/lib/errors';
import { timeAgo } from '@/lib/format';
import { queryClient } from '@/lib/queryClient';
import { qk } from '@/lib/queryKeys';
import { showToast } from '@/lib/toast';
import { respondJoin } from '@/services/members';
import { deleteNotifications, markNotificationsRead } from '@/services/notifications';
import { respondApproval } from '@/services/products';
import { setBadge } from '@/services/push';
import { useTheme } from '@/theme/ThemeProvider';
import type { AppNotification, NotificationType } from '@/types/models';

const ICON: Record<NotificationType, IconName> = {
  product_added: 'plus',
  product_removed: 'trash',
  price_changed: 'tag',
  product_purchased: 'check',
  member_joined: 'invite',
  member_left: 'logout',
  join_request: 'invite',
  join_accepted: 'check',
  join_rejected: 'close',
  message: 'chat',
  approval_request: 'question',
  approval_approved: 'check',
  approval_rejected: 'close',
  list_completed: 'cart',
};

function target(n: AppNotification): string | null {
  if (!n.list_id) return null;
  if (n.type === 'join_request') return `/lists/${n.list_id}/share`;
  if (n.type === 'message') return n.product_id ? `/lists/${n.list_id}/product/${n.product_id}?tab=chat` : `/lists/${n.list_id}?tab=chat`;
  if (n.product_id && n.type !== 'product_removed') return `/lists/${n.list_id}/product/${n.product_id}`;
  return `/lists/${n.list_id}`;
}

function updateBadge() {
  const unread = (queryClient.getQueryData<AppNotification[]>(qk.notifications) ?? []).filter((x) => !x.read_at).length;
  void setBadge(unread);
}

// Exclusão com "Desfazer": some da tela na hora e só é apagada no servidor após alguns segundos.
const pendingDeletes = new Map<string, ReturnType<typeof setTimeout>>();

function removeNotification(n: AppNotification) {
  const before = queryClient.getQueryData<AppNotification[]>(qk.notifications) ?? [];
  queryClient.setQueryData<AppNotification[]>(qk.notifications, before.filter((x) => x.id !== n.id));
  updateBadge();
  const timer = setTimeout(() => {
    pendingDeletes.delete(n.id);
    deleteNotifications([n.id]).catch((e) => {
      queryClient.invalidateQueries({ queryKey: qk.notifications });
      showToast(toAppError(e, 'Não conseguimos excluir a notificação.').message, 'error');
    });
  }, 5500);
  pendingDeletes.set(n.id, timer);
  showToast('Notificação excluída', 'info', {
    label: 'Desfazer',
    onPress: () => {
      clearTimeout(pendingDeletes.get(n.id));
      pendingDeletes.delete(n.id);
      queryClient.setQueryData<AppNotification[]>(qk.notifications, (old) =>
        [...(old ?? []).filter((x) => x.id !== n.id), n].sort((a, b) => b.created_at.localeCompare(a.created_at)),
      );
      updateBadge();
    },
  });
}

function ActionRow({ n }: { n: AppNotification }) {
  const m = useMutation({
    mutationFn: async (accept: boolean) => {
      if (n.type === 'join_request') await respondJoin(n.list_id!, String(n.data.user_id), accept);
      else await respondApproval(String(n.data.request_id), accept);
    },
    onSuccess: (_d, accept) => {
      showToast(n.type === 'join_request' ? (accept ? 'Participante aceito' : 'Pedido recusado') : accept ? 'Aprovado ✅' : 'Recusado ❌', 'success');
      queryClient.invalidateQueries({ queryKey: qk.notifications });
      if (n.list_id) {
        queryClient.invalidateQueries({ queryKey: qk.members(n.list_id) });
        queryClient.invalidateQueries({ queryKey: qk.products(n.list_id) });
        queryClient.invalidateQueries({ queryKey: qk.approvals(n.list_id) });
      }
    },
    onError: (e) => {
      // Pedido já respondido em outra tela/aparelho: some da lista sem alarde.
      queryClient.invalidateQueries({ queryKey: qk.notifications });
      if (n.list_id) queryClient.invalidateQueries({ queryKey: qk.members(n.list_id) });
      showToast(toAppError(e).message, 'error');
    },
  });
  const isJoin = n.type === 'join_request';
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
      <Button label={isJoin ? 'Recusar' : 'Não comprar'} variant="danger" size="md" style={{ flex: 1 }} disabled={m.isPending} onPress={() => m.mutate(false)} />
      <Button label={isJoin ? 'Aceitar' : 'Adicionar'} size="md" style={{ flex: 1 }} loading={m.isPending} onPress={() => m.mutate(true)} />
    </View>
  );
}

export default function Notifications() {
  const { colors } = useTheme();
  const { data, isLoading, error, refetch, isRefetching } = useNotifications();

  const { actionable, rest } = useMemo(() => {
    const items = data ?? [];
    const actionable = items.filter((n) => !n.read_at && (n.type === 'join_request' || n.type === 'approval_request'));
    const ids = new Set(actionable.map((a) => a.id));
    return { actionable, rest: items.filter((n) => !ids.has(n.id)) };
  }, [data]);

  const markAll = async () => {
    try {
      await markNotificationsRead();
      queryClient.setQueryData<AppNotification[]>(qk.notifications, (old) =>
        (old ?? []).map((n) => (n.read_at || n.type === 'join_request' || n.type === 'approval_request' ? n : { ...n, read_at: new Date().toISOString() })),
      );
      void setBadge(0);
      queryClient.invalidateQueries({ queryKey: qk.notifications });
    } catch (e) {
      showToast(toAppError(e).message, 'error');
    }
  };

  const clearAll = () =>
    showDialog(
      'Limpar todas as notificações?',
      'Elas serão apagadas em todos os seus aparelhos. Pedidos de entrada ainda pendentes continuam em "Compartilhar lista".',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Limpar todas',
          style: 'destructive',
          onPress: () => {
            const before = queryClient.getQueryData<AppNotification[]>(qk.notifications);
            queryClient.setQueryData<AppNotification[]>(qk.notifications, []);
            void setBadge(0);
            deleteNotifications()
              .then(() => showToast('Notificações apagadas', 'success'))
              .catch((e) => {
                queryClient.setQueryData(qk.notifications, before);
                updateBadge();
                showToast(toAppError(e, 'Não conseguimos limpar as notificações.').message, 'error');
              });
          },
        },
      ],
    );

  const open = (n: AppNotification) => {
    if (!n.read_at && n.type !== 'join_request' && n.type !== 'approval_request') {
      queryClient.setQueryData<AppNotification[]>(qk.notifications, (old) => (old ?? []).map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
      void markNotificationsRead([n.id]).catch(() => undefined);
    }
    const t = target(n);
    if (t) router.push(t as never);
  };

  const renderItem = ({ item: n }: { item: AppNotification }) => {
    const unread = !n.read_at;
    const needsAction = actionable.some((a) => a.id === n.id);
    // Botões lado a lado (nunca um botão dentro do outro — HTML inválido na web).
    return (
      <View style={needsAction ? { marginBottom: 10 } : null}>
        <SwipeToDelete onDelete={() => removeNotification(n)} radius={needsAction ? 18 : 0}>
          <View
            style={[
              styles.item,
              needsAction
                ? { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 18, padding: 14 }
                : { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth },
            ]}
          >
            <View style={{ flexDirection: 'row', gap: 4 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${unread ? 'Não lida. ' : ''}${n.title}. ${n.body}`}
                accessibilityHint="Abre o item. Deslize para o lado para excluir"
                onPress={() => open(n)}
                style={({ pressed }) => [{ flex: 1, flexDirection: 'row', gap: 12, opacity: pressed ? 0.7 : 1 }]}
              >
                <View style={[styles.icon, { backgroundColor: needsAction ? colors.accentSoft : unread ? colors.primarySoft : colors.surfaceAlt }]}>
                  <Icon name={ICON[n.type] ?? 'bell'} size={18} color={needsAction ? colors.accent : unread ? colors.primary : colors.textSubtle} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="bodyStrong" style={{ fontFamily: unread ? 'Manrope_800ExtraBold' : 'Manrope_600SemiBold' }}>{n.title}</Text>
                  <Text tone={unread ? 'default' : 'muted'}>{n.body}</Text>
                  <Text variant="caption" tone="muted">{timeAgo(n.created_at)}</Text>
                </View>
                {unread && !needsAction ? <View accessibilityLabel="Não lida" style={[styles.dot, { backgroundColor: colors.primary }]} /> : null}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Excluir notificação: ${n.title}`}
                onPress={() => removeNotification(n)}
                hitSlop={8}
                style={({ pressed }) => [styles.del, { opacity: pressed ? 0.5 : 1 }]}
              >
                <Icon name="trash" size={18} color={colors.textMuted} />
              </Pressable>
            </View>
            {needsAction ? <ActionRow n={n} /> : null}
          </View>
        </SwipeToDelete>
      </View>
    );
  };

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <Text variant="title" accessibilityRole="header">Notificações</Text>
        {data?.length ? (
          <View style={styles.actions}>
            {rest.some((n) => !n.read_at) ? (
              <Pressable accessibilityRole="button" onPress={markAll} hitSlop={10} style={styles.action}>
                <Icon name="check" size={16} color={colors.primary} />
                <Text variant="bodyStrong" tone="primary" style={{ fontSize: 14 }}>Marcar como lidas</Text>
              </Pressable>
            ) : null}
            <Pressable accessibilityRole="button" onPress={clearAll} hitSlop={10} style={styles.action}>
              <Icon name="trash" size={16} color={colors.danger} />
              <Text variant="bodyStrong" tone="danger" style={{ fontSize: 14 }}>Limpar todas</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
      {isLoading && !data ? (
        <Loading />
      ) : error && !data ? (
        <ErrorState message={toAppError(error).message} onRetry={() => refetch()} />
      ) : !data?.length ? (
        <EmptyState icon="bell" title="Tudo em dia" body="Avisos de novos itens, preços, mensagens e pedidos aparecem aqui." />
      ) : (
        <FlatList
          data={[...actionable, ...rest]}
          keyExtractor={(n) => n.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
          ListHeaderComponent={
            <Text variant="caption" tone="muted" style={{ marginBottom: 8 }}>
              {actionable.length ? 'PRECISA DE VOCÊ · ' : ''}Deslize para o lado para excluir
            </Text>
          }
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, gap: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 20, rowGap: 8 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32 },
  item: { paddingVertical: 12 },
  icon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
  del: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginTop: -8, marginRight: -10 },
});

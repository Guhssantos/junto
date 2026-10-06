import { router } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { EmptyState, ErrorState, Icon, Loading, Screen, Text } from '@/components/ui';
import { useConversations, useLists } from '@/hooks/queries';
import { toAppError } from '@/lib/errors';
import { timeAgo } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';

/** Conversas: chat geral de cada lista e conversas vinculadas a produtos. */
export default function Chats() {
  const { colors } = useTheme();
  const conv = useConversations();
  const lists = useLists('active');

  const rows = useMemo(() => {
    const names = new Map((lists.data ?? []).map((l) => [l.id, l.name]));
    const withMessages = new Set((conv.data ?? []).filter((c) => !c.productId).map((c) => c.listId));
    const items = (conv.data ?? []).map((c) => ({
      key: c.key,
      listId: c.listId,
      productId: c.productId,
      title: c.productId ? c.productName ?? 'Produto' : names.get(c.listId) ?? 'Lista',
      subtitle: names.get(c.listId) ?? '',
      preview: c.last.image_path ? `📷 Foto${c.last.body ? `: ${c.last.body}` : ''}` : c.last.body,
      at: c.last.created_at,
    }));
    // Listas ativas sem mensagens também aparecem (para iniciar a conversa).
    for (const l of lists.data ?? []) {
      if (!withMessages.has(l.id)) {
        items.push({ key: `${l.id}:list`, listId: l.id, productId: null, title: l.name, subtitle: '', preview: 'Toque para conversar com a lista', at: '' });
      }
    }
    return items;
  }, [conv.data, lists.data]);

  return (
    <Screen padded={false}>
      <View style={{ paddingHorizontal: 20, paddingVertical: 12 }}>
        <Text variant="title" accessibilityRole="header">Conversas</Text>
      </View>
      {conv.isLoading && !conv.data ? (
        <Loading />
      ) : conv.error && !conv.data ? (
        <ErrorState message={toAppError(conv.error).message} onRetry={() => conv.refetch()} />
      ) : !rows.length ? (
        <EmptyState icon="chat" title="Nenhuma conversa" body="Crie ou entre em uma lista para conversar com quem compra com você." />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.key}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={conv.isRefetching} onRefresh={conv.refetch} tintColor={colors.primary} />}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.title}. ${item.preview}`}
              onPress={() =>
                router.push(item.productId ? `/lists/${item.listId}/product/${item.productId}` : { pathname: '/lists/[id]', params: { id: item.listId, tab: 'chat' } })
              }
              style={[styles.row, { borderBottomColor: colors.line }]}
            >
              <View style={[styles.icon, { backgroundColor: item.productId ? colors.accentSoft : colors.primarySoft }]}>
                <Icon name={item.productId ? 'tag' : 'chat'} size={18} color={item.productId ? colors.accent : colors.primary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>{item.title}</Text>
                  {item.at ? <Text variant="caption" tone="muted">{timeAgo(item.at)}</Text> : null}
                </View>
                {item.productId && item.subtitle ? <Text variant="caption" tone="muted">{item.subtitle}</Text> : null}
                <Text tone="muted" numberOfLines={1}>{item.preview}</Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, alignItems: 'center' },
  icon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});

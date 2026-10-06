import { router } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { HeroListCard, ListCard } from '@/components/lists/ListCard';
import { Avatar, EmptyState, ErrorState, Icon, IconButton, Loading, OfflineBanner, Screen, Text } from '@/components/ui';
import { useLists, useUnreadCount } from '@/hooks/queries';
import { toAppError } from '@/lib/errors';
import { firstName, todayLabel } from '@/lib/format';
import { useAuth } from '@/providers/AuthProvider';
import { useLayout } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';

export default function Home() {
  const { profile } = useAuth();
  const { colors } = useTheme();
  const unread = useUnreadCount();
  const { data, isLoading, error, refetch, isRefetching } = useLists('active');
  const { columns } = useLayout();
  // Grade: 1 coluna no celular, 2 no tablet, 3 no computador.
  const cell = columns > 1 ? { width: `${100 / columns}%` as const, padding: 7 } : null;

  const [hero, ...rest] = data ?? [];

  return (
    <Screen padded={false} wide>
      <OfflineBanner />
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Abrir perfil" onPress={() => router.push('/profile')}>
          <Avatar profile={profile} size={44} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text variant="caption" tone="muted">{todayLabel()}</Text>
          <Text variant="heading">Olá, {firstName(profile?.name)}</Text>
        </View>
        <IconButton icon="bell" label={unread ? `Notificações, ${unread} novas` : 'Notificações'} badge={unread > 0} onPress={() => router.push('/notifications')} />
        <IconButton icon="gear" label="Configurações" onPress={() => router.push('/profile')} />
      </View>

      {isLoading && !data ? (
        <Loading label="Carregando suas listas…" />
      ) : error && !data ? (
        <ErrorState message={toAppError(error).message} onRetry={() => refetch()} />
      ) : !hero ? (
        <EmptyState
          icon="cart"
          title="Nenhuma lista por aqui"
          body="Crie sua primeira lista de compras ou entre na lista de alguém com um código de convite."
          action={{ label: 'Criar lista', onPress: () => router.push('/lists/new') }}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
        >
          <HeroListCard list={hero} />
          <View style={styles.sectionRow}>
            <Text variant="subheading" accessibilityRole="header">Suas listas</Text>
            <Pressable accessibilityRole="link" onPress={() => router.push('/history')} hitSlop={10}>
              <Text variant="bodyStrong" tone="primary" style={{ fontSize: 14 }}>Histórico</Text>
            </Pressable>
          </View>
          <View style={cell ? styles.grid : { gap: 14 }}>
            {rest.map((l) => (
              <View key={l.id} style={cell}>
                <ListCard list={l} />
              </View>
            ))}
          </View>
          {rest.length === 0 ? <Text tone="muted">Suas outras listas ativas aparecem aqui.</Text> : null}
        </ScrollView>
      )}

      <View style={styles.fabs} pointerEvents="box-none">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Entrar em uma lista com código"
          onPress={() => router.push('/join')}
          style={[styles.fabSecondary, { backgroundColor: colors.surface, borderColor: colors.line }]}
        >
          <Icon name="qr" size={22} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Nova lista"
          onPress={() => router.push('/lists/new')}
          style={[styles.fab, { backgroundColor: colors.inverse }]}
        >
          <Icon name="plus" size={20} color={colors.onInverse} strokeWidth={2.4} />
          <Text variant="bodyStrong" style={{ color: colors.onInverse, fontFamily: 'Manrope_800ExtraBold' }}>Nova lista</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 },
  content: { paddingHorizontal: 20, paddingBottom: 120, gap: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', margin: -7 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6 },
  fabs: { position: 'absolute', right: 20, bottom: 20, flexDirection: 'row', gap: 10, alignItems: 'center' },
  fab: { height: 56, paddingHorizontal: 22, borderRadius: 28, flexDirection: 'row', alignItems: 'center', gap: 8, boxShadow: '0 8px 24px rgba(22,24,29,0.22)' },
  fabSecondary: { width: 56, height: 56, borderRadius: 28, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});

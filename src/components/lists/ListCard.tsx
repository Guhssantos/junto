import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { AvatarStack, Card, ProgressBar, Text } from '@/components/ui';
import { firstName, joinNames, timeAgo } from '@/lib/format';
import { formatBRL } from '@/lib/money';
import { useTheme } from '@/theme/ThemeProvider';
import type { ListOverview } from '@/types/models';

function describe(list: ListOverview) {
  const s = list.summary;
  const progress = s.items_count ? s.purchased_count / s.items_count : 0;
  const people = joinNames(list.members.map((m) => firstName(m.profile?.name)));
  const count = s.items_count === 0 ? 'Nenhum item ainda' : `${s.purchased_count} de ${s.items_count} ${s.items_count === 1 ? 'item comprado' : 'itens comprados'}`;
  return { progress, people, count };
}

/** Destaque da lista mais recente (cartão verde da Home). */
export function HeroListCard({ list }: { list: ListOverview }) {
  const { colors, scheme } = useTheme();
  const { progress, people, count } = describe(list);
  const fg = scheme === 'dark' ? colors.onPrimary : '#FFFFFF';
  const soft = scheme === 'dark' ? 'rgba(6,33,15,0.7)' : '#CDEBD9';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${list.name}. ${count}. Valor estimado ${formatBRL(list.summary.total_updated)}. Abrir lista`}
      onPress={() => router.push(`/lists/${list.id}`)}
      style={({ pressed }) => [styles.hero, { backgroundColor: colors.primary, transform: [{ scale: pressed ? 0.99 : 1 }] }]}
    >
      <View style={styles.rowBetween}>
        <Text variant="overline" style={{ color: soft }}>Em andamento</Text>
        <Text variant="caption" style={{ color: soft }}>{timeAgo(list.updated_at)}</Text>
      </View>
      <View style={{ gap: 4 }}>
        <Text variant="title" style={{ color: fg }} numberOfLines={2}>{list.name}</Text>
        <Text variant="body" style={{ color: fg, opacity: 0.9 }}>{count}</Text>
      </View>
      <ProgressBar value={progress} track={scheme === 'dark' ? 'rgba(6,33,15,0.25)' : '#2F7F57'} fill={fg} />
      <View style={[styles.rowBetween, { alignItems: 'flex-end' }]}>
        <View style={{ gap: 2 }}>
          <Text variant="caption" style={{ color: soft }}>Valor estimado</Text>
          <Text variant="heading" style={{ color: fg, fontVariant: ['tabular-nums'] }}>{formatBRL(list.summary.total_updated)}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
          <AvatarStack profiles={list.members.map((m) => m.profile)} ring={colors.primary} />
          <Text variant="caption" style={{ color: fg, flexShrink: 1 }} numberOfLines={1}>{people}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export function ListCard({ list, onPress }: { list: ListOverview; onPress?: () => void }) {
  const { colors } = useTheme();
  const { progress, people, count } = describe(list);
  const done = list.status === 'completed';
  return (
    <Card
      onPress={onPress ?? (() => router.push(`/lists/${list.id}`))}
      accessibilityLabel={`${list.name}. ${count}. ${formatBRL(list.summary.total_updated)}`}
      style={{ gap: 12 }}
    >
      <View style={[styles.rowBetween, { alignItems: 'flex-start', gap: 12 }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyStrong" style={{ fontFamily: 'Manrope_800ExtraBold' }} numberOfLines={1}>{list.name}</Text>
          <Text variant="caption" tone="muted">{done && list.completed_at ? `Concluída em ${timeAgo(list.completed_at)}` : count}</Text>
        </View>
        <Text variant="bodyStrong" style={{ fontFamily: 'Manrope_800ExtraBold', fontVariant: ['tabular-nums'] }}>
          {formatBRL(done ? list.summary.total_spent : list.summary.total_updated)}
        </Text>
      </View>
      {!done ? <ProgressBar value={progress} height={6} /> : null}
      <View style={styles.rowBetween}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
          <AvatarStack profiles={list.members.map((m) => m.profile)} size={26} ring={colors.surface} />
          <Text variant="caption" tone="muted" numberOfLines={1} style={{ flex: 1 }}>{people}</Text>
        </View>
        <Text variant="caption" tone="muted">{timeAgo(list.updated_at)}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: 24, padding: 20, gap: 14 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});

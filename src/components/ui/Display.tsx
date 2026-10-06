import type { ReactNode } from 'react';
import { Image, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { initials } from '@/lib/format';
import { STATUS_SHORT } from '@/lib/status';
import { useTheme } from '@/theme/ThemeProvider';
import { avatarColors, radius } from '@/theme/tokens';
import type { ProductStatus, Profile } from '@/types/models';

import { Text } from './Text';

// ---------------------------------------------------------------------------
export function Card({ children, style, onPress, accessibilityLabel }: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const base = [styles.card, { backgroundColor: colors.surface, borderColor: colors.line }, style];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [base, { opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] }]}
    >
      {children}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
export function Badge({ label, bg, fg, strike }: { label: string; bg: string; fg: string; strike?: boolean }) {
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text variant="micro" style={{ color: fg, textDecorationLine: strike ? 'line-through' : 'none' }}>
        {label}
      </Text>
    </View>
  );
}

export function StatusBadge({ status }: { status: ProductStatus }) {
  const { status: sc } = useTheme();
  const c = sc[status];
  return <Badge label={STATUS_SHORT[status]} bg={c.bg} fg={c.fg} strike={status === 'cancelled'} />;
}

// ---------------------------------------------------------------------------
function colorFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return avatarColors[h % avatarColors.length];
}

export function Avatar({ profile, size = 40, ring }: { profile?: Pick<Profile, 'id' | 'name' | 'avatar_url'> | null; size?: number; ring?: string }) {
  const c = colorFor(profile?.id ?? '?');
  const style = { width: size, height: size, borderRadius: size / 2, borderWidth: ring ? 2 : 0, borderColor: ring };
  if (profile?.avatar_url) {
    return <Image source={{ uri: profile.avatar_url }} style={style} accessibilityLabel={`Foto de ${profile.name}`} />;
  }
  return (
    <View style={[style, styles.center, { backgroundColor: c.bg }]} accessibilityLabel={profile?.name ?? 'Usuário removido'}>
      <Text style={{ color: c.fg, fontFamily: 'Manrope_800ExtraBold', fontSize: Math.round(size * 0.38) }}>{initials(profile?.name)}</Text>
    </View>
  );
}

export function AvatarStack({ profiles, size = 32, max = 3, ring }: { profiles: (Profile | null | undefined)[]; size?: number; max?: number; ring: string }) {
  const { colors } = useTheme();
  const shown = profiles.slice(0, max);
  const extra = profiles.length - shown.length;
  return (
    <View style={{ flexDirection: 'row' }}>
      {shown.map((p, i) => (
        <View key={p?.id ?? i} style={{ marginLeft: i === 0 ? 0 : -size / 4 }}>
          <Avatar profile={p} size={size} ring={ring} />
        </View>
      ))}
      {extra > 0 ? (
        <View style={[styles.center, { marginLeft: -size / 4, width: size, height: size, borderRadius: size / 2, backgroundColor: colors.sunken, borderWidth: 2, borderColor: ring }]}>
          <Text variant="micro" tone="subtle">+{extra}</Text>
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
export function ProgressBar({ value, height = 8, track, fill, label }: { value: number; height?: number; track?: string; fill?: string; label?: string }) {
  const { colors } = useTheme();
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? 'Progresso da compra'}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}
      style={{ height, borderRadius: height / 2, backgroundColor: track ?? colors.progressTrack, overflow: 'hidden' }}
    >
      <View style={{ height, width: `${pct * 100}%`, borderRadius: height / 2, backgroundColor: fill ?? colors.primary }} />
    </View>
  );
}

export function Divider() {
  const { colors } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.line }} />;
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.xl, borderWidth: 1, padding: 16 },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  center: { alignItems: 'center', justifyContent: 'center' },
});

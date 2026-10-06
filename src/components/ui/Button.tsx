import * as Haptics from 'expo-haptics';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH, radius } from '@/theme/tokens';

import { Icon, type IconName } from './Icon';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'accent' | 'danger' | 'ghost' | 'soft';

interface Props {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  size?: 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}

export function Button({ label, onPress, variant = 'primary', icon, loading, disabled, size = 'lg', style, accessibilityHint }: Props) {
  const { colors } = useTheme();
  const palette: Record<Variant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: colors.primary, fg: colors.onPrimary },
    secondary: { bg: colors.surface, fg: colors.text, border: colors.text },
    accent: { bg: colors.accent, fg: colors.onAccent },
    danger: { bg: colors.surface, fg: colors.danger, border: colors.danger },
    ghost: { bg: 'transparent', fg: colors.primary },
    soft: { bg: colors.surfaceAlt, fg: colors.text },
  };
  const p = palette[variant];
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      disabled={isDisabled}
      onPress={() => {
        void Haptics.selectionAsync().catch(() => undefined);
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: size === 'lg' ? 56 : MIN_TOUCH + 4,
          backgroundColor: isDisabled && variant !== 'ghost' ? colors.sunken : p.bg,
          borderColor: isDisabled ? 'transparent' : p.border ?? 'transparent',
          borderWidth: p.border ? 1.5 : 0,
          opacity: pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={p.fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Icon name={icon} size={20} color={isDisabled ? colors.textMuted : p.fg} strokeWidth={2.4} /> : null}
          <Text variant="bodyStrong" style={{ color: isDisabled ? colors.textMuted : p.fg, fontFamily: 'Manrope_800ExtraBold' }}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  variant = 'surface',
  size = 44,
  badge,
}: {
  icon: IconName;
  label: string;
  onPress?: () => void;
  variant?: 'surface' | 'plain' | 'primary';
  size?: number;
  badge?: boolean;
}) {
  const { colors } = useTheme();
  const bg = variant === 'primary' ? colors.primary : variant === 'surface' ? colors.surface : 'transparent';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.iconBtn,
        {
          width: Math.max(size, MIN_TOUCH),
          height: Math.max(size, MIN_TOUCH),
          borderRadius: Math.max(size, MIN_TOUCH) / 2,
          backgroundColor: bg,
          borderWidth: variant === 'surface' ? 1 : 0,
          borderColor: colors.line,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Icon name={icon} size={21} color={variant === 'primary' ? colors.onPrimary : colors.text} />
      {badge ? <View style={[styles.dot, { backgroundColor: colors.accent, borderColor: bg === 'transparent' ? colors.bg : bg }]} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: 9, right: 10, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
});

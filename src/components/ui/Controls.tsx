import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';

import { Icon } from './Icon';
import { Text } from './Text';

/** Abas segmentadas (ex.: Itens | Chat | Histórico). */
export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const { colors } = useTheme();
  return (
    <View accessibilityRole="tablist" style={[styles.seg, { backgroundColor: colors.sunken }]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={[styles.segItem, active && { backgroundColor: colors.surface }]}
          >
            <Text variant="caption" style={{ fontFamily: active ? 'Manrope_800ExtraBold' : 'Manrope_700Bold', fontSize: 14, color: active ? colors.text : colors.textMuted }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Chips de escolha única (unidade, categoria, filtro). */
export function Chips<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  const { colors } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.chips}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            onPress={() => onChange(o.value)}
            style={[
              styles.chip,
              { borderColor: active ? colors.primary : colors.line, backgroundColor: active ? colors.primarySoft : colors.surface },
            ]}
          >
            <Text variant="caption" style={{ fontSize: 14, color: active ? colors.text : colors.textSubtle, fontFamily: active ? 'Manrope_800ExtraBold' : 'Manrope_700Bold' }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** − 2 + */
export function Stepper({ value, onChange, step = 1, min = step, label }: { value: number; onChange: (v: number) => void; step?: number; min?: number; label: string }) {
  const { colors } = useTheme();
  const fmt = Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '').replace('.', ',');
  const btn = (icon: 'minus' | 'plus', delta: number, a11y: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={() => onChange(Math.max(min, Math.round((value + delta) * 1000) / 1000))}
      style={({ pressed }) => [styles.stepBtn, { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}
    >
      <Icon name={icon} size={18} strokeWidth={2.6} />
    </Pressable>
  );
  return (
    <View accessibilityLabel={`${label}: ${fmt}`} style={[styles.stepper, { backgroundColor: colors.surfaceAlt }]}>
      {btn('minus', -step, `Diminuir ${label.toLowerCase()}`)}
      <Text variant="subheading" style={{ minWidth: 44, textAlign: 'center' }}>{fmt}</Text>
      {btn('plus', step, `Aumentar ${label.toLowerCase()}`)}
    </View>
  );
}

/** Caixa de seleção grande (marcar comprado com um toque). */
export function CheckCircle({ checked, onPress, label, size = 26, square }: { checked: boolean; onPress: () => void; label: string; size?: number; square?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={styles.checkHit}
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: square ? 16 : size / 2,
          borderWidth: 2,
          borderColor: checked ? colors.primary : colors.lineStrong,
          backgroundColor: checked ? colors.primary : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {checked ? <Icon name="check" size={size * 0.55} color={colors.onPrimary} strokeWidth={3.5} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  seg: { flexDirection: 'row', borderRadius: radius.md, padding: 4, gap: 4 },
  segItem: { flex: 1, minHeight: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.md, padding: 4, gap: 4, alignSelf: 'flex-start' },
  stepBtn: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  checkHit: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});

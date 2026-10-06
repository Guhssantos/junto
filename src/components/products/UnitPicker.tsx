import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Input, Text } from '@/components/ui';
import { UNIT_PRESETS, isPresetUnit } from '@/lib/units';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH } from '@/theme/tokens';

/**
 * Unidade de medida opcional. Toque numa opção para escolher; toque de novo para
 * deixar sem unidade. "Outros" permite digitar (maço, bandeja, rolo...).
 */
export function UnitPicker({ value, onChange, hideTitle }: { value: string | null; onChange: (u: string | null) => void; hideTitle?: boolean }) {
  const { colors } = useTheme();
  const [custom, setCustom] = useState(value != null && !isPresetUnit(value));
  const otherActive = custom;

  const chip = (key: string, label: string, active: boolean, onPress: () => void, a11y: string) => (
    <Pressable
      key={key}
      accessibilityRole="radio"
      accessibilityLabel={a11y}
      accessibilityState={{ checked: active }}
      onPress={onPress}
      style={[styles.chip, { borderColor: active ? colors.primary : colors.line, backgroundColor: active ? colors.primarySoft : colors.surface }]}
    >
      <Text variant="caption" style={{ fontSize: 14, color: active ? colors.text : colors.textSubtle, fontFamily: active ? 'Manrope_800ExtraBold' : 'Manrope_700Bold' }}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <View style={{ gap: 8 }}>
      {!hideTitle ? (
        <Text variant="bodyStrong" style={{ fontSize: 14 }}>
          Unidade <Text variant="caption" tone="muted">(opcional)</Text>
        </Text>
      ) : null}
      <View accessibilityRole="radiogroup" accessibilityLabel="Unidade de medida (opcional)" style={styles.row}>
        {UNIT_PRESETS.map((u) => {
          const active = !custom && value === u.value;
          return chip(u.value, u.label, active, () => {
            setCustom(false);
            onChange(active ? null : u.value);
          }, active ? `${u.name}, selecionada. Toque para remover` : u.name);
        })}
        {chip('outros', 'Outros', otherActive, () => {
          if (otherActive) {
            setCustom(false);
            onChange(null);
          } else {
            setCustom(true);
            onChange(value != null && !isPresetUnit(value) ? value : null);
          }
        }, 'Outra unidade')}
      </View>
      {custom ? (
        <Input
          label="Qual unidade?"
          placeholder="Ex.: maço, bandeja, rolo"
          value={value ?? ''}
          onChangeText={(t) => onChange(t.trim() ? t.slice(0, 15) : null)}
          maxLength={15}
          autoCapitalize="none"
          autoFocus
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: MIN_TOUCH, minWidth: MIN_TOUCH, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});

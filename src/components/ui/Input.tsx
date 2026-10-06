import { forwardRef, useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { font, radius } from '@/theme/tokens';

import { Text } from './Text';

interface Props extends TextInputProps {
  label: string;
  error?: string | null;
  hint?: string;
  hideLabel?: boolean;
}

export const Input = forwardRef<TextInput, Props>(function Input({ label, error, hint, hideLabel, style, onFocus, onBlur, ...rest }, ref) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const border = error ? colors.danger : focused ? colors.primary : colors.lineStrong;

  return (
    <View style={styles.wrap}>
      {!hideLabel ? <Text variant="bodyStrong" style={styles.label}>{label}</Text> : null}
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        accessibilityHint={error ?? hint}
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.primary}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          styles.input,
          {
            borderColor: border,
            backgroundColor: colors.surface,
            color: colors.text,
            boxShadow: focused && !error ? `0 0 0 4px ${colors.focus}` : undefined,
          },
          rest.multiline && { minHeight: 96, paddingTop: 14, textAlignVertical: 'top' },
          style,
        ]}
        {...rest}
      />
      {error ? (
        <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="muted">{hint}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontSize: 14 },
  input: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    fontFamily: font.semibold,
    fontSize: 16,
  },
});

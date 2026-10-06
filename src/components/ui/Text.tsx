import { Text as RNText, type TextProps } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { type as typeScale } from '@/theme/tokens';

type Variant = keyof typeof typeScale;
type Tone = 'default' | 'muted' | 'subtle' | 'primary' | 'danger' | 'inverse' | 'onPrimary';

export function Text({ variant = 'body', tone = 'default', style, ...rest }: TextProps & { variant?: Variant; tone?: Tone }) {
  const { colors } = useTheme();
  const color = {
    default: colors.text,
    muted: colors.textMuted,
    subtle: colors.textSubtle,
    primary: colors.primary,
    danger: colors.danger,
    inverse: colors.onInverse,
    onPrimary: colors.onPrimary,
  }[tone];
  return <RNText maxFontSizeMultiplier={1.6} {...rest} style={[typeScale[variant], { color }, style]} />;
}

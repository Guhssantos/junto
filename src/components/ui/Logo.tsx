import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useTheme } from '@/theme/ThemeProvider';

export function Logo({ size = 64 }: { size?: number }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.logo, { width: size, height: size, borderRadius: size * 0.31, backgroundColor: colors.primary }]} accessibilityElementsHidden>
      <Svg width={size * 0.62} height={size * 0.62} viewBox="0 0 40 40" fill="none">
        <Circle cx={15} cy={20} r={9} stroke={colors.onPrimary} strokeWidth={3} />
        <Circle cx={25} cy={20} r={9} stroke="#FCD9BD" strokeWidth={3} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  logo: { alignItems: 'center', justifyContent: 'center' },
});

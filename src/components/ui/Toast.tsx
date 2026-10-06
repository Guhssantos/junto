import { useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { dismissToast, toastStore } from '@/lib/toast';
import { useTheme } from '@/theme/ThemeProvider';

import { Text } from './Text';

export function ToastHost() {
  const items = useSyncExternalStore(toastStore.subscribe, toastStore.get, toastStore.get);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  if (!items.length) return null;
  return (
    <View pointerEvents="box-none" style={[styles.host, { top: insets.top + 8 }]}>
      {items.map((t) => {
        const bg = t.kind === 'error' ? colors.danger : t.kind === 'warning' ? colors.accent : colors.inverse;
        const fg = t.kind === 'error' ? '#FFFFFF' : t.kind === 'warning' ? colors.onAccent : colors.onInverse;
        return (
          <Pressable
            key={t.id}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            onPress={() => dismissToast(t.id)}
            style={[styles.toast, { backgroundColor: bg }]}
          >
            <Text variant="caption" style={{ color: fg, flex: 1, fontSize: 14 }}>{t.message}</Text>
            {t.action ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  t.action?.onPress();
                  dismissToast(t.id);
                }}
                hitSlop={10}
              >
                <Text variant="caption" style={{ color: fg, fontFamily: 'Manrope_800ExtraBold', textDecorationLine: 'underline' }}>{t.action.label}</Text>
              </Pressable>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 16, right: 16, gap: 8, zIndex: 1000 },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.18)' },
});

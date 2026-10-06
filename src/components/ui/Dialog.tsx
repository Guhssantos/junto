import { useSyncExternalStore } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { closeDialog, dialogStore, type DialogButton } from '@/lib/dialog';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH, radius } from '@/theme/tokens';

import { Text } from './Text';

/** Diálogos da web (no celular o showDialog usa o alerta nativo e nada é desenhado aqui). */
export function DialogHost() {
  const items = useSyncExternalStore(dialogStore.subscribe, dialogStore.get, dialogStore.get);
  const { colors } = useTheme();
  const current = items[0];
  if (!current) return null;

  const cancel = current.buttons.find((b) => b.style === 'cancel');
  const press = (b?: DialogButton) => {
    closeDialog(current.id);
    b?.onPress?.();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => press(cancel)}>
      <View style={styles.center}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]} onPress={() => press(cancel)} accessibilityLabel="Fechar" />
        <View accessibilityViewIsModal accessibilityRole="alert" style={[styles.box, { backgroundColor: colors.surface }]}>
          <Text variant="heading" accessibilityRole="header">{current.title}</Text>
          {current.message ? <Text tone="muted">{current.message}</Text> : null}
          <View style={{ gap: 8, marginTop: 8 }}>
            {current.buttons.map((b, i) => {
              const fg = b.style === 'destructive' ? colors.danger : b.style === 'cancel' ? colors.textMuted : colors.primary;
              return (
                <Pressable
                  key={`${b.text}-${i}`}
                  accessibilityRole="button"
                  onPress={() => press(b)}
                  style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                    styles.button,
                    { backgroundColor: pressed || hovered ? colors.surfaceAlt : 'transparent', borderColor: colors.line },
                  ]}
                >
                  <Text variant="bodyStrong" style={{ color: fg }}>{b.text}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  box: { width: '100%', maxWidth: 400, borderRadius: radius.lg, padding: 20, gap: 8, boxShadow: '0 12px 32px rgba(0,0,0,0.25)' },
  button: { minHeight: MIN_TOUCH, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
});

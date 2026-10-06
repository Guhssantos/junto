import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CONTENT_MAX_WIDTH } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';

import { IconButton } from './Button';
import { Text } from './Text';

/** Painel inferior (bottom sheet) usado para formulários curtos. */
export function Sheet({ visible, onClose, title, children, footer }: { visible: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]} onPress={onClose} accessibilityLabel="Fechar" />
        <View style={{ flex: 1 }} pointerEvents="box-none" />
        <View
          accessibilityViewIsModal
          style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom, 16) + 8 }]}
        >
          <View style={[styles.grabber, { backgroundColor: colors.lineStrong }]} />
          <View style={styles.titleRow}>
            <Text variant="heading" accessibilityRole="header" style={{ flex: 1 }}>{title}</Text>
            <IconButton icon="close" label="Fechar" onPress={onClose} variant="plain" />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 16, paddingBottom: footer ? 4 : 0 }} bounces={false}>
            {children}
          </ScrollView>
          {/* Rodapé fixo: ações principais sempre visíveis, mesmo com a folha rolada ou o teclado aberto. */}
          {footer ? <View style={[styles.footer, { borderTopColor: colors.line }]}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Em telas largas o Modal ocupa a janela inteira: limita à coluna de conteúdo.
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 10, maxHeight: '90%', width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, marginTop: 8 },
});

import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIsOnline } from '@/hooks/useNetwork';
import { useOutbox } from '@/hooks/useOutbox';
import { CONTENT_MAX_WIDTH } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeProvider';

import { Button, IconButton } from './Button';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

/** Tela padrão: fundo do tema, área segura e teclado. */
export function Screen({ children, scroll, padded = true, style, edges = ['top'], wide }: {
  children?: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  edges?: ('top' | 'bottom')[];
  /** Usa toda a largura disponível (ex.: grade de cartões). Sem isso, o conteúdo fica numa coluna de até 720 px. */
  wide?: boolean;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pad = {
    paddingTop: edges.includes('top') ? insets.top : 0,
    paddingBottom: edges.includes('bottom') ? insets.bottom : 0,
  };
  const column = wide ? null : styles.column;
  const inner = scroll ? (
    <ScrollView
      contentContainerStyle={[column, padded && styles.padded, { paddingBottom: 32 }, style]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, column, padded && styles.padded, style]}>{children}</View>
  );
  return (
    // iOS: a rolagem já se ajusta ao teclado (automaticallyAdjustKeyboardInsets); telas sem rolagem
    // (chat, lista) sobem com padding. Android: a janela encolhe (softwareKeyboardLayoutMode: resize).
    <KeyboardAvoidingView style={[{ flex: 1, backgroundColor: colors.bg }, pad]} behavior={Platform.OS === 'ios' && !scroll ? 'padding' : undefined}>
      {inner}
    </KeyboardAvoidingView>
  );
}

export function Header({ title, subtitle, back = true, right }: { title: string; subtitle?: string; back?: boolean; right?: ReactNode }) {
  return (
    <View style={styles.header}>
      {back ? <IconButton icon="back" label="Voltar" variant="plain" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} /> : null}
      <View style={{ flex: 1, paddingLeft: back ? 0 : 4 }}>
        <Text variant="heading" accessibilityRole="header" numberOfLines={1}>{title}</Text>
        {subtitle ? <Text variant="caption" tone="muted" numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function Loading({ label = 'Carregando…' }: { label?: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.center} accessibilityLiveRegion="polite">
      <ActivityIndicator color={colors.primary} size="large" />
      <Text variant="caption" tone="muted">{label}</Text>
    </View>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: IconName; title: string; body?: string; action?: { label: string; onPress: () => void } }) {
  const { colors } = useTheme();
  return (
    <View style={styles.center}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.primarySoft }]}>
        <Icon name={icon} size={30} color={colors.primary} />
      </View>
      <Text variant="subheading" style={{ textAlign: 'center' }}>{title}</Text>
      {body ? <Text tone="muted" style={{ textAlign: 'center', maxWidth: 300 }}>{body}</Text> : null}
      {action ? <Button label={action.label} onPress={action.onPress} size="md" style={{ marginTop: 8, alignSelf: 'center' }} /> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <EmptyState
      icon="wifiOff"
      title="Algo não saiu como esperado"
      body={message}
      action={onRetry ? { label: 'Tentar novamente', onPress: onRetry } : undefined}
    />
  );
}

/** Aviso fixo quando não há internet, com a quantidade de alterações aguardando envio. */
export function OfflineBanner() {
  const online = useIsOnline();
  const outbox = useOutbox();
  const { colors } = useTheme();
  if (online !== false && outbox.length === 0) return null;
  const text =
    online === false
      ? outbox.length
        ? `Sem internet · ${outbox.length} ${outbox.length === 1 ? 'alteração será enviada' : 'alterações serão enviadas'} quando a conexão voltar`
        : 'Sem internet · você pode continuar usando a lista'
      : `Sincronizando ${outbox.length} ${outbox.length === 1 ? 'alteração' : 'alterações'}…`;
  return (
    <View accessibilityRole="alert" style={[styles.banner, { backgroundColor: colors.warningSoft }]}>
      <Icon name="wifiOff" size={16} color={colors.onWarningSoft} />
      <Text variant="caption" style={{ color: colors.onWarningSoft, flex: 1 }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  padded: { paddingHorizontal: 20 },
  column: { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8, minHeight: 56 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  emptyIcon: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
});

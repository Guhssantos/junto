import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/manrope';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ConflictDialog } from '@/components/products/ConflictDialog';
import { DialogHost, Text, ToastHost } from '@/components/ui';
import { envError } from '@/config/env';
import { PERSIST_MAX_AGE, persister, queryClient, shouldPersistQuery } from '@/lib/queryClient';
import { AppEffects } from '@/providers/AppEffects';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';
import { FRAME_MAX_WIDTH, useLayout } from '@/theme/layout';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

function RootNavigator() {
  const { colors, scheme } = useTheme();
  const { initializing } = useAuth();

  useEffect(() => {
    if (!initializing) void SplashScreen.hideAsync().catch(() => undefined);
  }, [initializing]);

  if (initializing) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_right' }} />
      <AppEffects />
      <ConflictDialog />
      <ToastHost />
      <DialogHost />
    </>
  );
}

/**
 * Telas grandes (tablet, notebook, desktop — web ou nativo): o app ocupa uma área
 * centralizada de até 1080 px em vez de esticar por toda a largura. No celular, tela cheia.
 */
function AppFrame({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const { width } = useLayout();
  if (width <= FRAME_MAX_WIDTH) return <View style={{ flex: 1, backgroundColor: colors.bg }}>{children}</View>;
  return (
    <View style={{ flex: 1, backgroundColor: colors.sunken, alignItems: 'center' }}>
      <View style={{ flex: 1, width: '100%', maxWidth: FRAME_MAX_WIDTH, backgroundColor: colors.bg, borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.line }}>
        {children}
      </View>
    </View>
  );
}

function ConfigError() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: 32, justifyContent: 'center', gap: 12 }}>
      <Text variant="heading">Configuração necessária</Text>
      <Text tone="muted">{envError}</Text>
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  useEffect(() => {
    if (fontError) void SplashScreen.hideAsync().catch(() => undefined);
  }, [fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppFrame>
        {envError ? (
          <ConfigError />
        ) : (
          <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: PERSIST_MAX_AGE, buster: 'v1', dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery } }}>
            <AuthProvider>
              <RootNavigator />
            </AuthProvider>
          </PersistQueryClientProvider>
        )}
        </AppFrame>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

import { Redirect, Stack, usePathname } from 'expo-router';

import { rememberPendingInvite, safeNext } from '@/lib/invite';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeProvider';

/** Área logada. Sem sessão → login (guardando o convite aberto por link, se houver). */
export default function AppLayout() {
  const { session } = useAuth();
  const { colors } = useTheme();
  const pathname = usePathname();
  if (!session) {
    const next = safeNext(pathname);
    rememberPendingInvite(next);
    return <Redirect href={next ? { pathname: '/sign-in', params: { next } } : '/sign-in'} />;
  }
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_right' }}>
      <Stack.Screen name="(tabs)" options={{ animation: 'none' }} />
      <Stack.Screen name="lists/new" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      <Stack.Screen name="scan" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
    </Stack>
  );
}

import { Redirect, Stack, useGlobalSearchParams } from 'expo-router';

import { peekPendingInvite, safeNext } from '@/lib/invite';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeProvider';

/** Telas públicas. Usuário logado é levado para a Home (ou para o convite que abriu). */
export default function AuthLayout() {
  const { session } = useAuth();
  const { colors } = useTheme();
  const { next } = useGlobalSearchParams<{ next?: string }>();
  if (session) return <Redirect href={(safeNext(next) ?? peekPendingInvite() ?? '/home') as never} />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}

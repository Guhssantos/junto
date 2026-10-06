import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';

import { env } from '@/config/env';
import { supabase } from '@/lib/supabase';

let currentToken: string | null = null;

// Com o app aberto, mostramos um aviso dentro do app (toast) em vez do banner do sistema.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => {
      const active = AppState.currentState === 'active';
      return { shouldShowBanner: !active, shouldShowList: true, shouldPlaySound: !active, shouldSetBadge: true };
    },
  });
}

/**
 * Pede permissão e registra o token do aparelho no servidor.
 * Retorna false quando push não está disponível (simulador, permissão negada,
 * projectId ausente ou Expo Go no Android) — o app continua funcionando com a
 * central de notificações e o tempo real.
 */
export async function registerForPush(): Promise<boolean> {
  try {
    if (!Device.isDevice || Platform.OS === 'web' || !env.easProjectId) return false;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Atualizações das listas',
        importance: Notifications.AndroidImportance.HIGH,
        lightColor: '#17643F',
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let granted = existing.granted;
    if (!granted && existing.canAskAgain) granted = (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return false;

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: env.easProjectId });
    currentToken = token;
    const { error } = await supabase.rpc('register_push_token', {
      p_token: token,
      p_platform: Platform.OS === 'ios' ? 'ios' : 'android',
    });
    return !error;
  } catch (e) {
    console.warn('[push] registro indisponível', e);
    return false;
  }
}

/** No logout: este aparelho deixa de receber push desta conta. */
export async function unregisterPush(): Promise<void> {
  if (!currentToken) return;
  await supabase.from('push_tokens').delete().eq('token', currentToken);
  currentToken = null;
}

export async function setBadge(count: number) {
  if (Platform.OS === 'web') return;
  await Notifications.setBadgeCountAsync(count).catch(() => undefined);
}

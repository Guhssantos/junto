import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { env } from '@/config/env';
import { secureStorage } from './secureStorage';

export const supabase = createClient(env.supabaseUrl, env.supabaseKey, {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Na web, o link de confirmação de e-mail volta para o site com a sessão na URL.
    detectSessionInUrl: Platform.OS === 'web',
  },
  realtime: {
    params: { eventsPerSecond: 20 },
  },
});

// Renova o token só com o app em primeiro plano (recomendação do Supabase para mobile).
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

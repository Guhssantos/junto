import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { z } from 'zod';

// Variáveis públicas (EXPO_PUBLIC_*) são embutidas no app no build.
// Nunca coloque segredos aqui (ex.: service_role key).
const schema = z.object({
  supabaseUrl: z.string().url(),
  supabaseKey: z.string().min(20),
  easProjectId: z.string().optional(),
  inviteBaseUrl: z.string().url().optional(),
});

const parsed = schema.safeParse({
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabaseKey: process.env.EXPO_PUBLIC_SUPABASE_KEY,
  easProjectId:
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID ||
    (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId ||
    undefined,
  inviteBaseUrl: process.env.EXPO_PUBLIC_INVITE_BASE_URL || undefined,
});

export const envError = parsed.success
  ? null
  : 'Configuração ausente: defina EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_KEY no arquivo .env (rode `npm run setup`) ou, no site publicado, nas variáveis de ambiente da hospedagem e publique de novo. Veja docs/DEPLOY_GRATUITO.md.';

const LOOPBACK = /^(localhost|127\.\d+\.\d+\.\d+)$/i;
const LOCAL_HOST = /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|[\w-]+\.local)$/i;

/**
 * Supabase local + app aberto pela rede (ex.: celular em http://192.168.0.10:8081):
 * "127.0.0.1" no celular aponta para o próprio celular. Usa o mesmo endereço da página,
 * assim o teste na rede funciona sem editar o .env quando o IP do computador muda.
 * Não afeta projetos na nuvem (https://xxxx.supabase.co).
 */
export function resolveSupabaseUrl(configured: string, pageHost: string | undefined = Platform.OS === 'web' ? globalThis.location?.hostname : undefined): string {
  if (!pageHost) return configured;
  try {
    const url = new URL(configured);
    if (!LOCAL_HOST.test(url.hostname) || !LOCAL_HOST.test(pageHost) || url.hostname === pageHost) return configured;
    // localhost e 127.0.0.1 são o mesmo computador; trocar mudaria a chave da sessão salva.
    if (LOOPBACK.test(url.hostname) && LOOPBACK.test(pageHost)) return configured;
    url.hostname = pageHost;
    return url.toString().replace(/\/$/, '');
  } catch {
    return configured;
  }
}

export const env = parsed.success
  ? { ...parsed.data, supabaseUrl: resolveSupabaseUrl(parsed.data.supabaseUrl) }
  : { supabaseUrl: 'https://invalid.local', supabaseKey: 'invalid-key-placeholder-000', easProjectId: undefined, inviteBaseUrl: undefined };

export const APP_SCHEME = 'junto';

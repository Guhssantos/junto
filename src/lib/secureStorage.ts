import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Armazena a sessão do Supabase no Keychain (iOS) / Keystore (Android).
// O SecureStore aceita ~2 KB por chave; a sessão é dividida em pedaços.
const CHUNK = 1800;

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return globalThis.localStorage?.getItem(key) ?? null;
  const count = await SecureStore.getItemAsync(`${key}__n`);
  if (!count) return null;
  const parts: string[] = [];
  for (let i = 0; i < Number(count); i++) {
    const part = await SecureStore.getItemAsync(`${key}__${i}`);
    if (part == null) return null;
    parts.push(part);
  }
  return parts.join('');
}

async function removeItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.removeItem(key);
    return;
  }
  const count = Number((await SecureStore.getItemAsync(`${key}__n`)) ?? 0);
  for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(`${key}__${i}`);
  await SecureStore.deleteItemAsync(`${key}__n`);
}

async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.setItem(key, value);
    return;
  }
  await removeItem(key);
  const chunks = Math.ceil(value.length / CHUNK);
  for (let i = 0; i < chunks; i++) {
    await SecureStore.setItemAsync(`${key}__${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK));
  }
  await SecureStore.setItemAsync(`${key}__n`, String(chunks));
}

export const secureStorage = { getItem, setItem, removeItem };

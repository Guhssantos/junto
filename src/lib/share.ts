import * as Clipboard from 'expo-clipboard';
import { Platform, Share } from 'react-native';

import { showToast } from './toast';

/**
 * Abre o compartilhamento do sistema. No navegador sem Web Share API
 * (ex.: Chrome/Firefox no computador), copia o texto e avisa.
 */
export async function shareText(message: string): Promise<void> {
  const nav = globalThis.navigator as (Navigator & { share?: (d: { text: string }) => Promise<void> }) | undefined;
  if (Platform.OS === 'web' && !nav?.share) {
    const ok = await Clipboard.setStringAsync(message).catch(() => false);
    showToast(
      ok ? 'Convite copiado. Cole no WhatsApp, e-mail ou onde preferir.' : 'Não foi possível copiar automaticamente. Envie o código mostrado na tela.',
      ok ? 'success' : 'warning',
    );
    return;
  }
  try {
    await Share.share({ message });
  } catch {
    // Compartilhamento cancelado pelo usuário: nada a fazer.
  }
}

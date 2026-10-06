import * as Crypto from 'expo-crypto';

/**
 * UUID v4 gerado no aparelho — permite criar itens offline sem duplicar no reenvio.
 *
 * No navegador, `crypto.randomUUID` só existe em páginas seguras (HTTPS ou localhost).
 * Aberto pela rede (ex.: http://192.168.0.10:8081 no celular) ele não existe, e
 * adicionar itens/enviar mensagens falhava. `getRandomValues` existe em qualquer página.
 */
export function uuid(): string {
  const webCrypto = globalThis.crypto as WebCrypto | undefined;
  if (typeof webCrypto?.randomUUID === 'function') return webCrypto.randomUUID();
  if (typeof webCrypto?.getRandomValues === 'function') return fromBytes(webCrypto.getRandomValues(new Uint8Array(16)));
  return Crypto.randomUUID();
}

type WebCrypto = { randomUUID?: () => string; getRandomValues?: <T extends Uint8Array>(a: T) => T };

export function fromBytes(bytes: Uint8Array): string {
  const b = Uint8Array.from(bytes);
  b[6] = (b[6] & 0x0f) | 0x40; // versão 4
  b[8] = (b[8] & 0x3f) | 0x80; // variante RFC 4122
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

import { Platform } from 'react-native';

import { APP_SCHEME, env } from '@/config/env';

const CODE_RE = /^[A-Z]{4}-[0-9]{4}$/;

/** "abcd 1234" → "ABCD-1234"; retorna null se não for um código válido. */
export function normalizeInviteCode(input: string): string | null {
  const clean = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[A-Z]{4}[0-9]{4}$/.test(clean)) return null;
  const code = `${clean.slice(0, 4)}-${clean.slice(4)}`;
  return CODE_RE.test(code) ? code : null;
}

/**
 * Endereço usado nos links de convite: o domínio configurado ou, na versão web,
 * o próprio site aberto — assim o link funciona em qualquer navegador, mesmo sem o app.
 */
export function defaultInviteBase(): string | undefined {
  if (env.inviteBaseUrl) return env.inviteBaseUrl;
  if (Platform.OS === 'web') return globalThis.location?.origin;
  return undefined;
}

export function buildInviteLink(code: string, baseUrl = defaultInviteBase()): string {
  return baseUrl ? `${baseUrl.replace(/\/$/, '')}/join/${code}` : `${APP_SCHEME}://join/${code}`;
}

/** Extrai o código de um link de convite, de um QR Code ou de texto digitado. */
export function parseInvite(text: string): string | null {
  const trimmed = text.trim();
  const fromLink = trimmed.match(/join\/([A-Za-z0-9-]{8,9})(?:[/?#]|$)/);
  if (fromLink) return normalizeInviteCode(fromLink[1]);
  const fromQuery = trimmed.match(/[?&]code=([A-Za-z0-9-]{8,9})/);
  if (fromQuery) return normalizeInviteCode(fromQuery[1]);
  return normalizeInviteCode(trimmed);
}

/** Só aceita redirecionar para rotas internas de convite (evita redirecionamento aberto). */
export function safeNext(next?: string | null): string | null {
  return next && /^\/join\/[A-Za-z0-9-]{8,9}$/.test(next) ? next : null;
}

// Convite aberto antes do login: guardado aqui para que não se perca nos
// redirecionamentos (login → criar conta → confirmação). Na web também fica no
// sessionStorage, que sobrevive a um recarregamento da aba.
const PENDING_KEY = 'junto.pending-invite';
let pendingNext: string | null = null;

export function rememberPendingInvite(path: string | null | undefined) {
  const safe = safeNext(path);
  if (!safe) return;
  pendingNext = safe;
  try {
    globalThis.sessionStorage?.setItem(PENDING_KEY, safe);
  } catch {
    // armazenamento indisponível (modo privado): fica só na memória
  }
}

/** Convite pendente, sem apagar (seguro para chamar durante a renderização). */
export function peekPendingInvite(): string | null {
  let value = pendingNext;
  try {
    value ??= globalThis.sessionStorage?.getItem(PENDING_KEY) ?? null;
  } catch {
    // ignore
  }
  return safeNext(value);
}

/** Apaga o convite pendente (chamado quando a tela do convite abre). */
export function clearPendingInvite() {
  pendingNext = null;
  try {
    globalThis.sessionStorage?.removeItem(PENDING_KEY);
  } catch {
    // ignore
  }
}

/** Devolve e apaga o convite pendente. */
export function takePendingInvite(): string | null {
  const value = peekPendingInvite();
  clearPendingInvite();
  return value;
}

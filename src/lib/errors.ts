// Converte erros técnicos em mensagens claras em português.
// Os códigos vêm das funções RPC do banco (raise exception '<codigo>').

export type ErrorKind =
  | 'offline'
  | 'server'
  | 'forbidden'
  | 'not_found'
  | 'list_unavailable'
  | 'invite_expired'
  | 'validation'
  | 'auth'
  | 'sync'
  | 'unknown';

export class AppError extends Error {
  constructor(
    public kind: ErrorKind,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

const CODE_MESSAGES: Record<string, [ErrorKind, string]> = {
  not_authenticated: ['auth', 'Sua sessão expirou. Entre novamente para continuar.'],
  forbidden: ['forbidden', 'Você não tem permissão para fazer isso nesta lista.'],
  list_unavailable: ['list_unavailable', 'Esta lista não está mais disponível para alterações.'],
  product_not_found: ['not_found', 'Este produto não existe mais na lista.'],
  request_not_found: ['not_found', 'Este pedido já foi respondido ou cancelado.'],
  member_not_found: ['not_found', 'Este participante não está mais na lista.'],
  invalid_input: ['validation', 'Confira os dados informados e tente novamente.'],
  invalid_status: ['validation', 'Não é possível mudar para este status agora.'],
  awaiting_confirmation: ['validation', 'Este item está aguardando a resposta do parceiro.'],
  already_answered: ['validation', 'Esta pergunta já foi respondida.'],
  cannot_respond_own: ['validation', 'Quem perguntou não pode responder ao próprio pedido.'],
  no_partner: ['validation', 'Convide alguém para a lista antes de perguntar ao parceiro.'],
  owner_cannot_leave: ['validation', 'O dono não pode sair da lista. Você pode excluí-la.'],
  // Auth (Supabase)
  invalid_credentials: ['auth', 'E-mail ou senha incorretos.'],
  email_not_confirmed: ['auth', 'Confirme seu e-mail antes de entrar.'],
  user_already_exists: ['auth', 'Já existe uma conta com este e-mail.'],
  weak_password: ['validation', 'Use uma senha com pelo menos 8 caracteres, letras e números.'],
  over_email_send_rate_limit: ['auth', 'Muitas tentativas. Aguarde um minuto e tente de novo.'],
  over_request_rate_limit: ['auth', 'Muitas tentativas. Aguarde um pouco e tente de novo.'],
  otp_expired: ['auth', 'Código inválido ou expirado. Peça um novo código.'],
  same_password: ['validation', 'A nova senha precisa ser diferente da atual.'],
};

export const OFFLINE_MESSAGE = 'Sem internet. Verifique sua conexão e tente novamente.';

interface RawError {
  message?: string;
  code?: string;
  status?: number;
  name?: string;
}

export function isNetworkError(err: unknown): boolean {
  if (err instanceof AppError) return err.kind === 'offline';
  const e = (err ?? {}) as RawError;
  const msg = `${e.name ?? ''} ${e.message ?? ''}`.toLowerCase();
  return (
    msg.includes('network request failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('fetch failed') ||
    msg.includes('network error') ||
    msg.includes('timeout') ||
    msg.includes('aborted')
  );
}

export function toAppError(err: unknown, fallback = 'Algo deu errado. Tente novamente.'): AppError {
  if (err instanceof AppError) return err;
  if (isNetworkError(err)) return new AppError('offline', OFFLINE_MESSAGE);
  const e = (err ?? {}) as RawError;
  const key = (e.code && CODE_MESSAGES[e.code] ? e.code : e.message?.trim()) ?? '';
  const known = CODE_MESSAGES[key];
  if (known) return new AppError(known[0], known[1], key);
  if (e.message?.toLowerCase().includes('invalid login credentials')) {
    const [kind, msg] = CODE_MESSAGES.invalid_credentials;
    return new AppError(kind, msg, 'invalid_credentials');
  }
  if (typeof e.status === 'number' && e.status >= 500) {
    return new AppError('server', 'Nossos servidores estão com instabilidade. Tente novamente em instantes.');
  }
  return new AppError('unknown', fallback, e.code);
}

/** Lança AppError se a resposta do Supabase tiver erro. */
export function unwrap<T>(res: { data: T | null; error: unknown }, fallback?: string): T {
  if (res.error) throw toAppError(res.error, fallback);
  return res.data as T;
}

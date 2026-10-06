import { Platform } from 'react-native';
import { z } from 'zod';

import { AppError, toAppError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

export const emailSchema = z.string().trim().toLowerCase().email('Digite um e-mail válido.');
export const passwordSchema = z
  .string()
  .min(8, 'A senha precisa ter pelo menos 8 caracteres.')
  .regex(/[A-Za-z]/, 'Use letras e números na senha.')
  .regex(/\d/, 'Use letras e números na senha.');
export const nameSchema = z.string().trim().min(1, 'Digite seu nome.').max(80, 'Nome muito longo.');

function check<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) throw new AppError('validation', r.error.issues[0]?.message ?? 'Dados inválidos.');
  return r.data;
}

export async function signUp(input: { name: string; email: string; password: string }) {
  const name = check(nameSchema, input.name);
  const email = check(emailSchema, input.email);
  const password = check(passwordSchema, input.password);
  // Na web, o link de confirmação (se ativado no Supabase) volta para este mesmo site.
  const emailRedirectTo = Platform.OS === 'web' ? globalThis.location?.origin : undefined;
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name }, emailRedirectTo } });
  if (error) throw toAppError(error, 'Não foi possível criar sua conta.');
  // Com confirmação de e-mail ativada, a sessão só existe após confirmar.
  return { needsConfirmation: !data.session };
}

export async function signIn(input: { email: string; password: string }) {
  const email = check(emailSchema, input.email);
  if (!input.password) throw new AppError('validation', 'Digite sua senha.');
  const { error } = await supabase.auth.signInWithPassword({ email, password: input.password });
  if (error) throw toAppError(error, 'Não foi possível entrar.');
}

export async function signOut() {
  // scope 'local': encerra a sessão deste aparelho apenas.
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) throw toAppError(error);
}

/** Envia um código de 6 dígitos por e-mail (template em supabase/templates/recovery.html). */
export async function requestPasswordReset(rawEmail: string) {
  const email = check(emailSchema, rawEmail);
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) throw toAppError(error, 'Não foi possível enviar o código.');
}

export async function resetPasswordWithCode(input: { email: string; code: string; password: string }) {
  const email = check(emailSchema, input.email);
  const password = check(passwordSchema, input.password);
  const token = input.code.replace(/\D/g, '');
  if (token.length !== 6) throw new AppError('validation', 'Digite o código de 6 dígitos enviado por e-mail.');
  const { error: otpError } = await supabase.auth.verifyOtp({ email, token, type: 'recovery' });
  if (otpError) throw toAppError({ ...otpError, code: 'otp_expired' });
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw toAppError(error, 'Não foi possível alterar a senha.');
}

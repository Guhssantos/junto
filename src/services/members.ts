import { AppError, unwrap } from '@/lib/errors';
import { normalizeInviteCode } from '@/lib/invite';
import { supabase } from '@/lib/supabase';

export interface Invite {
  code: string;
  expires_at: string;
}

export async function createInvite(listId: string): Promise<Invite> {
  return unwrap(await supabase.rpc('create_invite', { p_list_id: listId }), 'Não conseguimos gerar o convite.') as Invite;
}

export async function revokeInvites(listId: string) {
  unwrap(await supabase.rpc('revoke_invites', { p_list_id: listId }));
}

export type JoinResult =
  | { status: 'pending'; list_name: string }
  | { status: 'already_member'; list_id: string; list_name: string }
  | { status: 'invalid' | 'expired' | 'rate_limited' | 'list_unavailable' };

export const JOIN_MESSAGES: Record<string, string> = {
  invalid: 'Código não encontrado. Confira as letras e números e tente de novo.',
  expired: 'Este convite expirou. Peça um novo código para quem criou a lista.',
  rate_limited: 'Muitas tentativas com códigos inválidos. Aguarde uma hora e tente novamente.',
  list_unavailable: 'Esta lista já foi finalizada e não aceita novos participantes.',
};

export async function requestJoin(rawCode: string): Promise<JoinResult> {
  const code = normalizeInviteCode(rawCode);
  if (!code) throw new AppError('validation', 'O código tem 4 letras e 4 números, como ABCD-1234.');
  return unwrap(await supabase.rpc('request_join', { p_code: code }), 'Não conseguimos enviar seu pedido.') as JoinResult;
}

export async function respondJoin(listId: string, userId: string, accept: boolean) {
  unwrap(await supabase.rpc('respond_join_request', { p_list_id: listId, p_user_id: userId, p_accept: accept }));
}

export async function removeMember(listId: string, userId: string) {
  unwrap(await supabase.rpc('remove_member', { p_list_id: listId, p_user_id: userId }));
}

export async function leaveList(listId: string) {
  unwrap(await supabase.rpc('leave_list', { p_list_id: listId }));
}

export async function fetchRolePermissions(): Promise<{ role_id: string; permission_id: string }[]> {
  return unwrap(await supabase.from('role_permissions').select('role_id, permission_id'));
}

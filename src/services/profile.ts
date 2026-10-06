import { AppError, toAppError, unwrap } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { uuid } from '@/lib/uuid';
import type { Profile } from '@/types/models';

async function requireUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new AppError('auth', 'Sua sessão expirou. Entre novamente para continuar.');
  return id;
}

export async function fetchMyProfile(): Promise<Profile> {
  const id = await requireUserId();
  return unwrap(await supabase.from('profiles').select('id, name, avatar_url, push_enabled, created_at').eq('id', id).single());
}

export async function updateProfile(patch: Partial<Pick<Profile, 'name' | 'avatar_url' | 'push_enabled'>>): Promise<Profile> {
  const id = await requireUserId();
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name || name.length > 80) throw new AppError('validation', 'Digite um nome com até 80 caracteres.');
    patch = { ...patch, name };
  }
  return unwrap(
    await supabase.from('profiles').update(patch).eq('id', id).select('id, name, avatar_url, push_enabled, created_at').single(),
    'Não conseguimos salvar seu perfil.',
  );
}

/** Envia a foto (já reduzida pelo seletor) com nome aleatório e remove as antigas. */
export async function uploadAvatar(localUri: string, mimeType = 'image/jpeg'): Promise<Profile> {
  const id = await requireUserId();
  const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  const path = `${id}/${uuid()}.${ext}`;
  try {
    const body = await (await fetch(localUri)).arrayBuffer();
    const { error } = await supabase.storage.from('avatars').upload(path, body, { contentType: mimeType, upsert: false });
    if (error) throw error;
  } catch (e) {
    throw toAppError(e, 'Não conseguimos enviar a foto. Tente novamente.');
  }
  const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
  const profile = await updateProfile({ avatar_url: pub.publicUrl });
  await removeAvatars(id, path);
  return profile;
}

async function removeAvatars(userId: string, keep?: string) {
  const { data } = await supabase.storage.from('avatars').list(userId);
  const old = (data ?? []).map((f) => `${userId}/${f.name}`).filter((p) => p !== keep);
  if (old.length) await supabase.storage.from('avatars').remove(old);
}

/** LGPD: remove foto, dados e a conta. Listas compartilhadas passam a outro participante. */
export async function deleteAccount(): Promise<void> {
  const id = await requireUserId();
  await removeAvatars(id).catch(() => undefined);
  unwrap(await supabase.rpc('delete_my_account'), 'Não conseguimos excluir sua conta agora.');
  await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
}

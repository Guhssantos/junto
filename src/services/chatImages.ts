import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { AppError, toAppError, unwrap } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { uuid } from '@/lib/uuid';
import type { Message } from '@/types/models';

import { shrinkImage } from './imagePrep';

const BUCKET = 'chat-images';
/** Lado maior da foto enviada: nítida no celular e leve (≈ 200–500 KB). */
const MAX_SIDE = 1600;

export interface PickedImage {
  uri: string;
  width: number;
  height: number;
}

/**
 * Abre a câmera ou a galeria. null = cancelado.
 * No navegador, a câmera abre pelo seletor de arquivo do celular (funciona também sem HTTPS).
 */
export async function pickChatImage(source: 'camera' | 'library'): Promise<PickedImage | null> {
  if (Platform.OS !== 'web') {
    const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      throw new AppError(
        'forbidden',
        source === 'camera'
          ? 'Permita o uso da câmera nas configurações do aparelho para enviar fotos.'
          : 'Permita o acesso às fotos nas configurações do aparelho para enviar imagens.',
      );
    }
  }
  // Sem esperas antes daqui na web: o navegador do celular só abre a câmera/galeria
  // se for imediatamente após o toque.
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 0.9,
    allowsEditing: false,
    exif: false,
    cameraType: ImagePicker.CameraType.back,
  };
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (res.canceled || !res.assets[0]) return null;
  const a = res.assets[0];
  return { uri: a.uri, width: a.width, height: a.height };
}

/** Reduz e converte para JPEG (fotos de celular têm 3–10 MB). */
export async function prepareImage(img: PickedImage): Promise<PickedImage> {
  try {
    return await shrinkImage(img, MAX_SIDE, 0.75);
  } catch (e) {
    throw toAppError(e, 'Não conseguimos preparar a foto. Tente outra imagem.');
  }
}

/** Envia a foto para a pasta da lista e devolve o caminho no Storage. */
export async function uploadChatImage(listId: string, img: PickedImage): Promise<string> {
  const path = `${listId}/${uuid()}.jpg`;
  try {
    const body = await (await fetch(img.uri)).arrayBuffer();
    if (body.byteLength > 5 * 1024 * 1024) throw new AppError('validation', 'A foto ficou grande demais (máx. 5 MB).');
    const { error } = await supabase.storage.from(BUCKET).upload(path, body, { contentType: 'image/jpeg', upsert: false });
    if (error) throw error;
    return path;
  } catch (e) {
    throw toAppError(e, 'Não conseguimos enviar a foto. Verifique a conexão e tente novamente.');
  }
}

export async function rpcSendImageMessage(
  listId: string,
  p: { id: string; body: string; product_id: string | null; image_path: string; image_width: number; image_height: number },
): Promise<Message> {
  return unwrap(
    await supabase.rpc('send_message', {
      p_list_id: listId,
      p_body: p.body,
      p_product_id: p.product_id,
      p_id: p.id,
      p_image_path: p.image_path,
      p_image_width: p.image_width,
      p_image_height: p.image_height,
    }),
    'Não conseguimos enviar a foto.',
  ) as Message;
}

/** URL temporária (1 h) — o bucket é privado: só quem participa da lista consegue ver. */
export async function signedImageUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) throw toAppError(error ?? new Error('sem url'), 'Foto indisponível.');
  return data.signedUrl;
}

/** Ao excluir a lista, apaga as fotos do chat dela (o banco não apaga arquivos do Storage). */
export async function removeListImages(listId: string): Promise<void> {
  for (;;) {
    const { data, error } = await supabase.storage.from(BUCKET).list(listId, { limit: 100 });
    if (error || !data?.length) return;
    const { error: rmError } = await supabase.storage.from(BUCKET).remove(data.map((f) => `${listId}/${f.name}`));
    if (rmError) return;
    if (data.length < 100) return;
  }
}

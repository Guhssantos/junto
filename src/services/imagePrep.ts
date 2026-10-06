import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import type { PickedImage } from './chatImages';

/** Reduz a foto no aparelho (Android/iOS) e converte para JPEG. A versão web fica em .web.ts. */
export async function shrinkImage(img: PickedImage, maxSide: number, quality: number): Promise<PickedImage> {
  const ctx = ImageManipulator.manipulate(img.uri);
  // Informa só o lado maior: o outro é calculado mantendo a proporção.
  if (Math.max(img.width, img.height) > maxSide) ctx.resize(img.width >= img.height ? { width: maxSide } : { height: maxSide });
  const rendered = await ctx.renderAsync();
  const out = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: quality });
  return { uri: out.uri, width: out.width, height: out.height };
}

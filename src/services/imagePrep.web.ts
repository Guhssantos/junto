import type { PickedImage } from './chatImages';

/**
 * Reduz a foto no navegador com o próprio canvas (rápido, usa a GPU) e converte para JPEG.
 * A orientação da câmera (EXIF) é aplicada pelo navegador ao desenhar.
 */
export async function shrinkImage(img: PickedImage, maxSide: number, quality: number): Promise<PickedImage> {
  const blob = await (await fetch(img.uri)).blob();
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas indisponível');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!out) throw new Error('falha ao gerar JPEG');
  return { uri: URL.createObjectURL(out), width, height };
}

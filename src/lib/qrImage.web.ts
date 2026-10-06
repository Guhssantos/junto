import { BarcodeDetector, setZXingModuleOverrides } from 'barcode-detector/ponyfill';

// Leitor de QR Code do próprio site (public/zxing_reader.wasm), sem depender de CDN.
// Vale também para a câmera ao vivo do expo-camera, que usa a mesma biblioteca.
setZXingModuleOverrides({
  locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? `${globalThis.location?.origin ?? ''}/zxing_reader.wasm` : prefix + path),
});

/**
 * Câmera ao vivo só existe em páginas seguras (HTTPS ou localhost). Aberto pela rede
 * (ex.: http://192.168.0.10:8081 no celular), o navegador não oferece a câmera ao vivo;
 * aí usamos a foto (o seletor de arquivo abre a câmera do celular mesmo sem HTTPS).
 */
export function canUseLiveCamera(): boolean {
  return !!globalThis.isSecureContext && typeof globalThis.navigator?.mediaDevices?.getUserMedia === 'function';
}

export const canReadQrFromPhoto = true;

/** Abre a câmera do celular (capture) ou a galeria/arquivos e devolve a imagem escolhida. */
export function pickImage(capture: boolean): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (capture) input.setAttribute('capture', 'environment');
    input.style.display = 'none';
    let done = false;
    const finish = (f: File | null) => {
      if (done) return;
      done = true;
      input.remove();
      resolve(f);
    };
    input.addEventListener('change', () => finish(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => finish(null));
    document.body.appendChild(input);
    input.click();
  });
}

/** Reduz fotos grandes (12 MP+) antes de ler: mais rápido e sem estourar memória no celular. */
async function toImageData(file: File, max = 1600): Promise<ImageData | Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    return ctx.getImageData(0, 0, w, h);
  } catch {
    return file;
  }
}

/** Lê o texto de um QR Code numa imagem. null = nenhum QR Code encontrado. */
export async function readQrFromImage(file: File): Promise<string | null> {
  const detector = new BarcodeDetector({ formats: ['qr_code'] });
  const found = await detector.detect(await toImageData(file));
  return found[0]?.rawValue ?? null;
}

// Só em desenvolvimento: permite testar a leitura por foto pelo console do navegador.
if (__DEV__) (globalThis as Record<string, unknown>).__juntoReadQr = readQrFromImage;

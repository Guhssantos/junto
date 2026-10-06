// No app nativo a câmera ao vivo (expo-camera) sempre está disponível; a leitura por
// foto é só da versão web (qrImage.web.ts).
export function canUseLiveCamera(): boolean {
  return true;
}

export const canReadQrFromPhoto = false;

export async function pickImage(_capture: boolean): Promise<File | null> {
  return null;
}

export async function readQrFromImage(_file: File): Promise<string | null> {
  return null;
}

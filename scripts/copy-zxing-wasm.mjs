// Copia o leitor de QR Code (WebAssembly) para public/, para a versão web não
// depender de CDN externo (redes corporativas costumam bloquear). Roda no postinstall.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
try {
  // zxing-wasm não exporta o package.json; procura nos node_modules possíveis.
  const candidates = [
    'node_modules/barcode-detector/node_modules/zxing-wasm',
    'node_modules/expo-camera/node_modules/zxing-wasm',
    'node_modules/zxing-wasm',
  ].map((d) => join(root, d, 'dist/reader/zxing_reader.wasm'));
  const src = candidates.find((c) => existsSync(c));
  if (!src) throw new Error('zxing-wasm não instalado');
  mkdirSync(join(root, 'public'), { recursive: true });
  copyFileSync(src, join(root, 'public/zxing_reader.wasm'));
  console.log('✓ public/zxing_reader.wasm atualizado');
} catch (e) {
  console.warn('! leitor de QR (zxing) não copiado — a web usará o CDN:', e.message);
}

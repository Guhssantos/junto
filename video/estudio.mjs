// Estúdio do vídeo: serve a página que desenha a animação (estudio/), as telas capturadas
// (capturas/), a fonte Manrope e o mp4-muxer; recebe o MP4 pronto em POST /salvar.
// Uso: node estudio.mjs  → abra http://localhost:8095 (prévia) ou /?gravar=1 (gera o MP4).
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT || 8095);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.ttf': 'font/ttf' };
const ROUTES = {
  '/': 'estudio/index.html',
  '/mp4-muxer.js': 'node_modules/mp4-muxer/build/mp4-muxer.js',
};
const FONTS = join(ROOT, '..', 'node_modules', '@expo-google-fonts', 'manrope');

createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (req.method === 'POST' && url.startsWith('/salvar/')) {
    const name = url.slice('/salvar/'.length).replace(/[^\w.-]/g, '');
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const buf = Buffer.concat(chunks);
      writeFileSync(join(ROOT, name), buf);
      console.log(`✓ salvo ${name} (${(buf.length / 1048576).toFixed(1)} MB)`);
      res.end('ok');
    });
    return;
  }
  let file;
  if (ROUTES[url]) file = join(ROOT, ROUTES[url]);
  else if (url.startsWith('/fontes/')) file = join(FONTS, url.slice('/fontes/'.length));
  else file = join(ROOT, url);
  if (!file.startsWith(join(ROOT, '..')) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end('404');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(readFileSync(file));
}).listen(PORT, () => console.log(`estúdio em http://localhost:${PORT}`));

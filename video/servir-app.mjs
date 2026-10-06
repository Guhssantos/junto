// Serve o build web (video/app-dist) com rota de app de página única, para gravar o vídeo.
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = fileURLToPath(new URL('./app-dist/', import.meta.url));
const PORT = Number(process.env.PORT || 8090);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.wasm': 'application/wasm' };
createServer((req, res) => {
  let file = join(DIST, decodeURIComponent(req.url.split('?')[0]));
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(readFileSync(file));
}).listen(PORT, () => console.log(`app em http://localhost:${PORT}`));

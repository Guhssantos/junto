// Renderiza o vídeo quadro a quadro num Chrome/Chromium sem janela e codifica o MP4 com o ffmpeg
// (H.264, 30 fps). Não depende de WebCodecs, então funciona em qualquer máquina com ffmpeg.
// Uso:
//   node renderizar.mjs                     → vídeo de 40 s, 16:9  (docs/video/junto-40s.mp4)
//   node renderizar.mjs curto vertical      → vídeo de 40 s, 4:5   (docs/video/junto-40s-vertical.mp4)
//   node renderizar.mjs completo            → vídeo completo (precisa das capturas em capturas/)
// Opções por variável de ambiente: CHROME_PATH (navegador), CAPA=segundos (salva também a capa .png).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const roteiro = process.argv[2] || 'curto';
const vertical = process.argv[3] === 'vertical';
const FPS = 30;
const PORT = 8096;
const W = vertical ? 1080 : 1920;
const H = vertical ? 1350 : 1080;
const nome = roteiro === 'curto' ? 'junto-40s' : 'junto-apresentacao';
const saida = `${ROOT}../docs/video/${nome}${vertical ? '-vertical' : ''}.mp4`;

const CANDIDATOS = [
  process.env.CHROME_PATH,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
];
const chrome = CANDIDATOS.find((c) => c && existsSync(c));
if (!chrome) throw new Error('Chrome não encontrado: defina CHROME_PATH');

const estudio = spawn(process.execPath, [`${ROOT}estudio.mjs`], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));

const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox', '--force-color-profile=srgb'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H });
  const qs = new URLSearchParams({ roteiro, ...(vertical ? { formato: 'vertical' } : {}), t: '0' });
  await page.goto(`http://localhost:${PORT}/?${qs}`);
  await page.waitForFunction(() => window.__carregado || window.__erro || /pronto/.test(document.getElementById('status').textContent), { timeout: 60000 });
  const erro = await page.evaluate(() => window.__erro);
  if (erro) throw new Error(erro);

  const quadro = (s) => page.evaluate((t) => {
    window.renderAt(t);
    return document.getElementById('palco').toDataURL('image/png').split(',')[1];
  }, s).then((b64) => Buffer.from(b64, 'base64'));

  if (process.env.CAPA) {
    const { writeFileSync } = await import('node:fs');
    const capa = `${ROOT}../docs/video/${nome}${vertical ? '-vertical' : ''}-capa.png`;
    writeFileSync(capa, await quadro(Number(process.env.CAPA)));
    console.log('✓ capa', capa);
  }

  const duracao = await page.evaluate(() => window.DURACAO());
  const total = Math.round(duracao * FPS);
  const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-c:v', 'png', '-framerate', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart', saida], { stdio: ['pipe', 'inherit', 'inherit'] });
  const fim = new Promise((ok, falha) => ff.on('close', (c) => (c === 0 ? ok() : falha(new Error(`ffmpeg saiu com ${c}`)))));
  for (let f = 0; f < total; f++) {
    const png = await quadro(f / FPS);
    if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
    if (f % 60 === 0) process.stdout.write(`\r${Math.round((f / total) * 100)}%`);
  }
  ff.stdin.end();
  await fim;
  console.log(`\r✓ ${saida} (${duracao.toFixed(1)} s, ${total} quadros)`);
} finally {
  await browser.close();
  estudio.kill();
}

// Recupera as telas reais do app a partir do vídeo completo (docs/video/junto-apresentacao.mp4),
// recortando a área da tela de cada celular num instante em que ela aparece sozinha e sem
// sobreposições. Útil quando as capturas originais (capturas/) não estão disponíveis, já que
// gerá-las exige o Supabase local com as contas de teste.
// A geometria repete a função celular() de estudio/video.js (formato 16:9).
// Uso: node extrair-telas.mjs   (requer ffmpeg no PATH) → telas/*.jpg
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const VIDEO = fileURLToPath(new URL('../docs/video/junto-apresentacao.mp4', import.meta.url));
const OUT = `${ROOT}telas/`;
mkdirSync(OUT, { recursive: true });

/** Retângulo da tela de um celular desenhado em (cx, cy) com altura h */
function tela(cx, cy, h) {
  const w = h * (375 / 812) + h * 0.05;
  const borda = h * 0.022;
  return { x: cx - w / 2 + borda, y: cy - h / 2 + borda, w: w - borda * 2, h: h - borda * 2 };
}

// [nome, segundo no vídeo completo, cx, cy, altura do celular]
const TELAS = [
  ['00-entrar', 23.5, 1400, 560, 900],
  ['01-nova-lista', 27.5, 1400, 560, 900],
  ['02-lista-vazia', 30.6, 1400, 560, 900],
  ['03-adicionar-produto', 34.0, 1400, 560, 900],
  ['04-lista-com-precos', 37.2, 1400, 560, 900],
  ['05-compartilhar', 40.2, 1060, 580, 820],
  ['07-mae-recebe-pedido', 45.3, 1060, 580, 820],
  ['06-gustavo-pedido-enviado', 45.3, 1560, 580, 820],
  ['08-gustavo-modo-mercado', 48.0, 640, 665, 680],
  ['09-gustavo-informa-preco', 50.0, 640, 665, 680],
  ['10-mae-ve-arroz-comprado', 52.0, 1280, 665, 680],
  ['11-mae-ve-cafe-mais-caro', 58.0, 1400, 560, 900],
  ['13-conversa-gustavo', 65.5, 640, 665, 680],
  ['12-conversa-mae', 65.5, 1280, 665, 680],
  ['14-gustavo-pergunta', 71.4, 640, 665, 680],
  ['15-mae-decide', 72.4, 1280, 665, 680],
  ['16-gustavo-aprovado', 77.0, 640, 665, 680],
  ['17-mae-depois-aprovacao', 77.5, 1280, 665, 680],
];

for (const [nome, s, cx, cy, h] of TELAS) {
  const r = tela(cx, cy, h);
  const crop = [r.w, r.h, r.x, r.y].map((v) => Math.round(v)).join(':');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(s), '-i', VIDEO, '-frames:v', '1', '-vf', `crop=${crop}`, '-q:v', '2', `${OUT}${nome}.jpg`]);
  console.log('✓', nome, crop);
}

// Vídeo curto (40 s) do Junto: problema → origem → como funciona → diferenciais.
// Usa as telas reais do app (telas/, recortadas por extrair-telas.mjs) e é desenhado quadro
// a quadro num <canvas>. Prévia: /?roteiro=curto&t=12  ·  Vertical (4:5): &formato=vertical
// Gravação em MP4: node renderizar.mjs curto [vertical]
const params = new URLSearchParams(location.search);
const V = params.get('formato') === 'vertical';
const W = V ? 1080 : 1920;
const H = V ? 1350 : 1080;

const C = {
  bg: '#F6F5F1', surface: '#FFFFFF', text: '#16181D', muted: '#5B6070', line: '#E7E5DF',
  green: '#17643F', greenLight: '#3FAE74', greenSoft: '#D6EDE0', accent: '#F28C45', accentSoft: '#FDE7D3', peach: '#FCD9BD',
  danger: '#B42318', dangerSoft: '#FDECEA', dark: '#0B1F17', darkText: '#F3F1EA', darkMuted: '#9DB5A8',
};
const FONT = 'Manrope, sans-serif';

const canvas = document.getElementById('palco');
canvas.width = W;
canvas.height = H;
const ctxPalco = canvas.getContext('2d');
// cena seguinte é desenhada fora da tela e depois composta (transições sem "vazamento" de opacidade)
const bastidor = document.createElement('canvas');
bastidor.width = W;
bastidor.height = H;
const ctxBastidor = bastidor.getContext('2d');
let ctx = ctxPalco;
const status = document.getElementById('status');

// ---------------------------------------------------------------------------
// Recursos
// ---------------------------------------------------------------------------
const TELAS = [
  '00-entrar', '01-nova-lista', '02-lista-vazia', '03-adicionar-produto', '04-lista-com-precos', '05-compartilhar',
  '06-gustavo-pedido-enviado', '07-mae-recebe-pedido', '08-gustavo-modo-mercado', '09-gustavo-informa-preco',
  '10-mae-ve-arroz-comprado', '11-mae-ve-cafe-mais-caro', '12-conversa-mae', '13-conversa-gustavo', '14-gustavo-pergunta',
  '15-mae-decide', '16-gustavo-aprovado', '17-mae-depois-aprovacao',
];
const img = {};
async function carregar() {
  const pesos = { 500: '500Medium/Manrope_500Medium.ttf', 600: '600SemiBold/Manrope_600SemiBold.ttf', 700: '700Bold/Manrope_700Bold.ttf', 800: '800ExtraBold/Manrope_800ExtraBold.ttf' };
  await Promise.all(Object.entries(pesos).map(async ([w, f]) => {
    const face = new FontFace('Manrope', `url(/fontes/${f})`, { weight: w });
    document.fonts.add(await face.load());
  }));
  await Promise.all(TELAS.map((n) => new Promise((ok, erro) => {
    const i = new Image();
    i.onload = () => ok((img[n] = i));
    i.onerror = () => erro(new Error(`imagem ${n}`));
    i.src = `/telas/${n}.jpg`;
  })));
}

// ---------------------------------------------------------------------------
// Animação e desenho
// ---------------------------------------------------------------------------
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, p) => a + (b - a) * p;
const easeOut = (p) => 1 - Math.pow(1 - p, 3);
const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const easeBack = (p) => 1 + 2.2 * Math.pow(p - 1, 3) + 1.2 * Math.pow(p - 1, 2);
/** progresso 0→1 entre a e b (segundos locais da cena) */
const pr = (t, a, b, ease = easeOut) => ease(clamp((t - a) / (b - a)));
/** aparece em a e some em b (com 0,3 s de transição em cada ponta) */
const janela = (t, a, b, d = 0.3) => pr(t, a, a + d) * (1 - pr(t, b - d, b));

function rr(x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Ícones de linha (grade 24×24) desenhados com Path2D */
const ICONES = {
  raio: 'M13 2 4 14h7l-1 8 9-12h-7l1-8z',
  etiqueta: 'M3 12V4.5A1.5 1.5 0 0 1 4.5 3H12l9 9-9 9zM7.5 7.5h.01',
  check: 'M20 6 9 17l-5-5',
  chat: 'M4 5h16v11H9.5L4 20.5z',
  qr: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM18 18h3v3h-3zM18 14h3M14 18v3',
  carrinho: 'M2.5 3.5h2.4l2.5 11.5h11.2l2.4-8H6.1M9.5 20h.01M17.5 20h.01',
  offline: 'M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 4.6-2.6M19 12.9a10 10 0 0 0-2.5-1.8M2 8.8a15 15 0 0 1 4.3-2.8M22 8.8A15 15 0 0 0 11 5M12 20h.01',
  aparelhos: 'M3 5h13v10H3zM1 19h17M19 9h4v12h-4z',
  papel: 'M6 2h9l5 5v15H6zM14 2v6h6M9 13h8M9 17h6',
  loja: 'M3 9l1.5-5h15L21 9M4 9v11h16V9M3 9h18M9 20v-6h6v6',
  coracao: 'M12 20s-7-4.4-9.2-9A5 5 0 0 1 12 6a5 5 0 0 1 9.2 5C19 15.6 12 20 12 20z',
  cadeado: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
};
const PATHS = Object.fromEntries(Object.entries(ICONES).map(([k, d]) => [k, new Path2D(d)]));
function icone(nome, cx, cy, s, cor, { alpha = 1, largura = 2 } = {}) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(cx - s / 2, cy - s / 2);
  ctx.scale(s / 24, s / 24);
  ctx.lineWidth = largura;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = cor;
  ctx.stroke(PATHS[nome]);
  ctx.restore();
}

/**
 * Texto com trechos destacados entre *asteriscos* e quebra de linha com \n.
 * Cada linha surge de baixo para cima, revelada por uma máscara (efeito "mask reveal").
 */
function titulo(str, x, y, t, t0, { size = 72, weight = 800, color = C.text, hl = C.green, align = 'left', lh = 1.12, alpha = 1, passo = 0.09, dur = 0.65 } = {}) {
  const linhas = String(str).split('\n');
  ctx.save();
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textBaseline = 'alphabetic';
  linhas.forEach((linha, i) => {
    const p = pr(t, t0 + i * passo, t0 + i * passo + dur);
    if (p <= 0 || alpha <= 0) return;
    const partes = linha.split('*');
    const total = partes.reduce((a, s) => a + ctx.measureText(s).width, 0);
    let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
    const by = y + i * size * lh;
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - 20, by - size * 1.05, total + 40, size * 1.38);
    ctx.clip();
    ctx.globalAlpha = alpha * clamp(p * 1.5);
    const dy = (1 - p) * size * 1.1;
    partes.forEach((s, k) => {
      ctx.fillStyle = k % 2 ? hl : color;
      ctx.fillText(s, cx, by + dy);
      cx += ctx.measureText(s).width;
    });
    ctx.restore();
  });
  ctx.restore();
  return y + linhas.length * size * lh;
}

/** Texto comum com quebra automática, entrando com fade + leve subida */
function texto(str, x, y, t, t0, { size = 34, weight = 600, color = C.muted, align = 'left', max = 0, lh = 1.4, alpha = 1 } = {}) {
  const p = pr(t, t0, t0 + 0.6);
  if (p <= 0 || alpha <= 0) return y;
  ctx.save();
  ctx.globalAlpha *= p * alpha;
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  const linhas = [];
  for (const par of String(str).split('\n')) {
    let atual = '';
    for (const palavra of par.split(' ')) {
      const tent = atual ? `${atual} ${palavra}` : palavra;
      if (max && ctx.measureText(tent).width > max && atual) { linhas.push(atual); atual = palavra; } else atual = tent;
    }
    linhas.push(atual);
  }
  linhas.forEach((l, i) => ctx.fillText(l, x, y + (1 - p) * 18 + i * size * lh));
  ctx.restore();
  return y + linhas.length * size * lh;
}

/** Rótulo pequeno em caixa alta, com marcador */
function sobretitulo(str, x, y, t, t0, { color = C.green, align = 'left', alpha = 1 } = {}) {
  const p = pr(t, t0, t0 + 0.5);
  if (p <= 0) return;
  ctx.save();
  ctx.globalAlpha *= p * alpha;
  ctx.font = `800 ${V ? 26 : 26}px ${FONT}`;
  const tw = ctx.measureText(str).width;
  const x0 = align === 'center' ? x - (tw + 34) / 2 : x;
  ctx.fillStyle = color;
  rr(x0, y - 22, 22 * p, 6, 3);
  ctx.fill();
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(str, x0 + 34, y - 10);
  ctx.restore();
}

/** Pílula com texto (e ícone opcional à esquerda) */
function pilula(str, x, y, { size = 28, bg = C.surface, cor = C.text, alpha = 1, borda = C.line, align = 'left', icon = null, iconCor = null, escala = 1 } = {}) {
  if (alpha <= 0) return 0;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.font = `700 ${size}px ${FONT}`;
  const iw = icon ? size * 1.15 : 0;
  const w = ctx.measureText(str).width + size * 1.4 + iw;
  const h = size * 2;
  const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  ctx.translate(x0 + w / 2, y + h / 2);
  ctx.scale(escala, escala);
  ctx.translate(-(x0 + w / 2), -(y + h / 2));
  ctx.shadowColor = 'rgba(22,24,29,0.10)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  rr(x0, y, w, h, h / 2);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  if (borda) { ctx.lineWidth = 2; ctx.strokeStyle = borda; ctx.stroke(); }
  if (icon) icone(icon, x0 + size * 0.7 + size * 0.45, y + h / 2, size * 0.95, iconCor || cor, { largura: 2.4 });
  ctx.fillStyle = cor;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(str, x0 + size * 0.7 + iw, y + h / 2 + 1);
  ctx.restore();
  return w;
}

/** Notificação escura (como os avisos do app), com check */
function aviso(str, cx, y, alpha, size = 26) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.font = `700 ${size}px ${FONT}`;
  const w = ctx.measureText(str).width + size * 3;
  const h = size * 2.3;
  const s = lerp(0.9, 1, alpha);
  ctx.translate(cx, y + h / 2);
  ctx.scale(s, s);
  ctx.translate(-cx, -(y + h / 2));
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 10;
  rr(cx - w / 2, y, w, h, h / 2);
  ctx.fillStyle = C.text;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.beginPath();
  ctx.arc(cx - w / 2 + size * 1.2, y + h / 2, size * 0.62, 0, Math.PI * 2);
  ctx.fillStyle = C.greenLight;
  ctx.fill();
  icone('check', cx - w / 2 + size * 1.2, y + h / 2, size * 0.8, '#fff', { largura: 3.4 });
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.fillText(str, cx - w / 2 + size * 2.15, y + h / 2 + 1);
  ctx.restore();
}

function logo(cx, cy, s, alpha = 1, fundoCor = C.green) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  rr(cx - s / 2, cy - s / 2, s, s, s * 0.31);
  ctx.fillStyle = fundoCor;
  ctx.fill();
  const u = (s * 0.62) / 40;
  ctx.lineWidth = 3 * u;
  [[15, '#FFFFFF'], [25, C.peach]].forEach(([x, cor]) => {
    ctx.beginPath();
    ctx.arc(cx - s * 0.31 + x * u, cy - s * 0.31 + 20 * u, 9 * u, 0, Math.PI * 2);
    ctx.strokeStyle = cor;
    ctx.stroke();
  });
  ctx.restore();
}

// Fundos ----------------------------------------------------------------------
function manchas(t, cores) {
  const blob = (x, y, r, cor) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, cor);
    g.addColorStop(1, cor.replace(/[\d.]+\)$/, '0)'));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  };
  blob(W * 0.12 + Math.sin(t * 0.35) * 50, H * 0.18, V ? 640 : 620, cores[0]);
  blob(W * 0.92 + Math.cos(t * 0.3) * 50, H * 0.88, V ? 680 : 660, cores[1]);
}
function pontos(cor) {
  ctx.fillStyle = cor;
  for (let x = 24; x < W; x += 48) for (let y = 24; y < H; y += 48) ctx.fillRect(x, y, 2, 2);
}
function fundoClaro(t) {
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  pontos('rgba(22,24,29,0.05)');
  manchas(t, ['rgba(214,237,224,0.9)', 'rgba(253,231,211,0.85)']);
}
function fundoEscuro(t) {
  ctx.fillStyle = C.dark;
  ctx.fillRect(0, 0, W, H);
  pontos('rgba(255,255,255,0.045)');
  manchas(t, ['rgba(23,100,63,0.75)', 'rgba(242,140,69,0.22)']);
}

// Celular ---------------------------------------------------------------------
const PROP = 421 / 860; // proporção das telas recortadas
/**
 * Celular com telas reais. `telas` é uma lista [[nome, inicio], …]: cada tela entra (fade +
 * leve subida) a partir do seu instante. Retorna a geometria da tela para pontos de toque.
 */
function celular(cx, cy, h, telas, t, { alpha = 1, rotulo = '', corRotulo = C.green, entrada = 0, deslize = 0 } = {}) {
  const pe = pr(t, entrada, entrada + 0.8);
  const a = alpha * clamp(pe * 1.4);
  const borda = h * 0.022;
  const sh = h - borda * 2;
  const sw = sh * PROP;
  const w = sw + borda * 2;
  const flut = Math.sin((t + cx * 0.01) * 1.3) * 5;
  const x = cx - w / 2 + (1 - pe) * deslize;
  const y = cy - h / 2 + (1 - pe) * 60 + flut;
  const geo = { sx: x + borda, sy: y + borda, sw, sh, x, y, w, h };
  if (a <= 0) return geo;
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.shadowColor = 'rgba(11,31,23,0.30)';
  ctx.shadowBlur = 70;
  ctx.shadowOffsetY = 34;
  rr(x, y, w, h, h * 0.07);
  ctx.fillStyle = '#121417';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.stroke();
  ctx.save();
  rr(geo.sx, geo.sy, sw, sh, h * 0.055);
  ctx.clip();
  ctx.fillStyle = C.bg;
  ctx.fillRect(geo.sx, geo.sy, sw, sh);
  telas.forEach(([nome, ini], i) => {
    const p = i === 0 ? 1 : pr(t, ini, ini + 0.45, easeInOut);
    if (p <= 0) return;
    ctx.globalAlpha = a * p;
    ctx.drawImage(img[nome], geo.sx, geo.sy + (1 - p) * 26, sw, sh);
  });
  ctx.restore();
  if (rotulo) {
    ctx.font = `800 ${Math.round(h * 0.034)}px ${FONT}`;
    const tw = ctx.measureText(rotulo).width + h * 0.06;
    const th = h * 0.06;
    const lx = x + w / 2;
    rr(lx - tw / 2, y - th - h * 0.028, tw, th, th / 2);
    ctx.fillStyle = corRotulo;
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(rotulo, lx, y - th / 2 - h * 0.028 + 1);
  }
  ctx.restore();
  return geo;
}
/** Ponto (u, v) normalizado dentro da tela de um celular */
const ponto = (g, u, v) => [g.sx + u * g.sw, g.sy + v * g.sh];

/** Toque: dedo virtual que aparece, pressiona e solta uma onda */
function toque([x, y], t, t0) {
  const a = janela(t, t0 - 0.35, t0 + 0.55, 0.2);
  if (a <= 0) return;
  ctx.save();
  const onda = pr(t, t0, t0 + 0.6);
  if (t >= t0) {
    ctx.globalAlpha = (1 - onda) * 0.9;
    ctx.beginPath();
    ctx.arc(x, y, 26 + onda * 46, 0, Math.PI * 2);
    ctx.lineWidth = 5;
    ctx.strokeStyle = C.accent;
    ctx.stroke();
  }
  const press = t < t0 ? 1 : lerp(0.82, 1, pr(t, t0, t0 + 0.25));
  ctx.globalAlpha = a * 0.92;
  ctx.beginPath();
  ctx.arc(x, y, 24 * press, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = C.accent;
  ctx.stroke();
  ctx.restore();
}

/** Contorno pulsante para destacar uma área da tela */
function realce(g, u, v, uw, vh, t, alpha, cor = C.accent) {
  if (alpha <= 0) return;
  const [x, y] = ponto(g, u, v);
  ctx.save();
  ctx.globalAlpha *= alpha * (0.75 + 0.25 * Math.sin(t * 7));
  rr(x, y, uw * g.sw, vh * g.sh, 14);
  ctx.lineWidth = 5;
  ctx.strokeStyle = cor;
  ctx.stroke();
  ctx.restore();
}

/** Sincronização: pontos viajando em arco de um celular ao outro */
function sincroniza(x1, y1, x2, y2, t, alpha = 1) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  const curva = (p) => [lerp(x1, x2, p), lerp(y1, y2, p) - Math.sin(p * Math.PI) * 60];
  ctx.setLineDash([3, 16]);
  ctx.lineCap = 'round';
  ctx.lineWidth = 7;
  ctx.strokeStyle = 'rgba(23,100,63,0.28)';
  ctx.beginPath();
  for (let p = 0; p <= 1.001; p += 0.05) ctx.lineTo(...curva(p));
  ctx.stroke();
  ctx.setLineDash([]);
  for (let k = 0; k < 4; k++) {
    const p = (t * 1.1 + k / 4) % 1;
    const [x, y] = curva(p);
    ctx.beginPath();
    ctx.arc(x, y, 13 * (1 - Math.abs(p - 0.5)), 0, Math.PI * 2);
    ctx.fillStyle = k % 2 ? C.accent : C.green;
    ctx.fill();
  }
  ctx.restore();
}

/** Selo "ao vivo" com ponto pulsante */
function aoVivo(cx, y, t, alpha) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.font = `800 24px ${FONT}`;
  const str = 'TEMPO REAL';
  const w = ctx.measureText(str).width + 74;
  rr(cx - w / 2, y, w, 50, 25);
  ctx.fillStyle = C.green;
  ctx.fill();
  const pulso = (t * 1.4) % 1;
  ctx.beginPath();
  ctx.arc(cx - w / 2 + 28, y + 25, 8 + pulso * 10, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255,255,255,${0.4 * (1 - pulso)})`;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx - w / 2 + 28, y + 25, 8, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.fillText(str, cx - w / 2 + 50, y + 26);
  ctx.restore();
}

/** Cabeçalho das etapas: número grande + título + subtítulo */
function etapa(n, rotulo, tit, sub, t, { x, y, size, max }) {
  const p = pr(t, 0.05, 0.6, easeBack);
  ctx.save();
  ctx.globalAlpha = clamp(p);
  const s = size * 1.25;
  ctx.translate(x + s / 2, y + s / 2);
  ctx.scale(p, p);
  ctx.translate(-(x + s / 2), -(y + s / 2));
  rr(x, y, s, s, s * 0.3);
  ctx.fillStyle = C.green;
  ctx.fill();
  ctx.font = `800 ${size * 0.62}px ${FONT}`;
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n).padStart(2, '0'), x + s / 2, y + s / 2 + 2);
  ctx.restore();
  sobretitulo(rotulo, x + s + 26, y + s / 2 + 18, t, 0.2);
  const y2 = titulo(tit, x, y + s + size * 1.25, t, 0.25, { size });
  return texto(sub, x, y2 + size * 0.15, t, 0.55, { size: V ? 32 : 34, max, lh: 1.42 });
}

// ---------------------------------------------------------------------------
// Roteiro: 11 cenas, 40 s. Cada draw(t) recebe os segundos desde o início da cena.
// ---------------------------------------------------------------------------
const CENAS = [
  {
    dur: 4.5, // 1. O problema
    escuro: true,
    draw(t) {
      fundoEscuro(t);
      const x = V ? 80 : 170;
      sobretitulo('O PROBLEMA', x, V ? 200 : 270, t, 0.1, { color: C.peach });
      const y = titulo('Lista no *papel*.\nPreços na *memória*.\nE dois mercados\npara comparar.', x, V ? 300 : 380, t, 0.2,
        { size: V ? 84 : 92, color: C.darkText, hl: C.peach, passo: 0.32 });
      texto('As decisões ficavam espalhadas em mensagens soltas.', x, y + (V ? 30 : 26), t, 1.9, { size: V ? 32 : 36, color: C.darkMuted, max: V ? 900 : 900 });
      // objetos "espalhados": papel, etiqueta de preço e mensagem
      const objs = V
        ? [['papel', 260, 900, -8], ['etiqueta', 560, 860, 6], ['chat', 850, 920, -4]]
        : [['papel', 1360, 330, -8], ['etiqueta', 1610, 520, 7], ['chat', 1390, 740, -5]];
      const legendas = { papel: 'Arroz, café, leite…', etiqueta: 'R$ ??', chat: 'Leva ou não leva?' };
      objs.forEach(([ic, cx, cy, rot], i) => {
        const p = pr(t, 0.6 + i * 0.35, 1.3 + i * 0.35, easeBack);
        if (p <= 0) return;
        ctx.save();
        ctx.translate(cx, cy + Math.sin(t * 1.6 + i) * 8);
        ctx.rotate(((rot + (1 - p) * 12) * Math.PI) / 180);
        ctx.scale(p, p);
        ctx.globalAlpha = clamp(p);
        const w = V ? 270 : 330;
        const h = V ? 150 : 170;
        ctx.shadowColor = 'rgba(0,0,0,0.35)';
        ctx.shadowBlur = 40;
        ctx.shadowOffsetY = 16;
        rr(-w / 2, -h / 2, w, h, 26);
        ctx.fillStyle = i === 1 ? C.peach : '#FFFFFF';
        ctx.fill();
        ctx.shadowColor = 'transparent';
        icone(ic, -w / 2 + 52, 0, 46, C.green, { largura: 2.2 });
        ctx.font = `800 ${V ? 26 : 30}px ${FONT}`;
        ctx.fillStyle = C.text;
        ctx.textBaseline = 'middle';
        ctx.fillText(legendas[ic], -w / 2 + 96, 2, w - 116);
        ctx.restore();
      });
    },
  },
  {
    dur: 3.5, // 2. A origem
    escuro: true,
    draw(t) {
      fundoEscuro(t);
      const x = V ? 80 : 170;
      sobretitulo('COMO NASCEU', x, V ? 200 : 300, t, 0.05, { color: C.peach });
      const y = titulo('Uma ida ao mercado\ncom a *minha mãe*.', x, V ? 300 : 410, t, 0.15, { size: V ? 80 : 92, color: C.darkText, hl: C.peach });
      texto('Pesquisar preços, comparar e decidir juntos, cada um de um lugar. Precisava caber num app.', x, y + 26, t, 0.9,
        { size: V ? 32 : 36, color: C.darkMuted, max: V ? 900 : 860 });
      // duas pessoas conectadas
      const [ax, bx, cy] = V ? [300, 780, 1060] : [1310, 1680, 560];
      const pa = pr(t, 0.4, 1.1, easeBack);
      const pb = pr(t, 0.7, 1.4, easeBack);
      sincroniza(ax + 90, cy - 20, bx - 90, cy - 20, t, pr(t, 1.2, 1.6));
      [[ax, 'M', 'Mãe', C.green, pa], [bx, 'G', 'Gustavo', C.accent, pb]].forEach(([px, ini, nome, cor, p]) => {
        if (p <= 0) return;
        ctx.save();
        ctx.globalAlpha = clamp(p);
        ctx.translate(px, cy);
        ctx.scale(p, p);
        ctx.beginPath();
        ctx.arc(0, 0, 82, 0, Math.PI * 2);
        ctx.fillStyle = cor;
        ctx.fill();
        ctx.lineWidth = 6;
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = `800 70px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(ini, 0, 4);
        ctx.font = `700 30px ${FONT}`;
        ctx.fillStyle = C.darkText;
        ctx.fillText(nome, 0, 132);
        ctx.restore();
      });
      const pc = pr(t, 1.5, 2.1, easeBack);
      if (pc > 0) {
        ctx.save();
        ctx.translate((ax + bx) / 2, cy - 130);
        ctx.scale(pc, pc);
        ctx.beginPath();
        ctx.arc(0, 0, 44, 0, Math.PI * 2);
        ctx.fillStyle = C.peach;
        ctx.fill();
        icone('coracao', 0, 2, 44, C.green, { largura: 2.4 });
        ctx.restore();
      }
    },
  },
  {
    dur: 3.5, // 3. Apresenta o Junto
    draw(t) {
      fundoClaro(t);
      const p = pr(t, 0.05, 0.7, easeBack);
      if (V) {
        logo(W / 2, 190, 130 * p, clamp(p));
        titulo('Junto', W / 2, 390, t, 0.25, { size: 130, align: 'center' });
        titulo('A lista de compras que vocês\nfazem *juntos*, em tempo real.', W / 2, 480, t, 0.45, { size: 44, weight: 700, align: 'center', lh: 1.25 });
        celular(W / 2, 1030, 600, [['00-entrar', 0]], t, { entrada: 0.6 });
      } else {
        logo(250, 330, 150 * p, clamp(p));
        titulo('Junto', 170, 580, t, 0.25, { size: 170 });
        titulo('A lista de compras que vocês\nfazem *juntos*, em tempo real.', 170, 690, t, 0.45, { size: 54, weight: 700, lh: 1.22 });
        texto('Android · iOS · Web (PWA)', 170, 860, t, 1.1, { size: 32 });
        celular(1380, 545, 880, [['00-entrar', 0]], t, { entrada: 0.5, deslize: 120 });
      }
    },
  },
  {
    dur: 3.5, // 4. Criar a lista
    draw(t) {
      fundoClaro(t);
      const sub = 'Nome, descrição e data da compra. Pronta em segundos.';
      const telas = [['01-nova-lista', 0], ['02-lista-vazia', 2.0]];
      if (V) {
        etapa(1, 'CRIAR', 'Crie a lista', sub, t, { x: 80, y: 110, size: 72, max: 920 });
        const g = celular(W / 2, 860, 820, telas, t, { entrada: 0.2 });
        toque(ponto(g, 0.5, 0.705), t, 1.7);
      } else {
        etapa(1, 'CRIAR', 'Crie a lista', sub, t, { x: 170, y: 270, size: 84, max: 720 });
        const g = celular(1380, 545, 880, telas, t, { entrada: 0.15, deslize: 120 });
        toque(ponto(g, 0.5, 0.705), t, 1.7);
      }
    },
  },
  {
    dur: 4, // 5. Produtos e preços
    draw(t) {
      fundoClaro(t);
      const sub = 'Quantidade, unidade e preço estimado. O total da compra é calculado na hora.';
      const telas = [['03-adicionar-produto', 0], ['04-lista-com-precos', 2.0]];
      const tags = [['Quantidade', 'carrinho'], ['Preço estimado', 'etiqueta'], ['Categoria automática', 'check']];
      let g;
      if (V) {
        etapa(2, 'ADICIONAR', 'Produtos e preços', sub, t, { x: 80, y: 110, size: 72, max: 920 });
        g = celular(W / 2, 870, 780, telas, t, { entrada: 0.2 });
        pilula('Total estimado: R$ 153,47', W / 2, 1272, { align: 'center', size: 28, bg: C.green, cor: '#fff', borda: null, icon: 'etiqueta', alpha: pr(t, 2.5, 2.9), escala: lerp(0.8, 1, pr(t, 2.5, 2.9, easeBack)) });
      } else {
        const yb = etapa(2, 'ADICIONAR', 'Produtos e preços', sub, t, { x: 170, y: 230, size: 84, max: 720 });
        let x = 170;
        tags.forEach(([tag, ic], i) => {
          const w = pilula(tag, x, yb + 40, { size: 26, bg: C.greenSoft, cor: C.green, borda: null, icon: ic, alpha: pr(t, 0.9 + i * 0.2, 1.3 + i * 0.2) });
          x += w + 14;
        });
        g = celular(1380, 545, 880, telas, t, { entrada: 0.15 });
        pilula('Total estimado na hora', g.x - 30, g.sy + g.sh * 0.21, { align: 'right', size: 28, bg: C.green, cor: '#fff', borda: null, icon: 'etiqueta', alpha: pr(t, 2.5, 2.9), escala: lerp(0.8, 1, pr(t, 2.5, 2.9, easeBack)) });
      }
      toque(ponto(g, 0.5, 0.92), t, 1.7);
      realce(g, 0.03, 0.235, 0.94, 0.075, t, janela(t, 2.4, 4.2));
    },
  },
  {
    dur: 3.5, // 6. Convite: duas pessoas, a mesma lista
    draw(t) {
      fundoClaro(t);
      const tit = 'Convide quem compra *com você*';
      const sub = 'Por QR Code, link ou código, e você aprova quem entra.';
      const mae = [['05-compartilhar', 0], ['07-mae-recebe-pedido', 1.6]];
      let gm;
      if (V) {
        titulo(tit, W / 2, 170, t, 0.1, { size: 60, align: 'center' });
        texto(sub, W / 2, 245, t, 0.4, { size: 32, align: 'center', max: 940 });
        gm = celular(285, 890, 700, mae, t, { rotulo: 'Mãe · em casa', entrada: 0.1 });
        celular(795, 890, 700, [['06-gustavo-pedido-enviado', 0]], t, { rotulo: 'Gustavo', corRotulo: C.accent, entrada: 0.7 });
        sincroniza(690, 700, 390, 700, t, janela(t, 1.0, 2.0));
      } else {
        titulo(tit, W / 2, 140, t, 0.1, { size: 64, align: 'center' });
        texto(sub, W / 2, 205, t, 0.4, { size: 34, align: 'center' });
        gm = celular(700, 660, 700, mae, t, { rotulo: 'Mãe · em casa', entrada: 0.1 });
        celular(1220, 660, 700, [['06-gustavo-pedido-enviado', 0]], t, { rotulo: 'Gustavo', corRotulo: C.accent, entrada: 0.7 });
        sincroniza(1110, 520, 810, 520, t, janela(t, 1.0, 2.0));
      }
      toque(ponto(gm, 0.71, 0.915), t, 2.4);
      aviso('Gustavo entrou na lista', W / 2, V ? 1262 : 985, janela(t, 2.7, 3.6), V ? 26 : 26);
    },
  },
  {
    dur: 5, // 7. Tempo real
    draw(t) {
      fundoClaro(t);
      const tit = 'Um no mercado, outro em casa:\na *mesma lista*, ao mesmo tempo.';
      const gus = [['08-gustavo-modo-mercado', 0], ['09-gustavo-informa-preco', 0.9]];
      const mae = [['04-lista-com-precos', 0], ['10-mae-ve-arroz-comprado', 2.6]];
      let gg;
      let gm;
      if (V) {
        titulo(tit, W / 2, 150, t, 0.1, { size: 52, align: 'center' });
        gg = celular(285, 880, 700, gus, t, { rotulo: 'Gustavo · no mercado', corRotulo: C.accent, entrada: 0.1 });
        gm = celular(795, 880, 700, mae, t, { rotulo: 'Mãe · em casa', entrada: 0.3 });
        sincroniza(390, 690, 690, 690, t, janela(t, 1.9, 3.3));
        aoVivo(W / 2, 330, t, pr(t, 0.6, 1));
      } else {
        titulo(tit, W / 2, 120, t, 0.1, { size: 60, align: 'center' });
        gg = celular(700, 680, 680, gus, t, { rotulo: 'Gustavo · no mercado', corRotulo: C.accent, entrada: 0.1 });
        gm = celular(1220, 680, 680, mae, t, { rotulo: 'Mãe · em casa', entrada: 0.3 });
        sincroniza(810, 560, 1110, 560, t, janela(t, 1.9, 3.3));
        aoVivo(W / 2, 278, t, pr(t, 0.6, 1));
      }
      toque(ponto(gg, 0.5, 0.905), t, 1.7);
      realce(gm, 0.03, 0.15, 0.94, 0.17, t, janela(t, 2.9, 5));
      aviso('Mãe vê na hora: arroz R$ 3,00 abaixo do estimado', W / 2, V ? 1262 : 985, janela(t, 3.0, 4.9), V ? 24 : 26);
    },
  },
  {
    dur: 3.5, // 8. Decidir: comprar ou não
    draw(t) {
      fundoClaro(t);
      const tit = 'Leva ou não leva? *Vocês decidem.*';
      const sub = 'Achou algo fora da lista? Pergunte. Quem está em casa aprova ou recusa.';
      const gus = [['14-gustavo-pergunta', 0], ['16-gustavo-aprovado', 2.0]];
      const mae = [['15-mae-decide', 0], ['17-mae-depois-aprovacao', 1.8]];
      let gm;
      if (V) {
        titulo(tit, W / 2, 170, t, 0.1, { size: 54, align: 'center' });
        texto(sub, W / 2, 245, t, 0.4, { size: 31, align: 'center', max: 940 });
        celular(285, 890, 700, gus, t, { rotulo: 'Gustavo', corRotulo: C.accent, entrada: 0.1 });
        gm = celular(795, 890, 700, mae, t, { rotulo: 'Mãe', entrada: 0.4 });
        sincroniza(390, 700, 690, 700, t, janela(t, 0.5, 1.4));
      } else {
        titulo(tit, W / 2, 140, t, 0.1, { size: 64, align: 'center' });
        texto(sub, W / 2, 205, t, 0.4, { size: 34, align: 'center' });
        celular(700, 660, 700, gus, t, { rotulo: 'Gustavo', corRotulo: C.accent, entrada: 0.1 });
        gm = celular(1220, 660, 700, mae, t, { rotulo: 'Mãe', entrada: 0.4 });
        sincroniza(810, 520, 1110, 520, t, janela(t, 0.5, 1.4));
      }
      toque(ponto(gm, 0.3, 0.62), t, 1.45);
      aviso('Mãe aprovou o azeite', W / 2, V ? 1262 : 985, janela(t, 2.0, 3.5), 26);
    },
  },
  {
    dur: 3.5, // 9. Comparar preços e organizar
    draw(t) {
      fundoClaro(t);
      const tit = 'Compare preços e *economize*';
      const sub = 'Encontrado × estimado, item por item. Mais caro aqui? Combine de comprar no outro mercado.';
      // V: pílulas lado a lado abaixo dos celulares; 16:9: empilhadas à esquerda da lista
      const pills = (x, y, al) => {
        const [x2, y2, al2] = V ? [x + 20, y, 'left'] : [x, y + 76, al];
        pilula('−R$ 3,00 no arroz', V ? x - 20 : x, y, { size: 28, bg: C.greenSoft, cor: C.green, borda: null, icon: 'etiqueta', align: al, alpha: pr(t, 0.9, 1.3), escala: lerp(0.8, 1, pr(t, 0.9, 1.3, easeBack)) });
        pilula('+R$ 3,60 no café', x2, y2, { size: 28, bg: C.dangerSoft, cor: C.danger, borda: null, icon: 'etiqueta', align: al2, alpha: pr(t, 1.3, 1.7), escala: lerp(0.8, 1, pr(t, 1.3, 1.7, easeBack)) });
      };
      let g;
      if (V) {
        titulo(tit, W / 2, 170, t, 0.1, { size: 58, align: 'center' });
        texto(sub, W / 2, 245, t, 0.4, { size: 31, align: 'center', max: 940 });
        g = celular(285, 870, 690, [['11-mae-ve-cafe-mais-caro', 0]], t, { rotulo: 'Lista', entrada: 0.1 });
        celular(795, 870, 690, [['12-conversa-mae', 0]], t, { rotulo: 'Conversa', corRotulo: C.accent, entrada: 0.4 });
        pills(W / 2, 1255, 'right');
      } else {
        titulo(tit, W / 2, 140, t, 0.1, { size: 64, align: 'center' });
        texto(sub, W / 2, 205, t, 0.4, { size: 34, align: 'center' });
        g = celular(830, 660, 700, [['11-mae-ve-cafe-mais-caro', 0]], t, { rotulo: 'Lista', entrada: 0.1 });
        celular(1350, 660, 700, [['12-conversa-mae', 0]], t, { rotulo: 'Conversa', corRotulo: C.accent, entrada: 0.4 });
        pills(g.x - 40, 560, 'right');
      }
      realce(g, 0.02, 0.81, 0.96, 0.09, t, janela(t, 0.9, 3.5), C.green);
      realce(g, 0.02, 0.72, 0.96, 0.09, t, janela(t, 1.3, 3.5), C.danger);
    },
  },
  {
    dur: 2.5, // 10. Diferenciais
    draw(t) {
      fundoClaro(t);
      titulo('Feito para comprar *a dois*', W / 2, V ? 200 : 170, t, 0.05, { size: V ? 60 : 68, align: 'center' });
      const f = [
        ['raio', 'Tempo real'], ['etiqueta', 'Estimado × encontrado'], ['check', 'Aprovar ou recusar'], ['chat', 'Chat com fotos'],
        ['qr', 'Convite por QR Code'], ['carrinho', 'Modo mercado'], ['offline', 'Funciona offline'], ['aparelhos', 'Celular e computador'],
      ];
      const cols = V ? 2 : 4;
      const cw = V ? 440 : 360;
      const ch = V ? 210 : 270;
      const gap = 32;
      const x0 = (W - (cols * cw + (cols - 1) * gap)) / 2;
      const y0 = V ? 280 : 260;
      f.forEach(([ic, nome], i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const p = pr(t, 0.15 + i * 0.08, 0.6 + i * 0.08, easeBack);
        if (p <= 0) return;
        const x = x0 + col * (cw + gap);
        const y = y0 + row * (ch + gap);
        ctx.save();
        ctx.globalAlpha = clamp(p);
        ctx.translate(x + cw / 2, y + ch / 2);
        ctx.scale(lerp(0.85, 1, p), lerp(0.85, 1, p));
        ctx.translate(-(x + cw / 2), -(y + ch / 2));
        ctx.shadowColor = 'rgba(22,24,29,0.08)';
        ctx.shadowBlur = 30;
        ctx.shadowOffsetY = 10;
        rr(x, y, cw, ch, 30);
        ctx.fillStyle = C.surface;
        ctx.fill();
        ctx.shadowColor = 'transparent';
        const iy = y + ch * (V ? 0.36 : 0.38);
        ctx.beginPath();
        ctx.arc(x + cw / 2, iy, 46, 0, Math.PI * 2);
        ctx.fillStyle = i % 2 ? C.accentSoft : C.greenSoft;
        ctx.fill();
        icone(ic, x + cw / 2, iy, 46, i % 2 ? '#B85A1C' : C.green, { largura: 2.2 });
        ctx.font = `800 ${V ? 32 : 30}px ${FONT}`;
        ctx.fillStyle = C.text;
        ctx.textAlign = 'center';
        ctx.fillText(nome, x + cw / 2, y + ch * (V ? 0.8 : 0.78), cw - 30);
        ctx.restore();
      });
    },
  },
  {
    dur: 3, // 11. Encerramento
    escuro: true,
    draw(t) {
      fundoEscuro(t);
      const cx = W / 2;
      const p = pr(t, 0.05, 0.6, easeBack);
      logo(cx, V ? 230 : 160, 120 * p, clamp(p));
      titulo('Junto', cx, V ? 430 : 350, t, 0.15, { size: V ? 130 : 130, align: 'center', color: C.darkText });
      titulo('De uma necessidade do dia a dia\na uma *solução tecnológica*.', cx, V ? 530 : 440, t, 0.3, { size: V ? 46 : 50, weight: 700, align: 'center', color: C.darkText, hl: C.peach, lh: 1.25 });
      const stack = ['React Native + Expo', 'TypeScript', 'Supabase Realtime', 'PostgreSQL + RLS', 'PWA', 'Testes automatizados'];
      ctx.font = `700 24px ${FONT}`;
      const larg = stack.map((s) => ctx.measureText(s).width + 24 * 1.4 + 12);
      const linhas = V ? [[0, 1, 2], [3, 4, 5]] : [[0, 1, 2, 3, 4, 5]];
      linhas.forEach((ln, r) => {
        let x = cx - (ln.reduce((a, i) => a + larg[i], 0) - 12) / 2;
        ln.forEach((i) => {
          pilula(stack[i], x, (V ? 700 : 600) + r * 64, { size: 24, bg: 'rgba(255,255,255,0.08)', cor: C.darkText, borda: 'rgba(255,255,255,0.18)', alpha: pr(t, 0.6 + i * 0.07, 1 + i * 0.07) });
          x += larg[i];
        });
      });
      pilula('junto.gusttavo-ssantos.workers.dev', cx, V ? 900 : 730, { size: V ? 32 : 34, align: 'center', bg: C.green, cor: '#fff', borda: 'rgba(255,255,255,0.25)', alpha: pr(t, 1.1, 1.5) });
      pilula('github.com/Guhssantos/junto', cx, V ? 1010 : 840, { size: V ? 32 : 34, align: 'center', bg: '#fff', cor: C.text, borda: null, alpha: pr(t, 1.3, 1.7) });
      texto('Código aberto · uso gratuito', cx, V ? 1170 : 980, t, 1.6, { size: 28, color: C.darkMuted, align: 'center' });
    },
  },
];

let acc = 0;
for (const c of CENAS) { c.inicio = acc; acc += c.dur; }
const DURACAO = acc;
const TRANS = 0.5;

function quadro(tg) {
  ctx = ctxPalco;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  let i = CENAS.findIndex((c) => tg >= c.inicio && tg < c.inicio + c.dur);
  if (i === -1) i = CENAS.length - 1;
  const cena = CENAS[i];
  cena.draw(tg - cena.inicio);
  const prox = CENAS[i + 1];
  const resta = cena.inicio + cena.dur - tg;
  if (prox && resta < TRANS) {
    ctx = ctxBastidor;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    prox.draw(tg - prox.inicio);
    ctx = ctxPalco;
    const p = easeInOut(1 - resta / TRANS);
    ctx.save();
    if (!!prox.escuro !== !!cena.escuro) {
      // claro ↔ escuro: revelação circular a partir do centro
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, p * Math.hypot(W, H) * 0.52, 0, Math.PI * 2);
      ctx.clip();
    } else {
      ctx.globalAlpha = p;
    }
    ctx.drawImage(bastidor, 0, 0);
    ctx.restore();
  }
  // barra de progresso
  ctx.globalAlpha = 1;
  const escuro = (prox && resta < TRANS / 2 ? prox : cena).escuro;
  ctx.fillStyle = escuro ? 'rgba(255,255,255,0.12)' : 'rgba(23,100,63,0.15)';
  ctx.fillRect(0, H - 8, W, 8);
  ctx.fillStyle = escuro ? C.peach : C.green;
  ctx.fillRect(0, H - 8, W * Math.min(1, tg / DURACAO), 8);
}

window.renderAt = (s) => quadro(s);
window.DURACAO = () => DURACAO;

carregar()
  .then(() => {
    status.textContent = `pronto · ${DURACAO.toFixed(1)} s · ${W}×${H}`;
    quadro(Number(params.get('t') || 0));
    window.__carregado = true;
  })
  .catch((e) => {
    status.textContent = `erro: ${e.message}`;
    window.__erro = e.message;
  });

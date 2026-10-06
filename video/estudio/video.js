// Vídeo de apresentação do Junto — desenhado quadro a quadro num <canvas> e codificado
// em MP4 (H.264) pelo próprio navegador (WebCodecs + mp4-muxer). Sem áudio: textos na tela.
// Prévia: /?t=12.5 (um quadro)  ·  Gravar: /?gravar=1  ·  Vertical (4:5): &formato=vertical
const params = new URLSearchParams(location.search);
const VERTICAL = params.get('formato') === 'vertical';
const W = VERTICAL ? 1080 : 1920;
const H = VERTICAL ? 1350 : 1080;
const FPS = 30;

const C = {
  bg: '#F6F5F1', surface: '#FFFFFF', text: '#16181D', muted: '#5B6070', line: '#E7E5DF',
  green: '#17643F', greenSoft: '#D6EDE0', accent: '#F28C45', accentSoft: '#FDE7D3', peach: '#FCD9BD', danger: '#B42318',
};
const FONT = 'Manrope, "Segoe UI Emoji", "Apple Color Emoji", sans-serif';

const canvas = document.getElementById('palco');
canvas.width = W;
canvas.height = H;
const ctx = canvas.getContext('2d');
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
    i.src = `/capturas/${n}.jpg`;
  })));
}

// ---------------------------------------------------------------------------
// Utilidades de animação
// ---------------------------------------------------------------------------
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, p) => a + (b - a) * p;
const easeOut = (p) => 1 - Math.pow(1 - p, 3);
const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
/** progresso 0→1 entre a e b (segundos locais da cena), com suavização */
const pr = (t, a, b, ease = easeOut) => ease(clamp((t - a) / (b - a)));

function rr(x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function texto(str, x, y, { size = 40, weight = 700, color = C.text, align = 'left', alpha = 1, max = 0, lh = 1.2, baseline = 'alphabetic' } = {}) {
  if (alpha <= 0) return y;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  const linhas = [];
  for (const par of String(str).split('\n')) {
    if (!max) { linhas.push(par); continue; }
    let atual = '';
    for (const palavra of par.split(' ')) {
      const tent = atual ? `${atual} ${palavra}` : palavra;
      if (ctx.measureText(tent).width > max && atual) { linhas.push(atual); atual = palavra; } else atual = tent;
    }
    linhas.push(atual);
  }
  linhas.forEach((l, i) => ctx.fillText(l, x, y + i * size * lh));
  ctx.restore();
  return y + linhas.length * size * lh;
}

/** Texto que entra subindo e aparecendo */
function entra(str, x, y, t, inicio, opts = {}) {
  const p = pr(t, inicio, inicio + 0.6);
  return texto(str, x, y + (1 - p) * 30, { ...opts, alpha: p * (opts.alpha ?? 1) });
}

function fundo(t) {
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  // manchas suaves de cor, em movimento lento
  const blob = (x, y, r, cor) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, cor);
    g.addColorStop(1, 'rgba(246,245,241,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  };
  blob(W * 0.15 + Math.sin(t * 0.3) * 40, H * 0.2, 520, 'rgba(214,237,224,0.85)');
  blob(W * 0.9 + Math.cos(t * 0.25) * 40, H * 0.85, 560, 'rgba(253,231,211,0.8)');
}

function logo(cx, cy, s, alpha = 1) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  rr(cx - s / 2, cy - s / 2, s, s, s * 0.31);
  ctx.fillStyle = C.green;
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

/** Celular com uma (ou duas, em transição) telas reais do app */
function celular(cx, cy, h, telaA, { telaB = null, mix = 0, alpha = 1, escala = 1, rotulo = '', corRotulo = C.green, scroll = 0 } = {}) {
  if (alpha <= 0) return;
  const hh = h * escala;
  const ww = hh * (375 / 812) + hh * 0.05;
  const x = cx - ww / 2;
  const y = cy - hh / 2;
  const borda = hh * 0.022;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.shadowColor = 'rgba(22,24,29,0.28)';
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 24;
  rr(x, y, ww, hh, hh * 0.075);
  ctx.fillStyle = '#16181D';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  const sx = x + borda;
  const sy = y + borda;
  const sw = ww - borda * 2;
  const sh = hh - borda * 2;
  ctx.save();
  rr(sx, sy, sw, sh, hh * 0.06);
  ctx.clip();
  const desenha = (im, a) => {
    if (!im || a <= 0) return;
    ctx.globalAlpha = alpha * a;
    const ih = sw * (im.height / im.width);
    ctx.drawImage(im, sx, sy - scroll * Math.max(0, ih - sh), sw, ih);
  };
  ctx.fillStyle = C.bg;
  ctx.fillRect(sx, sy, sw, sh);
  desenha(img[telaA], 1);
  if (telaB) desenha(img[telaB], mix);
  ctx.restore();
  ctx.globalAlpha = alpha;
  if (rotulo) {
    ctx.font = `800 ${Math.round(hh * 0.032)}px ${FONT}`;
    const tw = ctx.measureText(rotulo).width + hh * 0.05;
    const th = hh * 0.055;
    rr(cx - tw / 2, y - th - hh * 0.03, tw, th, th / 2);
    ctx.fillStyle = corRotulo;
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(rotulo, cx, y - th / 2 - hh * 0.03 + 1);
  }
  ctx.restore();
  return { x, y, w: ww, h: hh };
}

function pilula(str, x, y, { size = 30, fundo: bgc = C.surface, cor = C.text, alpha = 1, borda = C.line, align = 'left' } = {}) {
  if (alpha <= 0) return 0;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.font = `700 ${size}px ${FONT}`;
  const w = ctx.measureText(str).width + size * 1.4;
  const h = size * 2;
  const x0 = align === 'center' ? x - w / 2 : x;
  rr(x0, y, w, h, h / 2);
  ctx.fillStyle = bgc;
  ctx.fill();
  if (borda) { ctx.lineWidth = 2; ctx.strokeStyle = borda; ctx.stroke(); }
  ctx.fillStyle = cor;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(str, x0 + w / 2, y + h / 2 + 1);
  ctx.restore();
  return w;
}

function cartao(x, y, w, h, { alpha = 1, fundo: bgc = C.surface } = {}) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.shadowColor = 'rgba(22,24,29,0.10)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 10;
  rr(x, y, w, h, 28);
  ctx.fillStyle = bgc;
  ctx.fill();
  ctx.restore();
}

/** Aviso estilo notificação, como os do app (aceita 
; largura automática) */
function aviso(str, cx, y, w, alpha, size = 26) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.font = `700 ${size}px ${FONT}`;
  const linhas = String(str).split('\n');
  const largura = w || Math.max(...linhas.map((l) => ctx.measureText(l).width)) + size * 1.6;
  const h = size * 1.3 * linhas.length + size * 1.4;
  rr(cx - largura / 2, y, largura, h, 18);
  ctx.fillStyle = C.text;
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 24;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#FFFFFF';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  linhas.forEach((l, i) => ctx.fillText(l, cx, y + size * 0.7 + size * 1.3 * (i + 0.5) + 1));
  ctx.restore();
}

/** Pulso de sincronização: pontos viajando de um celular ao outro */
function sincroniza(x1, y1, x2, y2, t, alpha = 1) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.setLineDash([2, 18]);
  ctx.lineCap = 'round';
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(23,100,63,0.25)';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);
  for (let k = 0; k < 3; k++) {
    const p = ((t * 0.9 + k / 3) % 1);
    const x = lerp(x1, x2, p);
    const y = lerp(y1, y2, p) - Math.sin(p * Math.PI) * 30;
    ctx.beginPath();
    ctx.arc(x, y, 12 * (1 - Math.abs(p - 0.5)), 0, Math.PI * 2);
    ctx.fillStyle = C.green;
    ctx.fill();
  }
  ctx.restore();
}

/** Destaque circular sobre um ponto da tela de um celular */
function destaque(x, y, r, t, alpha = 1) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha * (0.6 + 0.4 * Math.sin(t * 6));
  ctx.lineWidth = 6;
  ctx.strokeStyle = C.accent;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function passo(n, titulo, sub, t, { x = 160, y = 330, max = 760 } = {}) {
  const p = pr(t, 0.1, 0.6);
  ctx.save();
  ctx.globalAlpha = p;
  rr(x, y - 70 + (1 - p) * 20, 96, 96, 30);
  ctx.fillStyle = C.green;
  ctx.fill();
  texto(String(n), x + 48, y - 2 + (1 - p) * 20, { size: 54, weight: 800, color: '#fff', align: 'center' });
  ctx.restore();
  const y2 = entra(titulo, x, y + 110, t, 0.25, { size: VERTICAL ? 60 : 66, weight: 800, max, lh: 1.12 });
  entra(sub, x, y2 + 20, t, 0.5, { size: VERTICAL ? 32 : 34, weight: 600, color: C.muted, max, lh: 1.35 });
}

// ---------------------------------------------------------------------------
// Roteiro (cenas). Cada cena desenha a tela inteira em t = segundos desde o início dela.
// ---------------------------------------------------------------------------
const V = VERTICAL;
const CENAS = [
  {
    dur: 6, // Gancho
    draw(t) {
      fundo(t);
      const cx = W / 2;
      ['🛒', '🏪', '🏪'].forEach((e, i) => {
        const p = pr(t, 0.2 + i * 0.25, 0.8 + i * 0.25);
        texto(e, cx + (i - 1) * 190, (V ? 330 : 300) + (1 - p) * 40, { size: 120, align: 'center', alpha: p, weight: 400 });
      });
      const y = entra('Quantas vezes você já foi a\ndois mercados só para\ncomparar preços?', cx, V ? 560 : 520, t, 0.9, { size: V ? 72 : 84, weight: 800, align: 'center', lh: 1.15 });
      entra('Na correria, a lista está no papel e os preços, na memória.', cx, y + 30, t, 2.2, { size: V ? 34 : 38, weight: 600, color: C.muted, align: 'center', max: V ? 900 : 1400 });
    },
  },
  {
    dur: 7, // Origem
    draw(t) {
      fundo(t);
      const x = V ? 100 : 180;
      entra('A IDEIA', x, V ? 260 : 300, t, 0.1, { size: 30, weight: 800, color: C.green });
      const y = entra('Nasceu numa ida ao\nsupermercado com\na minha mãe.', x, V ? 350 : 390, t, 0.3, { size: V ? 76 : 88, weight: 800, lh: 1.1 });
      entra('A gente pesquisava preço, comparava de cabeça e acabava indo a dois ou mais mercados para decidir onde cada produto valia mais a pena.', x, y + 40, t, 1.4, { size: V ? 34 : 38, weight: 600, color: C.muted, max: V ? 880 : 1100, lh: 1.4 });
      if (!V) {
        const p = pr(t, 0.8, 1.6);
        cartao(1420, 300, 330, 420, { alpha: p });
        texto('👩‍🦳', 1585, 470, { size: 130, align: 'center', alpha: p, weight: 400 });
        texto('🧑', 1585, 640, { size: 130, align: 'center', alpha: pr(t, 1.2, 2), weight: 400 });
        texto('❤', 1700, 360, { size: 50, align: 'center', color: C.accent, alpha: pr(t, 1.8, 2.4), weight: 400 });
      }
    },
  },
  {
    dur: 6.5, // Problema
    draw(t) {
      fundo(t);
      const cx = W / 2;
      entra('O problema', cx, V ? 230 : 230, t, 0.1, { size: V ? 64 : 72, weight: 800, align: 'center' });
      const itens = [
        ['📝', 'Lista no papel', 'ninguém sabe o que já foi comprado'],
        ['💭', 'Preços na memória', '"esse estava mais barato no outro?"'],
        ['💬', 'Decisões soltas', 'mensagens, ligações, "leva ou não leva?"'],
      ];
      itens.forEach(([e, tit, sub], i) => {
        const p = pr(t, 0.6 + i * 0.45, 1.2 + i * 0.45);
        if (V) {
          const y = 330 + i * 300;
          cartao(90, y + (1 - p) * 30, 900, 250, { alpha: p });
          texto(e, 190, y + 160 + (1 - p) * 30, { size: 90, align: 'center', alpha: p, weight: 400 });
          texto(tit, 290, y + 110 + (1 - p) * 30, { size: 44, weight: 800, alpha: p });
          texto(sub, 290, y + 165 + (1 - p) * 30, { size: 30, weight: 600, color: C.muted, alpha: p, max: 650 });
        } else {
          const x = 210 + i * 520;
          cartao(x, 340 + (1 - p) * 30, 460, 420, { alpha: p });
          texto(e, x + 230, 500 + (1 - p) * 30, { size: 110, align: 'center', alpha: p, weight: 400 });
          texto(tit, x + 230, 600 + (1 - p) * 30, { size: 44, weight: 800, align: 'center', alpha: p });
          texto(sub, x + 230, 660 + (1 - p) * 30, { size: 28, weight: 600, color: C.muted, align: 'center', alpha: p, max: 380 });
        }
      });
      entra('E muitas idas a mais ao mercado.', cx, V ? 1270 : 900, t, 2.6, { size: 40, weight: 700, color: C.accent, align: 'center' });
    },
  },
  {
    dur: 5.5, // Apresenta o Junto
    draw(t) {
      fundo(t);
      const p = pr(t, 0.1, 0.9);
      if (V) {
        logo(W / 2, 260, 150 * (0.8 + 0.2 * p), p);
        entra('Junto', W / 2, 450, t, 0.4, { size: 120, weight: 800, align: 'center' });
        entra('Faça as compras junto,\nem tempo real.', W / 2, 560, t, 0.8, { size: 52, weight: 700, color: C.green, align: 'center', lh: 1.2 });
        celular(W / 2, 1000, 560, '00-entrar', { alpha: pr(t, 1.2, 2) });
      } else {
        logo(380, 330, 170 * (0.8 + 0.2 * p), p);
        entra('Junto', 180, 560, t, 0.4, { size: 150, weight: 800 });
        entra('Faça as compras junto,\nem tempo real.', 180, 680, t, 0.8, { size: 60, weight: 700, color: C.green, lh: 1.2 });
        entra('Lista compartilhada · preços · conversa · decisões a dois', 180, 860, t, 1.4, { size: 32, weight: 600, color: C.muted });
        celular(1400, 560, 900, '00-entrar', { alpha: pr(t, 1, 1.8), escala: lerp(0.94, 1, pr(t, 1, 2)) });
      }
    },
  },
  {
    dur: 6.5, // 1. Criar lista
    draw(t) {
      fundo(t);
      const mix = pr(t, 3.4, 4.2, easeInOut);
      if (V) {
        passo(1, 'Crie a lista', 'Nome, descrição e data da compra. Pronto.', t, { x: 90, y: 200, max: 900 });
        celular(W / 2, 900, 700, '01-nova-lista', { telaB: '02-lista-vazia', mix, alpha: pr(t, 0.3, 1) });
      } else {
        passo(1, 'Crie a lista', 'Nome, descrição e a data da compra. Em segundos a lista está pronta para receber os produtos.', t);
        celular(1400, 560, 900, '01-nova-lista', { telaB: '02-lista-vazia', mix, alpha: pr(t, 0.3, 1) });
      }
    },
  },
  {
    dur: 7, // 2. Adicionar produtos e preços
    draw(t) {
      fundo(t);
      const mix = pr(t, 3.8, 4.6, easeInOut);
      const tags = ['Quantidade', 'Preço estimado', 'Unidade (opcional)', 'Categoria automática'];
      if (V) {
        passo(2, 'Adicione produtos e preços', 'O total estimado da compra é calculado na hora.', t, { x: 90, y: 200, max: 900 });
        celular(W / 2, 930, 660, '03-adicionar-produto', { telaB: '04-lista-com-precos', mix, alpha: pr(t, 0.3, 1) });
      } else {
        passo(2, 'Adicione produtos e preços', 'Informe o preço estimado de cada item. O app soma tudo e mostra quanto a compra deve custar.', t);
        let x = 160;
        let y = 760;
        tags.forEach((tag, i) => {
          const w = pilula(tag, x, y, { size: 26, alpha: pr(t, 1.2 + i * 0.25, 1.7 + i * 0.25), fundo: C.greenSoft, borda: null });
          x += w + 16;
          if (i === 1) { x = 160; y += 76; }
        });
        celular(1400, 560, 900, '03-adicionar-produto', { telaB: '04-lista-com-precos', mix, alpha: pr(t, 0.3, 1) });
      }
    },
  },
  {
    dur: 8, // 3. Convite
    draw(t) {
      fundo(t);
      const a1 = pr(t, 0.3, 1);
      const a2 = pr(t, 2.2, 2.9);
      const mix = pr(t, 4.4, 5.2, easeInOut);
      if (V) {
        passo(3, 'Convide quem vai comprar com você', 'QR Code, link ou código — e você aprova a entrada.', t, { x: 90, y: 200, max: 900 });
        celular(300, 940, 600, '05-compartilhar', { telaB: '07-mae-recebe-pedido', mix, alpha: a1, rotulo: 'Mãe' });
        celular(780, 940, 600, '06-gustavo-pedido-enviado', { alpha: a2, rotulo: 'Gustavo', corRotulo: C.accent });
        sincroniza(500, 940, 580, 940, t, a2 * (1 - pr(t, 6, 6.5)));
      } else {
        passo(3, 'Convide quem vai comprar com você', 'Por QR Code, link ou código. Por segurança, a entrada só acontece com a sua aprovação.', t, { max: 640 });
        celular(1060, 580, 820, '05-compartilhar', { telaB: '07-mae-recebe-pedido', mix, alpha: a1, rotulo: 'Mãe' });
        celular(1560, 580, 820, '06-gustavo-pedido-enviado', { alpha: a2, rotulo: 'Gustavo', corRotulo: C.accent });
        sincroniza(1460, 640, 1180, 640, t, a2 * (1 - pr(t, 6, 6.5)));
      }
    },
  },
  {
    dur: 10, // 4. Tempo real
    draw(t) {
      fundo(t);
      const gMix = pr(t, 2.2, 2.9, easeInOut); // mercado → informa preço
      const mMix = pr(t, 4.8, 5.4, easeInOut); // mãe recebe a atualização
      const titulo = 'Em tempo real, os dois veem tudo';
      if (V) {
        entra(titulo, W / 2, 160, t, 0.1, { size: 58, weight: 800, align: 'center', max: 950 });
        entra('Gustavo informa o preço no mercado → a Mãe vê na hora, em casa.', W / 2, 300, t, 0.5, { size: 32, weight: 600, color: C.muted, align: 'center', max: 950 });
        const g = { a: '08-gustavo-modo-mercado', b: '09-gustavo-informa-preco', m: gMix }; // mantém a confirmação do preço na tela
        celular(290, 860, 640, g.a, { telaB: g.b, mix: g.m, rotulo: 'Gustavo · no mercado', corRotulo: C.accent, alpha: pr(t, 0.2, 0.9) });
        celular(790, 860, 640, '04-lista-com-precos', { telaB: '10-mae-ve-arroz-comprado', mix: mMix, rotulo: 'Mãe · em casa', alpha: pr(t, 0.4, 1.1) });
        sincroniza(470, 700, 610, 700, t, pr(t, 4, 4.5) * (1 - pr(t, 7.5, 8)));
        aviso('✓ Arroz no carrinho · R$ 3,00 abaixo do estimado', W / 2, 1200, 0, pr(t, 5.4, 5.9) * (1 - pr(t, 9.2, 9.7)));
      } else {
        entra(titulo, W / 2, 150, t, 0.1, { size: 64, weight: 800, align: 'center' });
        entra('Gustavo informa o preço no mercado → a Mãe vê na hora, de onde estiver.', W / 2, 220, t, 0.5, { size: 34, weight: 600, color: C.muted, align: 'center' });
        const g = { a: '08-gustavo-modo-mercado', b: '09-gustavo-informa-preco', m: gMix }; // mantém a confirmação do preço na tela
        celular(640, 665, 680, g.a, { telaB: g.b, mix: g.m, rotulo: 'Gustavo · no mercado', corRotulo: C.accent, alpha: pr(t, 0.2, 0.9) });
        celular(1280, 665, 680, '04-lista-com-precos', { telaB: '10-mae-ve-arroz-comprado', mix: mMix, rotulo: 'Mãe · em casa', alpha: pr(t, 0.4, 1.1) });
        sincroniza(830, 470, 1090, 470, t, pr(t, 4, 4.5) * (1 - pr(t, 7.5, 8)));
        aviso('✓ Arroz no carrinho\nR$ 3,00 abaixo\ndo estimado', 960, 560, 0, pr(t, 5.4, 5.9) * (1 - pr(t, 9.2, 9.7)), 24);
      }
    },
  },
  {
    dur: 7, // 5. Comparar preços
    draw(t) {
      fundo(t);
      if (V) {
        passo(4, 'Compare preços na hora', 'Preço encontrado × estimado, item por item, e o total atualizado.', t, { x: 90, y: 200, max: 900 });
        const ph = celular(W / 2, 930, 660, '11-mae-ve-cafe-mais-caro', { alpha: pr(t, 0.3, 1) });
        pilula('+R$ 3,60 no café', 90, 1250, { size: 30, fundo: '#FDECEA', cor: C.danger, borda: null, alpha: pr(t, 2, 2.5) });
        pilula('−R$ 3,00 no arroz', 600, 1250, { size: 30, fundo: C.greenSoft, cor: C.green, borda: null, alpha: pr(t, 2.6, 3.1) });
        if (ph) destaque(ph.x + ph.w * 0.62, ph.y + ph.h * 0.725, 70, t, pr(t, 2, 2.5));
      } else {
        passo(4, 'Compare preços na hora', 'O app mostra, item por item, quanto o preço encontrado ficou acima ou abaixo do estimado — e o total atualizado da compra.', t, { max: 700 });
        const ph = celular(1400, 560, 900, '11-mae-ve-cafe-mais-caro', { alpha: pr(t, 0.3, 1) });
        pilula('+R$ 3,60 no café — mais caro aqui', 160, 820, { size: 28, fundo: '#FDECEA', cor: C.danger, borda: null, alpha: pr(t, 2, 2.5) });
        pilula('−R$ 3,00 no arroz — mais barato aqui', 160, 905, { size: 28, fundo: C.greenSoft, cor: C.green, borda: null, alpha: pr(t, 2.6, 3.1) });
        if (ph) {
          destaque(ph.x + ph.w * 0.5, ph.y + ph.h * 0.725, 80, t, pr(t, 2, 2.5) * (1 - pr(t, 4.5, 5)));
          destaque(ph.x + ph.w * 0.5, ph.y + ph.h * 0.835, 80, t, pr(t, 4.5, 5));
        }
      }
    },
  },
  {
    dur: 6.5, // 6. Conversa
    draw(t) {
      fundo(t);
      const titulo = 'Conversem e decidam juntos';
      const sub = 'Comprar aqui ou no outro mercado? A conversa fica junto da lista — com fotos, se precisar.';
      if (V) {
        entra(titulo, W / 2, 170, t, 0.1, { size: 60, weight: 800, align: 'center' });
        entra(sub, W / 2, 260, t, 0.4, { size: 32, weight: 600, color: C.muted, align: 'center', max: 950 });
        celular(290, 880, 660, '13-conversa-gustavo', { rotulo: 'Gustavo', corRotulo: C.accent, alpha: pr(t, 0.3, 1) });
        celular(790, 880, 660, '12-conversa-mae', { rotulo: 'Mãe', alpha: pr(t, 0.5, 1.2) });
      } else {
        entra(titulo, W / 2, 150, t, 0.1, { size: 64, weight: 800, align: 'center' });
        entra(sub, W / 2, 220, t, 0.4, { size: 34, weight: 600, color: C.muted, align: 'center' });
        celular(640, 665, 680, '13-conversa-gustavo', { rotulo: 'Gustavo', corRotulo: C.accent, alpha: pr(t, 0.3, 1) });
        celular(1280, 665, 680, '12-conversa-mae', { rotulo: 'Mãe', alpha: pr(t, 0.5, 1.2) });
      }
    },
  },
  {
    dur: 9, // 7. Decidir: comprar ou não
    draw(t) {
      fundo(t);
      const titulo = 'Achou uma promoção? Pergunte antes.';
      const sub = 'Quem está em casa aprova ou recusa — e o item entra (ou não) na compra.';
      const gMix = pr(t, 4.6, 5.3, easeInOut);
      const mMix = pr(t, 6.2, 6.9, easeInOut);
      if (V) {
        entra(titulo, W / 2, 170, t, 0.1, { size: 50, weight: 800, align: 'center', max: 1020 });
        entra(sub, W / 2, 260, t, 0.4, { size: 32, weight: 600, color: C.muted, align: 'center', max: 950 });
        celular(290, 880, 660, '14-gustavo-pergunta', { telaB: '16-gustavo-aprovado', mix: gMix, rotulo: 'Gustavo', corRotulo: C.accent, alpha: pr(t, 0.3, 1) });
        celular(790, 880, 660, '15-mae-decide', { telaB: '17-mae-depois-aprovacao', mix: mMix, rotulo: 'Mãe', alpha: pr(t, 1.6, 2.3) });
        sincroniza(470, 760, 610, 760, t, pr(t, 1.6, 2) * (1 - pr(t, 3.6, 4)));
        aviso('✓ Mãe aprovou o azeite', W / 2, 1210, 0, pr(t, 4.4, 4.9) * (1 - pr(t, 8.2, 8.7)));
      } else {
        entra(titulo, W / 2, 150, t, 0.1, { size: 64, weight: 800, align: 'center' });
        entra(sub, W / 2, 220, t, 0.4, { size: 34, weight: 600, color: C.muted, align: 'center' });
        const g = celular(640, 665, 680, '14-gustavo-pergunta', { telaB: '16-gustavo-aprovado', mix: gMix, rotulo: 'Gustavo', corRotulo: C.accent, alpha: pr(t, 0.3, 1) });
        const m = celular(1280, 665, 680, '15-mae-decide', { telaB: '17-mae-depois-aprovacao', mix: mMix, rotulo: 'Mãe', alpha: pr(t, 1.6, 2.3) });
        sincroniza(830, 470, 1090, 470, t, pr(t, 1.6, 2) * (1 - pr(t, 3.6, 4)));
        if (m) destaque(m.x + m.w * 0.3, m.y + m.h * 0.59, 60, t, pr(t, 2.6, 3) * (1 - pr(t, 4.2, 4.5)));
        if (g) aviso('✓ Mãe aprovou\no azeite', 960, 580, 0, pr(t, 4.6, 5.1) * (1 - pr(t, 8.2, 8.7)), 26);
      }
    },
  },
  {
    dur: 7, // Funcionalidades
    draw(t) {
      fundo(t);
      entra('Tudo o que a compra a dois precisa', W / 2, V ? 170 : 170, t, 0.1, { size: V ? 54 : 64, weight: 800, align: 'center', max: V ? 1000 : 1700 });
      const f = [
        ['⚡', 'Tempo real'], ['💰', 'Estimado × encontrado'], ['🙋', 'Perguntar ao parceiro'], ['💬', 'Chat com fotos'],
        ['📲', 'Convite por QR Code'], ['🧺', 'Modo mercado'], ['📴', 'Funciona offline'], ['📱', 'Celular e computador'],
      ];
      const cols = V ? 2 : 4;
      const cw = V ? 440 : 380;
      const ch = V ? 230 : 250;
      const gx = V ? 40 : 40;
      const x0 = (W - (cols * cw + (cols - 1) * gx)) / 2;
      const y0 = V ? 260 : 260;
      f.forEach(([e, tt], i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const p = pr(t, 0.4 + i * 0.18, 0.9 + i * 0.18);
        const x = x0 + col * (cw + gx);
        const y = y0 + row * (ch + 30) + (1 - p) * 30;
        cartao(x, y, cw, ch, { alpha: p });
        texto(e, x + cw / 2, y + 115, { size: 80, align: 'center', alpha: p, weight: 400 });
        texto(tt, x + cw / 2, y + 190, { size: 32, weight: 800, align: 'center', alpha: p, max: cw - 40 });
      });
    },
  },
  {
    dur: 6, // Tecnologia
    draw(t) {
      fundo(t);
      const cx = W / 2;
      entra('De uma necessidade real\na uma solução tecnológica', cx, V ? 240 : 230, t, 0.1, { size: V ? 58 : 66, weight: 800, align: 'center', lh: 1.15 });
      const stack = ['React Native + Expo', 'TypeScript', 'Supabase · PostgreSQL', 'Tempo real', 'Segurança no banco (RLS)', 'PWA', 'Cloudflare', 'GitHub Actions', 'Testes automatizados'];
      ctx.font = `700 30px ${FONT}`;
      const larguras = stack.map((s) => ctx.measureText(s).width + 42 + 16);
      let linha = [];
      const linhas = [];
      let acc = 0;
      const maxW = V ? 940 : 1500;
      stack.forEach((s, i) => {
        if (acc + larguras[i] > maxW && linha.length) { linhas.push(linha); linha = []; acc = 0; }
        linha.push(i);
        acc += larguras[i];
      });
      linhas.push(linha);
      linhas.forEach((ln, r) => {
        const total = ln.reduce((a, i) => a + larguras[i], 0) - 16;
        let x = cx - total / 2;
        ln.forEach((i) => {
          pilula(stack[i], x, (V ? 470 : 470) + r * 90, { size: 30, alpha: pr(t, 0.6 + i * 0.12, 1.1 + i * 0.12) });
          x += larguras[i];
        });
      });
      entra('💚 Custo zero  ·  🔓 Código aberto no GitHub', cx, V ? 900 : 860, t, 2, { size: V ? 40 : 44, weight: 800, color: C.green, align: 'center' });
    },
  },
  {
    dur: 6.5, // Final
    draw(t) {
      fundo(t);
      const cx = W / 2;
      const p = pr(t, 0.1, 0.8);
      logo(cx, V ? 300 : 230, 140, p);
      entra('Junto', cx, V ? 500 : 430, t, 0.3, { size: V ? 110 : 120, weight: 800, align: 'center' });
      entra('Comprar junto é mais fácil — e sai mais barato.', cx, V ? 600 : 530, t, 0.7, { size: V ? 38 : 44, weight: 700, color: C.green, align: 'center', max: 980 });
      pilula('junto.gusttavo-ssantos.workers.dev', cx, V ? 720 : 640, { size: V ? 34 : 38, align: 'center', alpha: pr(t, 1.3, 1.9), fundo: C.green, cor: '#fff', borda: null });
      pilula('github.com/Guhssantos/junto', cx, V ? 850 : 770, { size: V ? 34 : 38, align: 'center', alpha: pr(t, 1.7, 2.3) });
      entra('Teste grátis · contribuições são bem-vindas', cx, V ? 1040 : 950, t, 2.4, { size: 30, weight: 600, color: C.muted, align: 'center' });
    },
  },
];

let acc = 0;
for (const c of CENAS) { c.inicio = acc; acc += c.dur; }
const DURACAO = acc;
const TRANS = 0.5; // transição cruzada entre cenas (s)

function quadro(tg) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  const i = Math.max(0, CENAS.findIndex((c) => tg >= c.inicio && tg < c.inicio + c.dur));
  const cena = CENAS[i === -1 ? CENAS.length - 1 : i];
  cena.draw(tg - cena.inicio);
  const prox = CENAS[i + 1];
  const resta = cena.inicio + cena.dur - tg;
  if (prox && resta < TRANS) {
    ctx.save();
    ctx.globalAlpha = easeInOut(1 - resta / TRANS);
    prox.draw(tg - prox.inicio);
    ctx.restore();
  }
  // barra de progresso discreta
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(23,100,63,0.18)';
  ctx.fillRect(0, H - 8, W, 8);
  ctx.fillStyle = C.green;
  ctx.fillRect(0, H - 8, W * (tg / DURACAO), 8);
}

async function gravar() {
  const total = Math.round(DURACAO * FPS);
  const { Muxer, ArrayBufferTarget } = window.Mp4Muxer;
  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width: W, height: H, frameRate: FPS }, fastStart: 'in-memory' });
  let erro = null;
  const enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => (erro = e) });
  enc.configure({ codec: 'avc1.640028', width: W, height: H, bitrate: 8_000_000, framerate: FPS, latencyMode: 'quality' });
  for (let f = 0; f < total; f++) {
    if (erro) throw erro;
    quadro(f / FPS);
    const vf = new VideoFrame(canvas, { timestamp: Math.round((f * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
    enc.encode(vf, { keyFrame: f % (FPS * 2) === 0 });
    vf.close();
    while (enc.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 2));
    if (f % 15 === 0) {
      status.textContent = `gravando ${f}/${total} quadros (${Math.round((f / total) * 100)}%)`;
      document.title = `gravando ${Math.round((f / total) * 100)}%`;
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  await enc.flush();
  muxer.finalize();
  const nome = VERTICAL ? 'junto-apresentacao-vertical.mp4' : 'junto-apresentacao.mp4';
  await fetch(`/salvar/${nome}`, { method: 'POST', body: muxer.target.buffer });
  status.textContent = `✓ pronto: ${nome} (${DURACAO.toFixed(1)} s)`;
  document.title = 'pronto';
  window.__pronto = { nome, segundos: DURACAO, quadros: total };
}

async function capa() {
  quadro(params.has('capa') ? Number(params.get('capa')) : 3.5);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  await fetch(`/salvar/${VERTICAL ? 'capa-vertical.png' : 'capa.png'}`, { method: 'POST', body: blob });
  status.textContent = '✓ capa salva';
  window.__pronto = { capa: true };
}

window.renderAt = (s) => quadro(s);
window.DURACAO = () => DURACAO;

carregar()
  .then(async () => {
    status.textContent = `pronto · ${DURACAO.toFixed(1)} s · ${W}×${H}`;
    if (params.has('gravar')) await gravar();
    else if (params.has('salvarCapa')) await capa();
    else quadro(Number(params.get('t') || 3.5));
  })
  .catch((e) => {
    status.textContent = `erro: ${e.message}`;
    window.__erro = e.message;
  });

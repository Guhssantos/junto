// Trilha sonora original do vídeo de 40 s, sintetizada em código (sem samples nem licenças).
// 120 BPM: cada compasso dura 2 s e todas as trocas de cena caem num tempo da música.
// Efeitos sonoros (toques, notificações, sincronização, transições) seguem os instantes das
// animações de estudio/curto.js — se mudar os tempos lá, ajuste EVENTOS aqui.
// Uso: node trilha.mjs [saida.wav]   (padrão: trilha-40s.wav, 48 kHz estéreo 16 bits)
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SR = 48000;
const DURACAO = 40;
const N = SR * DURACAO;
const BPM = 120;
const BEAT = 60 / BPM;

// ---------------------------------------------------------------------------
// Barramentos: música, efeitos e envio para reverb (estéreo)
// ---------------------------------------------------------------------------
const bus = () => [new Float32Array(N), new Float32Array(N)];
const musica = bus();
const efeitos = bus();
const reverbEnvio = bus();

let semente = 7;
const ruido = () => {
  semente = (semente * 1664525 + 1013904223) >>> 0;
  return semente / 2147483648 - 1;
};
const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

/** Soma um sinal gerado por fn(tLocal) a partir de t0, com pan (-1..1) e envio para reverb */
function soma(destino, t0, dur, fn, { ganho = 1, pan = 0, reverb = 0 } = {}) {
  const i0 = Math.max(0, Math.round(t0 * SR));
  const i1 = Math.min(N, Math.round((t0 + dur) * SR));
  const gl = ganho * Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = ganho * Math.sin(((pan + 1) * Math.PI) / 4);
  for (let i = i0; i < i1; i++) {
    const v = fn((i - i0) / SR);
    destino[0][i] += v * gl;
    destino[1][i] += v * gr;
    if (reverb) {
      reverbEnvio[0][i] += v * gl * reverb;
      reverbEnvio[1][i] += v * gr * reverb;
    }
  }
}

const env = (t, ataque, decaimento) => (t < ataque ? t / ataque : Math.exp(-(t - ataque) / decaimento));

// ---------------------------------------------------------------------------
// Instrumentos
// ---------------------------------------------------------------------------
/** Pad quente: síntese aditiva com leve desafinação entre vozes */
function pad(t0, dur, notas, ganho) {
  for (const [k, m] of notas.entries()) {
    const f = hz(m);
    const det = [0.997, 1.003];
    soma(musica, t0, dur + 1.2, (t) => {
      const a = Math.min(1, t / 0.45) * (t > dur ? Math.exp(-(t - dur) / 0.35) : 1);
      let v = 0;
      for (const d of det) for (let h = 1; h <= 6; h++) v += Math.sin(2 * Math.PI * f * d * h * t + h) / Math.pow(h, 1.7);
      return v * a * 0.5;
    }, { ganho, pan: (k % 2 ? 0.35 : -0.35), reverb: 0.35 });
  }
}

/** Corda dedilhada (Karplus-Strong) */
function pluck(t0, m, ganho, pan = 0, brilho = 0.5) {
  const f = hz(m);
  const p = Math.max(2, Math.round(SR / f));
  const buf = new Float32Array(p);
  let ant = 0;
  for (let i = 0; i < p; i++) { ant = ant * brilho + ruido() * (1 - brilho); buf[i] = ant; }
  let idx = 0;
  soma(musica, t0, 0.9, () => {
    const v = buf[idx];
    const prox = buf[(idx + 1) % p];
    buf[idx] = 0.5 * (v + prox) * 0.996;
    idx = (idx + 1) % p;
    return v;
  }, { ganho, pan, reverb: 0.3 });
}

function baixo(t0, dur, m, ganho) {
  const f = hz(m);
  soma(musica, t0, dur + 0.1, (t) => {
    const a = Math.min(1, t / 0.008) * Math.exp(-t / 0.5) * (t > dur ? Math.exp(-(t - dur) / 0.03) : 1);
    return (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(4 * Math.PI * f * t) + 0.12 * Math.sin(6 * Math.PI * f * t)) * a;
  }, { ganho });
}

function bumbo(t0, ganho) {
  let fase = 0;
  soma(musica, t0, 0.45, (t) => {
    const f = 45 + 95 * Math.exp(-t / 0.035);
    fase += (2 * Math.PI * f) / SR;
    return Math.sin(fase) * Math.exp(-t / 0.16) + (t < 0.004 ? ruido() * 0.3 : 0);
  }, { ganho });
}

/** Ruído com passa-alta de um polo (chimbal, palmas) */
function ruidoFiltrado(destino, t0, dur, decai, corte, ganho, pan = 0, reverb = 0) {
  const a = Math.exp((-2 * Math.PI * corte) / SR);
  let x1 = 0;
  let y1 = 0;
  soma(destino, t0, dur, (t) => {
    const x = ruido();
    const y = a * (y1 + x - x1);
    x1 = x;
    y1 = y;
    return y * Math.exp(-t / decai);
  }, { ganho, pan, reverb });
}
const chimbal = (t0, ganho, pan = 0.25) => ruidoFiltrado(musica, t0, 0.08, 0.018, 7000, ganho, pan);
const palmas = (t0, ganho) => {
  for (const [d, g] of [[0, 0.6], [0.011, 0.8], [0.022, 1]]) ruidoFiltrado(musica, t0 + d, 0.25, d === 0.022 ? 0.09 : 0.008, 1200, ganho * g, 0, 0.25);
};

// ---------------------------------------------------------------------------
// Efeitos sonoros
// ---------------------------------------------------------------------------
/** Passagem de ar ("whoosh"): ruído num passa-baixa que abre e fecha, atravessando o estéreo */
function whoosh(tCentro, ganho, dur = 0.7) {
  const t0 = tCentro - dur * 0.6;
  let y = 0;
  const i0 = Math.round(t0 * SR);
  for (let i = 0; i < dur * SR; i++) {
    const p = i / (dur * SR);
    const corte = 300 + 5200 * Math.sin(Math.PI * p) ** 2;
    const a = 1 - Math.exp((-2 * Math.PI * corte) / SR);
    y += a * (ruido() - y);
    const v = y * Math.sin(Math.PI * p) ** 1.5 * ganho;
    const pan = -0.7 + 1.4 * p;
    const j = i0 + i;
    if (j < 0 || j >= N) continue;
    efeitos[0][j] += v * Math.cos(((pan + 1) * Math.PI) / 4);
    efeitos[1][j] += v * Math.sin(((pan + 1) * Math.PI) / 4);
    reverbEnvio[0][j] += v * 0.2;
    reverbEnvio[1][j] += v * 0.2;
  }
}

/** Toque na tela: clique curto e seco */
function clique(t0, ganho) {
  soma(efeitos, t0, 0.06, (t) => (Math.sin(2 * Math.PI * 2100 * t) * 0.6 + ruido() * 0.4) * Math.exp(-t / 0.008), { ganho, reverb: 0.1 });
  soma(efeitos, t0, 0.12, (t) => Math.sin(2 * Math.PI * (380 - 900 * t) * t) * Math.exp(-t / 0.03), { ganho: ganho * 0.7 });
}

/** "Pop" de elemento surgindo */
function pop(t0, ganho, agudo = 1) {
  let fase = 0;
  soma(efeitos, t0, 0.14, (t) => {
    const f = (520 + 700 * Math.exp(-t / 0.02)) * agudo;
    fase += (2 * Math.PI * f) / SR;
    return Math.sin(fase) * Math.min(1, t / 0.003) * Math.exp(-t / 0.04);
  }, { ganho, pan: (agudo - 1) * 2, reverb: 0.2 });
}

/** Sino suave (parciais inarmônicas) */
function sino(t0, m, ganho, pan = 0, decai = 0.7) {
  const f = hz(m);
  soma(efeitos, t0, decai * 4, (t) => {
    const a = Math.min(1, t / 0.002);
    return a * (Math.sin(2 * Math.PI * f * t) * Math.exp(-t / decai)
      + 0.35 * Math.sin(2 * Math.PI * f * 2.76 * t) * Math.exp(-t / (decai * 0.4))
      + 0.15 * Math.sin(2 * Math.PI * f * 5.4 * t) * Math.exp(-t / (decai * 0.2)));
  }, { ganho, pan, reverb: 0.4 });
}

/** Notificação do app: duas notas ascendentes */
function notificacao(t0, ganho) {
  sino(t0, 84, ganho, -0.1, 0.35); // C6
  sino(t0 + 0.11, 89, ganho, 0.1, 0.55); // F6
}

/** Sincronização entre os celulares: brilho de notas rápidas viajando no estéreo */
function sincronia(t0, ganho) {
  [72, 77, 81, 84, 89].forEach((m, i) => sino(t0 + i * 0.07, m, ganho * (1 - i * 0.08), -0.6 + i * 0.3, 0.18));
}

/** Subida antes da revelação: ruído e tom que sobem até tFim */
function subida(t0, tFim, ganho) {
  const dur = tFim - t0;
  let y = 0;
  let fase = 0;
  soma(efeitos, t0, dur, (t) => {
    const p = t / dur;
    const a = 1 - Math.exp((-2 * Math.PI * (200 + 6000 * p * p)) / SR);
    y += a * (ruido() - y);
    fase += (2 * Math.PI * (180 + 700 * p * p)) / SR;
    return (y * 0.8 + Math.sin(fase) * 0.25) * p * p;
  }, { ganho, reverb: 0.3 });
}

/** Impacto grave na revelação */
function impacto(t0, ganho) {
  let fase = 0;
  soma(efeitos, t0, 2.2, (t) => {
    const f = 38 + 60 * Math.exp(-t / 0.06);
    fase += (2 * Math.PI * f) / SR;
    return Math.sin(fase) * Math.exp(-t / 0.7);
  }, { ganho });
  ruidoFiltrado(efeitos, t0, 1.2, 0.25, 400, ganho * 0.35, 0, 0.6);
}

// ---------------------------------------------------------------------------
// Música: Dm – Bb – F – C (um acorde por compasso de 2 s)
// ---------------------------------------------------------------------------
const ACORDES = [
  { pad: [62, 65, 69], arp: [74, 77, 81, 77], baixo: 38 }, // Dm
  { pad: [58, 62, 65], arp: [70, 74, 77, 74], baixo: 34 }, // Bb
  { pad: [60, 65, 69], arp: [72, 77, 81, 77], baixo: 41 }, // F
  { pad: [60, 64, 67], arp: [72, 76, 79, 76], baixo: 36 }, // C
];
const COMPASSO = BEAT * 4;
const DROP = 8; // revelação do Junto: entra a bateria
const FINAL = 37; // encerramento: acorde final

for (let c = 0; c * COMPASSO < FINAL; c++) {
  const t = c * COMPASSO;
  const ac = ACORDES[c % 4];
  const intro = t < DROP;
  pad(t, Math.min(COMPASSO, FINAL - t), ac.pad, intro ? 0.085 : 0.05);
  for (let b = 0; b < 8; b++) {
    const tb = t + (b * BEAT) / 2;
    if (tb >= FINAL) break;
    // dedilhado em colcheias (na introdução, só nos tempos, mais abafado)
    if (!intro || b % 2 === 0) pluck(tb, ac.arp[b % 4] + (!intro && b === 6 ? 12 : 0), intro ? 0.14 : 0.085, b % 2 ? 0.4 : -0.4, intro ? 0.7 : 0.45);
    if (intro) continue;
    // bateria e baixo a partir da revelação
    if (b % 4 === 0) bumbo(tb, 0.55);
    if (b === 5 && t >= 16) bumbo(tb, 0.35); // contratempo a partir da 2ª volta
    if (t >= 12 && b % 4 === 2) palmas(tb, 0.13);
    chimbal(tb + (b % 2 ? 0.012 : 0), b % 2 ? 0.05 : 0.035);
    baixo(tb, BEAT / 2 - 0.02, ac.baixo + (b === 7 ? 7 : 0), 0.2);
  }
}
// virada antes do encerramento: semicolcheias de palmas crescendo (36–37 s)
for (let k = 0; k < 8; k++) palmas(36 + k * (BEAT / 4), 0.05 + k * 0.016);
// acorde final em Fá maior, soando até o fim
pad(FINAL, 2.2, [53, 57, 60, 65, 69, 72], 0.055);
baixo(FINAL, 2.6, 29, 0.25);
bumbo(FINAL, 0.6);
[77, 81, 84, 89].forEach((m, i) => pluck(FINAL + i * 0.09, m, 0.09, -0.45 + i * 0.3, 0.4));

// ---------------------------------------------------------------------------
// Efeitos sincronizados com as cenas (segundos do vídeo)
// ---------------------------------------------------------------------------
const EVENTOS = [
  // 1. Problema: cartões surgindo
  ['pop', 0.72], ['pop', 1.07, 1.12], ['pop', 1.42, 1.25],
  // 2. Origem: pessoas, conexão e coração
  ['whoosh', 4.5, 0.11], ['pop', 5.0], ['pop', 5.3, 1.15], ['sincronia', 5.75, 0.07], ['sino', 6.1, 84],
  // 3. Revelação do Junto
  ['subida', 6.2, 8.0], ['whoosh', 7.85, 0.35], ['impacto', 8.0], ['whoosh', 8.6, 0.14],
  // 4. Criar a lista
  ['whoosh', 11.5, 0.1], ['clique', 13.2], ['whoosh', 13.55, 0.08],
  // 5. Produtos e preços
  ['whoosh', 15.0, 0.1], ['pop', 16.0, 1.0, 0.5], ['pop', 16.2, 1.1, 0.5], ['pop', 16.4, 1.2, 0.5],
  ['clique', 16.7], ['whoosh', 17.05, 0.08], ['pop', 17.55, 1.3],
  // 6. Convite
  ['whoosh', 19.0, 0.1], ['whoosh', 19.8, 0.1], ['sincronia', 20.05, 0.1], ['clique', 21.4], ['notificacao', 21.75],
  // 7. Tempo real
  ['whoosh', 22.5, 0.1], ['clique', 24.2], ['sincronia', 24.45, 0.12], ['notificacao', 25.55],
  // 8. Decidir
  ['whoosh', 27.5, 0.1], ['sincronia', 28.05, 0.1], ['clique', 28.95], ['notificacao', 29.55],
  // 9. Comparar preços
  ['whoosh', 31.0, 0.1], ['pop', 32.0, 1.0], ['pop', 32.4, 1.15],
  // 10. Diferenciais: um "tique" por cartão, subindo de tom
  ['whoosh', 34.5, 0.1], ...Array.from({ length: 8 }, (_, i) => ['pop', 34.75 + i * 0.08, 1 + i * 0.07, 0.45]),
  // 11. Encerramento
  ['subida', 35.6, 37.0, 0.18], ['whoosh', 36.85, 0.35], ['impacto', 37.0, 0.5], ['pop', 38.15, 1.1, 0.5], ['pop', 38.35, 1.25, 0.5],
];
const ducking = new Float32Array(N); // abaixa a música sob os efeitos de destaque
for (const [tipo, t, a, b] of EVENTOS) {
  if (tipo === 'pop') pop(t, (b ?? 0.7) * 0.32, a ?? 1);
  else if (tipo === 'whoosh') whoosh(t, a);
  else if (tipo === 'clique') clique(t, 0.3);
  else if (tipo === 'sino') sino(t, a, 0.14, 0, 0.6);
  else if (tipo === 'notificacao') notificacao(t, 0.17);
  else if (tipo === 'sincronia') sincronia(t, a);
  else if (tipo === 'subida') subida(t, a, b ?? 0.22);
  else if (tipo === 'impacto') impacto(t, a ?? 0.75);
  if (['notificacao', 'impacto', 'clique'].includes(tipo)) {
    for (let i = Math.round(t * SR), k = 0; k < SR * 0.6 && i < N; i++, k++) ducking[i] = Math.max(ducking[i], 0.3 * Math.exp(-k / (SR * 0.25)));
  }
}

// ---------------------------------------------------------------------------
// Reverb (Schroeder: 4 filtros pente + 2 passa-tudo por canal) e mixagem
// ---------------------------------------------------------------------------
function reverb(x, desloc) {
  const out = new Float32Array(N);
  for (const ms of [29.7, 37.1, 41.1, 43.7]) {
    const d = Math.round(((ms + desloc) * SR) / 1000);
    const buf = new Float32Array(d);
    let j = 0;
    let lp = 0;
    for (let i = 0; i < N; i++) {
      const y = buf[j];
      lp = lp * 0.3 + y * 0.7; // amortece agudos nas reflexões
      buf[j] = x[i] + lp * 0.8;
      out[i] += y * 0.25;
      j = (j + 1) % d;
    }
  }
  for (const ms of [5, 1.7]) {
    const d = Math.round((ms * SR) / 1000);
    const buf = new Float32Array(d);
    let j = 0;
    for (let i = 0; i < N; i++) {
      const b = buf[j];
      const y = -0.7 * out[i] + b;
      buf[j] = out[i] + 0.7 * y;
      out[i] = y;
      j = (j + 1) % d;
    }
  }
  return out;
}
const rv = [reverb(reverbEnvio[0], 0), reverb(reverbEnvio[1], 1.3)];

const mix = [new Float32Array(N), new Float32Array(N)];
for (let ch = 0; ch < 2; ch++) {
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const fadeIn = Math.min(1, t / 0.3);
    const fadeOut = Math.min(1, (DURACAO - t) / 1.2);
    mix[ch][i] = (musica[ch][i] * (1 - ducking[i]) + efeitos[ch][i] + rv[ch][i] * 0.6) * fadeIn * fadeOut;
  }
}
// normaliza pelo volume médio (RMS) e limita picos com saturação suave
let soma2 = 0;
for (let ch = 0; ch < 2; ch++) for (let i = 0; i < N; i++) soma2 += mix[ch][i] ** 2;
const rms = Math.sqrt(soma2 / (2 * N));
const alvo = Math.pow(10, -17 / 20);
const g = alvo / rms;
const pcm = Buffer.alloc(44 + N * 4);
pcm.write('RIFF', 0);
pcm.writeUInt32LE(36 + N * 4, 4);
pcm.write('WAVEfmt ', 8);
pcm.writeUInt32LE(16, 16);
pcm.writeUInt16LE(1, 20);
pcm.writeUInt16LE(2, 22);
pcm.writeUInt32LE(SR, 24);
pcm.writeUInt32LE(SR * 4, 28);
pcm.writeUInt16LE(4, 32);
pcm.writeUInt16LE(16, 34);
pcm.write('data', 36);
pcm.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  for (let ch = 0; ch < 2; ch++) {
    const v = Math.tanh(mix[ch][i] * g * 1.1) * 0.93;
    pcm.writeInt16LE(Math.round(v * 32767), 44 + (i * 2 + ch) * 2);
  }
}
const saida = process.argv[2] || fileURLToPath(new URL('./trilha-40s.wav', import.meta.url));
writeFileSync(saida, pcm);
console.log(`✓ trilha ${saida} (${DURACAO} s, RMS original ${(20 * Math.log10(rms)).toFixed(1)} dBFS)`);

// Formatação e leitura de valores em reais, sem depender de Intl
// (resultado idêntico em Android, iOS, web e testes).

export function formatBRL(value: number | null | undefined, opts: { signed?: boolean } = {}): string {
  if (value == null || Number.isNaN(value)) return '—';
  const cents = Math.round(Math.abs(value) * 100);
  const int = Math.floor(cents / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const dec = (cents % 100).toString().padStart(2, '0');
  const sign = value < 0 && cents > 0 ? '−' : opts.signed && cents > 0 ? '+' : '';
  return `${sign}R$ ${int},${dec}`;
}

/** Aceita "27,90", "27.90", "R$ 1.234,56", "1234". Retorna null se inválido. */
export function parseBRL(input: string): number | null {
  const raw = input.replace(/[R$\s]/g, '').trim();
  if (!raw) return null;
  let normalized = raw;
  if (raw.includes(',')) {
    normalized = raw.replace(/\./g, '').replace(',', '.');
  } else if ((raw.match(/\./g) ?? []).length > 1) {
    normalized = raw.replace(/\./g, '');
  }
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const n = Number(normalized);
  return Number.isFinite(n) && n <= 1_000_000 ? Math.round(n * 100) / 100 : null;
}

/** Máscara para digitação: "2790" → "27,90". */
export function maskBRLInput(digits: string): string {
  const only = digits.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 9);
  if (!only) return '';
  const padded = only.padStart(3, '0');
  const int = padded.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${int},${padded.slice(-2)}`;
}

export function formatQuantity(q: number, unit: string | null | undefined): string {
  const n = Number.isInteger(q) ? q.toString() : q.toFixed(3).replace(/\.?0+$/, '').replace('.', ',');
  return unit ? `${n} ${unit}` : n;
}

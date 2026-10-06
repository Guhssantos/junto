import { formatBRL, formatQuantity, maskBRLInput, parseBRL } from '@/lib/money';

describe('formatBRL', () => {
  it('formata reais com vírgula e milhar', () => {
    expect(formatBRL(27.9)).toBe('R$ 27,90');
    expect(formatBRL(1234.5)).toBe('R$ 1.234,50');
    expect(formatBRL(0)).toBe('R$ 0,00');
  });
  it('mostra sinal para diferenças', () => {
    expect(formatBRL(2.9, { signed: true })).toBe('+R$ 2,90');
    expect(formatBRL(-3.1, { signed: true })).toBe('−R$ 3,10');
    expect(formatBRL(0, { signed: true })).toBe('R$ 0,00');
  });
  it('trata valores ausentes', () => {
    expect(formatBRL(null)).toBe('—');
  });
});

describe('parseBRL', () => {
  it.each([
    ['27,90', 27.9],
    ['27.90', 27.9],
    ['R$ 1.234,56', 1234.56],
    ['1234', 1234],
    ['0,5', 0.5],
  ])('%s → %d', (input, expected) => expect(parseBRL(input)).toBe(expected));

  it.each(['', 'abc', '12,345', '-5', '2000000'])('rejeita %s', (input) => expect(parseBRL(input)).toBeNull());
});

describe('maskBRLInput', () => {
  it('formata conforme digita', () => {
    expect(maskBRLInput('2')).toBe('0,02');
    expect(maskBRLInput('2790')).toBe('27,90');
    expect(maskBRLInput('123456')).toBe('1.234,56');
    expect(maskBRLInput('')).toBe('');
  });
  it('é compatível com parseBRL', () => {
    expect(parseBRL(maskBRLInput('2790'))).toBe(27.9);
  });
});

describe('formatQuantity', () => {
  it('mostra decimais com vírgula', () => {
    expect(formatQuantity(2, 'un')).toBe('2 un');
    expect(formatQuantity(1.25, 'kg')).toBe('1,25 kg');
  });
});

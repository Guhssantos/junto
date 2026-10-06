import { resolveSupabaseUrl } from '@/config/env';
import { formatQuantity } from '@/lib/money';
import { isPresetUnit, normalizeUnit, quantityStep } from '@/lib/units';
import { fromBytes, uuid } from '@/lib/uuid';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('uuid', () => {
  const original = globalThis.crypto;
  afterEach(() => Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true }));

  it('funciona em página sem HTTPS (sem crypto.randomUUID), como o celular pela rede', () => {
    Object.defineProperty(globalThis, 'crypto', {
      value: { getRandomValues: (a: Uint8Array) => a.map((_, i) => (i * 37 + 11) % 256) },
      configurable: true,
    });
    const id = uuid();
    expect(id).toMatch(UUID_V4);
  });

  it('formata bytes como UUID v4 válido', () => {
    expect(fromBytes(new Uint8Array(16).fill(255))).toMatch(UUID_V4);
    expect(fromBytes(new Uint8Array(16))).toBe('00000000-0000-4000-8000-000000000000');
  });

  it('gera IDs diferentes', () => {
    const ids = new Set(Array.from({ length: 200 }, () => uuid()));
    expect(ids.size).toBe(200);
  });
});

describe('resolveSupabaseUrl', () => {
  it('celular pela rede usa o IP do computador para o Supabase local', () => {
    expect(resolveSupabaseUrl('http://127.0.0.1:54321', '192.168.0.10')).toBe('http://192.168.0.10:54321');
    expect(resolveSupabaseUrl('http://10.0.0.5:54321', '192.168.1.5')).toBe('http://192.168.1.5:54321');
  });

  it('não mexe entre localhost e 127.0.0.1 (mesma máquina, mesma sessão)', () => {
    expect(resolveSupabaseUrl('http://127.0.0.1:54321', 'localhost')).toBe('http://127.0.0.1:54321');
  });

  it('nunca altera projetos na nuvem nem páginas publicadas', () => {
    expect(resolveSupabaseUrl('https://abcd.supabase.co', '192.168.0.10')).toBe('https://abcd.supabase.co');
    expect(resolveSupabaseUrl('http://127.0.0.1:54321', 'junto.pages.dev')).toBe('http://127.0.0.1:54321');
    expect(resolveSupabaseUrl('http://127.0.0.1:54321', undefined)).toBe('http://127.0.0.1:54321');
  });
});

describe('unidade opcional', () => {
  it('mostra só a quantidade quando não há unidade', () => {
    expect(formatQuantity(2, null)).toBe('2');
    expect(formatQuantity(1.5, 'kg')).toBe('1,5 kg');
    expect(formatQuantity(1, 'maço')).toBe('1 maço');
  });

  it('normaliza vazio para "sem unidade" e limita o texto livre', () => {
    expect(normalizeUnit('  ')).toBeNull();
    expect(normalizeUnit(null)).toBeNull();
    expect(normalizeUnit(' bandeja ')).toBe('bandeja');
    expect(normalizeUnit('x'.repeat(30))).toHaveLength(15);
  });

  it('reconhece as sugeridas e usa meio em meio para kg/L', () => {
    expect(isPresetUnit('ml')).toBe(true);
    expect(isPresetUnit('maço')).toBe(false);
    expect(quantityStep('kg')).toBe(0.5);
    expect(quantityStep(null)).toBe(1);
  });
});

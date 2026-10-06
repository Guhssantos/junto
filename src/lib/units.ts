// Unidades sugeridas. A unidade é opcional (null = sem unidade) e também aceita
// texto livre curto ("Outros"), validado no banco (até 15 caracteres).
export const UNIT_PRESETS = [
  { value: 'un', label: 'un', name: 'Unidade' },
  { value: 'kg', label: 'kg', name: 'Quilograma' },
  { value: 'g', label: 'g', name: 'Grama' },
  { value: 'L', label: 'L', name: 'Litro' },
  { value: 'ml', label: 'ml', name: 'Mililitro' },
  { value: 'pct', label: 'pct', name: 'Pacote' },
  { value: 'cx', label: 'cx', name: 'Caixa' },
  { value: 'dz', label: 'dz', name: 'Dúzia' },
] as const;

export function isPresetUnit(u: string | null | undefined): boolean {
  return UNIT_PRESETS.some((p) => p.value === u);
}

/** Passo do "− / +": meio quilo/litro para itens a granel, inteiro no resto. */
export function quantityStep(unit: string | null | undefined): number {
  return unit === 'kg' || unit === 'L' ? 0.5 : 1;
}

/** Normaliza o que vai para o servidor: vazio vira "sem unidade". */
export function normalizeUnit(u: string | null | undefined): string | null {
  const t = (u ?? '').trim();
  return t ? t.slice(0, 15) : null;
}

import type { Category } from '@/types/models';

// Lista local (fallback offline). A fonte oficial é a tabela public.categories,
// que permite novas categorias sem atualizar o app.
export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'carnes', name: 'Carnes', emoji: '🥩', sort_order: 10, keywords: ['carne', 'picanha', 'frango', 'peixe', 'linguiça', 'linguica', 'bife', 'alcatra', 'patinho', 'costela', 'salsicha', 'presunto', 'bacon'] },
  { id: 'laticinios', name: 'Laticínios', emoji: '🥛', sort_order: 20, keywords: ['leite', 'queijo', 'iogurte', 'manteiga', 'requeijão', 'requeijao', 'creme de leite', 'nata', 'muçarela', 'mussarela'] },
  { id: 'hortifruti', name: 'Frutas e verduras', emoji: '🥦', sort_order: 30, keywords: ['banana', 'maçã', 'maca', 'tomate', 'alface', 'cebola', 'alho', 'batata', 'cenoura', 'limão', 'limao', 'laranja', 'uva', 'mamão', 'mamao', 'abacate', 'fruta', 'verdura', 'legume'] },
  { id: 'padaria', name: 'Padaria', emoji: '🍞', sort_order: 40, keywords: ['pão', 'pao', 'bolo', 'torrada', 'biscoito', 'bolacha', 'pão de queijo', 'croissant'] },
  { id: 'alimentos', name: 'Alimentos', emoji: '🥫', sort_order: 50, keywords: ['arroz', 'feijão', 'feijao', 'macarrão', 'macarrao', 'açúcar', 'acucar', 'sal', 'óleo', 'oleo', 'café', 'cafe', 'farinha', 'molho', 'azeite', 'chocolate', 'cereal', 'aveia', 'ovo', 'ovos'] },
  { id: 'limpeza', name: 'Limpeza', emoji: '🧹', sort_order: 60, keywords: ['detergente', 'sabão', 'sabao', 'amaciante', 'desinfetante', 'água sanitária', 'agua sanitaria', 'esponja', 'saco de lixo', 'multiuso'] },
  { id: 'higiene', name: 'Higiene', emoji: '🧴', sort_order: 70, keywords: ['shampoo', 'xampu', 'condicionador', 'sabonete', 'pasta de dente', 'creme dental', 'desodorante', 'papel higiênico', 'papel higienico', 'escova'] },
  { id: 'bebidas', name: 'Bebidas', emoji: '🥤', sort_order: 80, keywords: ['refrigerante', 'suco', 'água', 'agua', 'cerveja', 'vinho', 'energético', 'energetico', 'chá', 'cha'] },
  { id: 'pets', name: 'Pets', emoji: '🐶', sort_order: 90, keywords: ['ração', 'racao', 'petisco', 'areia', 'pet'] },
  { id: 'outros', name: 'Outros', emoji: '📦', sort_order: 999, keywords: [] },
];

/** Mesma regra de private.suggest_category: a palavra-chave mais longa contida no nome vence. */
export function suggestCategory(name: string, categories: Category[] = DEFAULT_CATEGORIES): string {
  const n = name.toLowerCase().trim();
  if (!n) return 'outros';
  let best: { id: string; len: number; order: number } | null = null;
  for (const c of categories) {
    for (const k of c.keywords) {
      if (n.includes(k) && (!best || k.length > best.len || (k.length === best.len && c.sort_order < best.order))) {
        best = { id: c.id, len: k.length, order: c.sort_order };
      }
    }
  }
  return best?.id ?? 'outros';
}

export function categoryById(id: string, categories: Category[] = DEFAULT_CATEGORIES): Category {
  return categories.find((c) => c.id === id) ?? categories.find((c) => c.id === 'outros') ?? DEFAULT_CATEGORIES[DEFAULT_CATEGORIES.length - 1];
}

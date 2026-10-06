// Ponto de extensão para recursos de IA (não usados no MVP).
//
// A arquitetura já guarda o que esses recursos precisam:
//   - activity_log: cada ação com usuário, produto e data (histórico de hábitos);
//   - products.normalized_name: base para detectar duplicados e itens frequentes;
//   - purchase_history: totais por compra (previsão de gasto);
//   - categories.keywords: sugestão de categoria (hoje por regra; amanhã por modelo).
//
// Para ativar: implemente `SuggestionProvider` numa Edge Function (a chave do
// provedor de IA fica no servidor, nunca no app) e troque `ruleBasedProvider`.

import { suggestCategory } from '@/lib/categories';
import type { Product } from '@/types/models';

export interface SuggestionProvider {
  /** Categoria provável para um nome de produto. */
  categoryFor(name: string): Promise<string>;
  /** Itens que o grupo costuma comprar e ainda não estão na lista. */
  frequentItems(listId: string, current: Product[]): Promise<string[]>;
  /** Possíveis duplicados ("Leite" e "leite integral"). */
  duplicates(current: Product[]): Promise<[Product, Product][]>;
}

export const ruleBasedProvider: SuggestionProvider = {
  async categoryFor(name) {
    return suggestCategory(name);
  },
  async frequentItems() {
    return [];
  },
  async duplicates(current) {
    const seen = new Map<string, Product>();
    const pairs: [Product, Product][] = [];
    for (const p of current) {
      const key = p.name.trim().toLowerCase();
      const prev = seen.get(key);
      if (prev) pairs.push([prev, p]);
      else seen.set(key, p);
    }
    return pairs;
  },
};

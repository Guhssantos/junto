import type { ProductStatus } from '@/types/models';

export const STATUS_LABEL: Record<ProductStatus, string> = {
  pending: 'Pendente',
  in_review: 'Em análise',
  awaiting_confirmation: 'Aguardando confirmação',
  approved: 'Aprovado',
  rejected: 'Recusado',
  purchased: 'Comprado',
  unavailable: 'Indisponível',
  cancelled: 'Cancelado',
};

export const STATUS_SHORT: Record<ProductStatus, string> = { ...STATUS_LABEL, awaiting_confirmation: 'Aguardando' };

/** Status que o usuário pode escolher manualmente (os demais vêm do fluxo de aprovação). */
export const MANUAL_STATUSES: ProductStatus[] = ['pending', 'in_review', 'purchased', 'unavailable', 'cancelled'];

export function isOpen(status: ProductStatus): boolean {
  return status === 'pending' || status === 'in_review' || status === 'approved';
}

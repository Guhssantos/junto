import type { ActivityEntry } from '@/types/models';

import { formatBRL } from './money';

const STATUS_PT: Record<string, string> = {
  pending: 'pendente',
  in_review: 'em análise',
  unavailable: 'indisponível',
  cancelled: 'cancelado',
};

/** Texto do histórico: "Larissa alterou o preço do arroz para R$ 27,90." */
export function describeActivity(e: ActivityEntry, actorName: string): string {
  const p = e.product_name ? `“${e.product_name}”` : 'um produto';
  const d = e.details ?? {};
  switch (e.action) {
    case 'list_created':
      return `${actorName} criou a lista.`;
    case 'product_added':
      return `${actorName} adicionou ${p}.`;
    case 'product_removed':
      return `${actorName} removeu ${p}.`;
    case 'product_updated':
      return `${actorName} editou ${p}.`;
    case 'price_changed': {
      const to = (d.actual_to ?? d.estimated_to) as number | null | undefined;
      return to != null ? `${actorName} alterou o preço de ${p} para ${formatBRL(Number(to))}.` : `${actorName} removeu o preço de ${p}.`;
    }
    case 'product_purchased':
      return `${actorName} marcou ${p} como comprado.`;
    case 'product_unpurchased':
      return `${actorName} desmarcou ${p}.`;
    case 'status_changed':
      return `${actorName} marcou ${p} como ${STATUS_PT[String(d.to)] ?? String(d.to)}.`;
    case 'approval_requested':
      return `${actorName} perguntou sobre ${p}${d.price != null ? ` (${formatBRL(Number(d.price))})` : ''}.`;
    case 'approval_approved':
      return `${actorName} aprovou ${p}.`;
    case 'approval_rejected':
      return `${actorName} recusou ${p}.`;
    case 'approval_cancelled':
      return `${actorName} cancelou uma pergunta.`;
    case 'join_requested':
      return `${actorName} pediu para entrar.`;
    case 'member_joined':
      return `${actorName} entrou na lista.`;
    case 'join_rejected':
      return `${actorName} recusou um pedido de entrada.`;
    case 'member_left':
      return `${actorName} saiu da lista.`;
    case 'member_removed':
      return `${actorName} removeu um participante.`;
    case 'role_changed':
      return `${actorName} alterou o papel de um participante.`;
    case 'invite_created':
      return `${actorName} gerou um convite.`;
    case 'invites_revoked':
      return `${actorName} cancelou os convites.`;
    case 'list_completed':
      return `${actorName} finalizou a compra${d.total_actual != null ? ` (${formatBRL(Number(d.total_actual))})` : ''}.`;
    case 'list_reopened':
      return `${actorName} reabriu a lista.`;
    case 'owner_transferred':
      return 'A administração da lista foi transferida.';
    default:
      return `${actorName} fez uma alteração.`;
  }
}

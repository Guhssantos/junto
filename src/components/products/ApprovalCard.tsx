import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Avatar, Button, Card, StatusBadge, Text } from '@/components/ui';
import { toAppError } from '@/lib/errors';
import { firstName, timeAgo } from '@/lib/format';
import { formatBRL } from '@/lib/money';
import { queryClient } from '@/lib/queryClient';
import { qk } from '@/lib/queryKeys';
import { showToast } from '@/lib/toast';
import { respondApproval } from '@/services/products';
import type { ApprovalRequest, Product, Profile } from '@/types/models';

/** Card "Gustavo encontrou X por R$ Y. Deseja adicionar?" com Adicionar / Não comprar / Responder. */
export function ApprovalCard({ request, product, requester, canRespond }: {
  request: ApprovalRequest;
  product: Product | undefined;
  requester: Profile | null | undefined;
  canRespond: boolean;
}) {
  const [busy, setBusy] = useState<'yes' | 'no' | null>(null);
  const mutation = useMutation({
    mutationFn: (approve: boolean) => respondApproval(request.id, approve),
    onMutate: (approve) => setBusy(approve ? 'yes' : 'no'),
    onSuccess: (_r, approve) => {
      showToast(approve ? 'Aprovado ✅' : 'Recusado ❌', approve ? 'success' : 'info');
      queryClient.invalidateQueries({ queryKey: qk.approvals(request.list_id) });
      queryClient.invalidateQueries({ queryKey: qk.products(request.list_id) });
      queryClient.invalidateQueries({ queryKey: qk.notifications });
    },
    onError: (e) => showToast(toAppError(e).message, 'error'),
    onSettled: () => setBusy(null),
  });

  const who = firstName(requester?.name);
  const name = product?.name ?? 'produto';
  return (
    <Card style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Avatar profile={requester} size={40} />
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong">{request.is_new_product ? `${who} encontrou` : `${who} perguntou`}</Text>
          <Text variant="caption" tone="muted">{timeAgo(request.created_at)}</Text>
        </View>
        {product ? <StatusBadge status={product.status} /> : null}
      </View>
      <Text variant="body" style={{ fontSize: 17, lineHeight: 24 }}>
        {request.is_new_product ? 'Encontrei ' : 'Sobre '}
        <Text variant="bodyStrong" style={{ fontSize: 17 }}>“{name}”</Text>
        {request.price != null ? (
          <>
            {' por '}
            <Text variant="bodyStrong" style={{ fontSize: 17 }}>{formatBRL(request.price)}</Text>
          </>
        ) : null}
        . {request.is_new_product ? 'Deseja adicionar este produto à compra?' : 'Pode comprar?'}
      </Text>
      {request.message ? <Text tone="subtle">“{request.message}”</Text> : null}
      {canRespond && request.status === 'pending' ? (
        <>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button label="Adicionar" icon="check" style={{ flex: 1 }} loading={busy === 'yes'} disabled={!!busy} onPress={() => mutation.mutate(true)} />
            <Button label="Não comprar" variant="danger" style={{ flex: 1 }} loading={busy === 'no'} disabled={!!busy} onPress={() => mutation.mutate(false)} />
          </View>
          <Button
            label="Responder"
            icon="chat"
            variant="soft"
            size="md"
            onPress={() => router.push(`/lists/${request.list_id}/product/${request.product_id}`)}
          />
        </>
      ) : request.status === 'pending' ? (
        <Text variant="caption" tone="muted">Aguardando resposta do parceiro…</Text>
      ) : null}
    </Card>
  );
}

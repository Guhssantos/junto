import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { Button, Input, Sheet, Stepper, Text } from '@/components/ui';
import { useCategories } from '@/hooks/queries';
import { suggestCategory } from '@/lib/categories';
import { toAppError } from '@/lib/errors';
import { maskBRLInput, parseBRL } from '@/lib/money';
import { queryClient } from '@/lib/queryClient';
import { qk } from '@/lib/queryKeys';
import { showToast } from '@/lib/toast';
import { uuid } from '@/lib/uuid';
import { askAboutProduct, askPartner } from '@/services/products';
import type { Product } from '@/types/models';

/**
 * "Perguntar ao parceiro". Sem `product`: item encontrado fora da lista.
 * Com `product`: pergunta sobre um item que já está na lista.
 * Exige conexão (a resposta do parceiro precisa chegar em tempo real).
 */
export function AskPartnerSheet({ listId, product, visible, onClose }: { listId: string; product?: Product | null; visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={product ? `Perguntar sobre ${product.name}` : 'Perguntar ao parceiro'}>
      {visible ? <AskForm key={product?.id ?? 'new'} listId={listId} product={product} onClose={onClose} /> : null}
    </Sheet>
  );
}

function AskForm({ listId, product, onClose }: { listId: string; product?: Product | null; onClose: () => void }) {
  const categories = useCategories();
  const [name, setName] = useState('');
  const [price, setPrice] = useState(() =>
    product?.actual_price != null ? maskBRLInput(Math.round(product.actual_price * 100).toString()) : '',
  );
  const [quantity, setQuantity] = useState(product?.quantity ?? 1);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [requestId] = useState(uuid); // mesmo id em reenvios → pergunta não duplica

  const mutation = useMutation({
    mutationFn: async () => {
      const p = price ? parseBRL(price) : null;
      if (price && p == null) throw new Error('price');
      if (product) return askAboutProduct(product.id, p, message || null);
      return askPartner(listId, {
        id: requestId,
        name,
        price: p,
        quantity,
        unit: null,
        categoryId: suggestCategory(name, categories),
        message: message || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.products(listId) });
      queryClient.invalidateQueries({ queryKey: qk.approvals(listId) });
      showToast('Pergunta enviada. Você será avisado quando responderem.', 'success');
      onClose();
    },
    onError: (e) => setError(e instanceof Error && e.message === 'price' ? 'Digite um preço válido, como 12,90.' : toAppError(e).message),
  });

  return (
    <>
      {!product ? (
        <>
          <Text tone="muted">Achou algo que não estava na lista? Seu parceiro decide se entra na compra.</Text>
          <Input label="Produto" placeholder="Ex.: Chocolate 70%" value={name} onChangeText={setName} maxLength={120} autoFocus />
          <Stepper label="Quantidade" value={quantity} onChange={setQuantity} />
        </>
      ) : null}
      <Input label="Preço encontrado" placeholder="0,00" keyboardType="number-pad" selectTextOnFocus value={price} onChangeText={(t) => setPrice(maskBRLInput(t))} />
      <Input
        label="Mensagem (opcional)"
        placeholder={product ? 'Ex.: Não tem a marca de sempre, pode ser esta?' : 'Ex.: Está na promoção!'}
        value={message}
        onChangeText={setMessage}
        maxLength={500}
        error={error}
      />
      <Button
        label="Enviar pergunta"
        icon="send"
        variant="accent"
        loading={mutation.isPending}
        disabled={!product && !name.trim()}
        onPress={() => mutation.mutate()}
      />
    </>
  );
}

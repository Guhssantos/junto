import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatView } from '@/components/chat/ChatView';
import { ApprovalCard } from '@/components/products/ApprovalCard';
import { AskPartnerSheet } from '@/components/products/AskPartnerSheet';
import { PriceSheet } from '@/components/products/PriceSheet';
import { Button, Card, Chips, Divider, EmptyState, Header, Input, Loading, Screen, Segmented, Sheet, StatusBadge, Stepper, Text } from '@/components/ui';
import { useApprovals, useCategories, useList, useMembers, usePermissions, useProducts } from '@/hooks/queries';
import { useListRealtime } from '@/hooks/useRealtime';
import { categoryById } from '@/lib/categories';
import { firstName, timeAgo } from '@/lib/format';
import { showDialog } from '@/lib/dialog';
import { formatBRL, formatQuantity, maskBRLInput, parseBRL } from '@/lib/money';
import { STATUS_LABEL } from '@/lib/status';
import { priceDifference, subtotal } from '@/lib/totals';
import { deleteProduct, togglePurchased, updateProduct } from '@/offline/sync';
import { useUserId } from '@/providers/AuthProvider';
import { normalizeUnit, quantityStep } from '@/lib/units';
import { UnitPicker } from '@/components/products/UnitPicker';
import type { Product } from '@/types/models';

type Tab = 'details' | 'chat';

export default function ProductScreen() {
  const { id, productId, tab: initialTab } = useLocalSearchParams<{ id: string; productId: string; tab?: Tab }>();
  const userId = useUserId();
  const insets = useSafeAreaInsets();
  const list = useList(id);
  const { products, isLoading } = useProducts(id);
  const approvals = useApprovals(id);
  const members = useMembers(id);
  const perms = usePermissions(id);
  const categories = useCategories();
  useListRealtime(id);

  const [tab, setTab] = useState<Tab>(initialTab === 'chat' ? 'chat' : 'details');
  const [pricing, setPricing] = useState(false);
  const [asking, setAsking] = useState(false);
  const [editing, setEditing] = useState(false);

  const product = products.find((p) => p.id === productId);
  const request = (approvals.data ?? []).find((a) => a.product_id === productId && a.status === 'pending');
  const names = useMemo(() => new Map((members.data ?? []).map((m) => [m.user_id, m.profile])), [members.data]);
  const readOnly = list.data?.status === 'completed';

  if (isLoading && !product) return <Screen><Loading /></Screen>;
  if (!product) {
    return (
      <Screen>
        <Header title="Produto" />
        <EmptyState icon="tag" title="Produto não encontrado" body="Ele pode ter sido removido da lista por outro participante." action={{ label: 'Voltar para a lista', onPress: () => router.replace(`/lists/${id}`) }} />
      </Screen>
    );
  }

  const diff = priceDifference(product);
  const category = categoryById(product.category_id, categories);
  const canPurchase = !readOnly && perms.can('product.purchase') && ['pending', 'in_review', 'approved', 'purchased'].includes(product.status);
  const canDelete = !readOnly && (perms.can('product.delete') || (product.added_by === userId && perms.can('product.create')));

  const changeStatus = () => {
    const opts = (['in_review', 'unavailable', 'cancelled', 'pending'] as const)
      .filter((s) => s !== product.status)
      .map((s) => ({ text: STATUS_LABEL[s], onPress: () => updateProduct(product, { status: s }) }));
    showDialog('Mudar status', product.name, [...opts, { text: 'Cancelar', style: 'cancel' as const }]);
  };

  const confirmDelete = () =>
    showDialog('Remover produto?', `“${product.name}” sai da lista para todos.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: () => {
          deleteProduct(product);
          // Aberto por link/notificação não há tela anterior: volta para a lista.
          if (router.canGoBack()) router.back();
          else router.replace(`/lists/${product.list_id}`);
        },
      },
    ]);

  return (
    <Screen padded={false}>
      <View style={{ paddingHorizontal: 12 }}>
        <Header title={product.name} subtitle={`${category.emoji} ${category.name} · ${list.data?.name ?? ''}`} right={<StatusBadge status={product.status} />} />
      </View>
      <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
        <Segmented<Tab> value={tab} onChange={setTab} options={[{ value: 'details', label: 'Detalhes' }, { value: 'chat', label: 'Conversa' }]} />
      </View>

      {tab === 'chat' ? (
        <View style={{ flex: 1, paddingBottom: insets.bottom }}>
          <ChatView listId={id} productId={product.id} readOnly={readOnly} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 32, gap: 14 }}>
          {request ? (
            <ApprovalCard
              request={request}
              product={product}
              requester={request.requested_by ? names.get(request.requested_by) : null}
              canRespond={request.requested_by !== userId && perms.can('approval.respond')}
            />
          ) : null}

          <Card style={{ gap: 12 }}>
            <Row label="Quantidade" value={formatQuantity(product.quantity, product.unit)} />
            <Divider />
            <Row label="Preço estimado" value={formatBRL(product.estimated_price)} />
            <Row label="Preço encontrado" value={formatBRL(product.actual_price)} />
            {diff != null ? <Row label="Diferença" value={formatBRL(diff, { signed: true })} tone={diff > 0 ? 'danger' : diff < 0 ? 'primary' : 'default'} /> : null}
            <Divider />
            <Row label="Subtotal" value={formatBRL(subtotal(product))} strong />
            {product.note ? (
              <>
                <Divider />
                <Text tone="subtle">“{product.note}”</Text>
              </>
            ) : null}
            <Text variant="caption" tone="muted">
              Adicionado por {firstName(names.get(product.added_by ?? '')?.name)}
              {product.updated_by && product.updated_at ? ` · alterado por ${firstName(names.get(product.updated_by)?.name)} ${timeAgo(product.updated_at)}` : ''}
              {product._pending ? ' · aguardando sincronização' : ''}
            </Text>
          </Card>

          {canPurchase ? (
            <Button
              label={product.status === 'purchased' ? 'Tirar do carrinho' : 'Marcar como comprado'}
              icon={product.status === 'purchased' ? 'close' : 'check'}
              variant={product.status === 'purchased' ? 'secondary' : 'primary'}
              onPress={() => togglePurchased(product)}
            />
          ) : null}
          {!readOnly ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {perms.can('product.price') ? <Button label="Preço" icon="tag" variant="soft" size="md" style={{ flex: 1 }} onPress={() => setPricing(true)} /> : null}
              {perms.can('product.update') ? <Button label="Editar" icon="edit" variant="soft" size="md" style={{ flex: 1 }} onPress={() => setEditing(true)} /> : null}
            </View>
          ) : null}
          {!readOnly && !request && perms.can('approval.request') && ['pending', 'in_review', 'approved'].includes(product.status) ? (
            <Button label="Perguntar ao parceiro" icon="question" variant="accent" onPress={() => setAsking(true)} />
          ) : null}
          {!readOnly && perms.can('product.update') && product.status !== 'awaiting_confirmation' ? (
            <Button label="Mudar status" variant="ghost" size="md" onPress={changeStatus} />
          ) : null}
          {canDelete ? <Button label="Remover da lista" icon="trash" variant="danger" size="md" onPress={confirmDelete} /> : null}
        </ScrollView>
      )}

      <PriceSheet product={product} visible={pricing} onClose={() => setPricing(false)} />
      <AskPartnerSheet listId={id} product={product} visible={asking} onClose={() => setAsking(false)} />
      <EditProductSheet product={product} visible={editing} onClose={() => setEditing(false)} />
    </Screen>
  );
}

function Row({ label, value, tone = 'default', strong }: { label: string; value: string; tone?: 'default' | 'danger' | 'primary'; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text tone="muted">{label}</Text>
      <Text variant={strong ? 'subheading' : 'bodyStrong'} tone={tone} style={{ fontVariant: ['tabular-nums'] }}>{value}</Text>
    </View>
  );
}

function EditProductSheet({ product, visible, onClose }: { product: Product; visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Editar produto">
      {visible ? <EditProductForm key={product.id} product={product} onClose={onClose} /> : null}
    </Sheet>
  );
}

function EditProductForm({ product, onClose }: { product: Product; onClose: () => void }) {
  const categories = useCategories();
  const [name, setName] = useState(product.name);
  const [quantity, setQuantity] = useState(product.quantity);
  const [unit, setUnit] = useState<string | null>(product.unit);
  const [category, setCategory] = useState(product.category_id);
  const [estimated, setEstimated] = useState(() =>
    product.estimated_price != null ? maskBRLInput(Math.round(product.estimated_price * 100).toString()) : '',
  );
  const [note, setNote] = useState(product.note ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const est = estimated ? parseBRL(estimated) : null;
    if (!name.trim()) return setError('Digite o nome do produto.');
    if (estimated && est == null) return setError('Digite um preço válido, como 12,90.');
    updateProduct(product, { name: name.trim(), quantity, unit: normalizeUnit(unit), category_id: category, estimated_price: est, note: note.trim() || null });
    onClose();
  };

 return (
    <>
      <Input label="Produto" value={name} onChangeText={setName} maxLength={120} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ gap: 6 }}>
          <Text variant="bodyStrong" style={{ fontSize: 14 }}>Quantidade</Text>
          <Stepper label="Quantidade" value={quantity} onChange={setQuantity} step={quantityStep(unit)} min={quantityStep(unit)} />
        </View>
        <View style={{ flex: 1, minWidth: 140 }}>
          <Input
            label="Preço estimado"
            placeholder="R$ 0,00"
            keyboardType="number-pad"
            value={estimated}
            onChangeText={(t) => setEstimated(maskBRLInput(t))}
            hint={unit ? `por ${unit}` : 'por unidade (opcional)'}
          />
        </View>
      </View>
      <UnitPicker value={unit} onChange={setUnit} />
      <Chips label="Categoria" value={category} onChange={setCategory} options={categories.map((c) => ({ value: c.id, label: `${c.emoji} ${c.name}` }))} />
      <Input label="Observação" value={note} onChangeText={setNote} maxLength={500} error={error} />
      <Button label="Salvar alterações" onPress={save} />
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
});

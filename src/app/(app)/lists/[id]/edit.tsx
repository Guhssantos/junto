import { useMutation } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Button, Header, Input, Loading, Screen } from '@/components/ui';
import { useList } from '@/hooks/queries';
import { AppError, toAppError } from '@/lib/errors';
import { formatDate, parseBRDate } from '@/lib/format';
import { queryClient } from '@/lib/queryClient';
import { qk } from '@/lib/queryKeys';
import { showToast } from '@/lib/toast';
import { updateList } from '@/services/lists';
import type { ShoppingList } from '@/types/models';

export default function EditList() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const list = useList(id);
  if (!list.data) return <Screen><Loading /></Screen>;
  return <EditListForm key={list.data.id} list={list.data} />;
}

function EditListForm({ list }: { list: ShoppingList }) {
  const id = list.id;
  const [name, setName] = useState(list.name);
  const [description, setDescription] = useState(list.description ?? '');
  const [date, setDate] = useState(list.purchase_date ? formatDate(list.purchase_date) : '');
  const [note, setNote] = useState(list.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => {
      const purchase_date = date.trim() ? parseBRDate(date) : null;
      if (date.trim() && !purchase_date) throw new AppError('validation', 'Use o formato dd/mm/aaaa na data.');
      if (!name.trim()) throw new AppError('validation', 'Dê um nome para a lista.');
      return updateList(id, { name: name.trim(), description: description.trim() || null, note: note.trim() || null, purchase_date });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.list(id) });
      queryClient.invalidateQueries({ queryKey: qk.allLists });
      showToast('Lista atualizada', 'success');
      if (router.canGoBack()) router.back();
      else router.replace(`/lists/${id}`);
    },
    onError: (e) => setError(toAppError(e).message),
  });

  return (
    <Screen scroll edges={['top', 'bottom']} style={{ gap: 18 }}>
      <Header title="Editar lista" />
      <Input label="Nome da lista" value={name} onChangeText={setName} maxLength={80} />
      <Input label="Descrição" value={description} onChangeText={setDescription} maxLength={500} />
      <Input label="Data da compra" placeholder="dd/mm/aaaa" value={date} onChangeText={setDate} maxLength={10} keyboardType="numbers-and-punctuation" />
      <Input label="Observação" value={note} onChangeText={setNote} maxLength={500} multiline error={error} />
      <Button label="Salvar" loading={save.isPending} onPress={() => save.mutate()} />
    </Screen>
  );
}

import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';

import { Button, Header, Input, Screen } from '@/components/ui';
import { toAppError } from '@/lib/errors';
import { formatDate, parseBRDate } from '@/lib/format';
import { queryClient } from '@/lib/queryClient';
import { qk } from '@/lib/queryKeys';
import { createList } from '@/services/lists';

export default function NewList() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(formatDate(new Date().toISOString()));
  const [note, setNote] = useState('');
  const [error, setError] = useState<{ field: 'name' | 'date' | 'form'; msg: string } | null>(null);

  const m = useMutation({
    mutationFn: () => {
      const purchaseDate = date.trim() ? parseBRDate(date) : null;
      if (date.trim() && !purchaseDate) {
        setError({ field: 'date', msg: 'Use o formato dd/mm/aaaa.' });
        throw new Error('date');
      }
      return createList({ name, description, purchaseDate, note });
    },
    onSuccess: (list) => {
      queryClient.invalidateQueries({ queryKey: qk.allLists });
      router.replace(`/lists/${list.id}`);
    },
    onError: (e) => {
      if (e instanceof Error && e.message === 'date') return;
      const err = toAppError(e);
      setError({ field: err.kind === 'validation' ? 'name' : 'form', msg: err.message });
    },
  });

  return (
    <Screen scroll edges={['top', 'bottom']} style={{ gap: 18 }}>
      <Header title="Nova lista" />
      <Input label="Nome da lista" placeholder="Ex.: Compra do mês" value={name} onChangeText={setName} maxLength={80} autoFocus error={error?.field === 'name' ? error.msg : null} />
      <Input label="Descrição (opcional)" placeholder="Ex.: Compras da semana" value={description} onChangeText={setDescription} maxLength={500} />
      <Input label="Data da compra" placeholder="dd/mm/aaaa" value={date} onChangeText={setDate} keyboardType="numbers-and-punctuation" maxLength={10} error={error?.field === 'date' ? error.msg : null} />
      <Input label="Observação (opcional)" placeholder="Ex.: Passar no hortifruti antes" value={note} onChangeText={setNote} maxLength={500} multiline error={error?.field === 'form' ? error.msg : null} />
      <Button label="Criar lista" onPress={() => m.mutate()} loading={m.isPending} disabled={!name.trim()} />
    </Screen>
  );
}

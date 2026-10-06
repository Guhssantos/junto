import { router } from 'expo-router';
import { FlatList } from 'react-native';

import { ListCard } from '@/components/lists/ListCard';
import { EmptyState, ErrorState, Header, Loading, Screen } from '@/components/ui';
import { useLists } from '@/hooks/queries';
import { toAppError } from '@/lib/errors';

/** Compras finalizadas. Ao abrir, mostra itens e valores daquela compra. */
export default function History() {
  const { data, isLoading, error, refetch } = useLists('completed');
  return (
    <Screen padded={false}>
      <Header title="Histórico de compras" />
      {isLoading && !data ? (
        <Loading />
      ) : error && !data ? (
        <ErrorState message={toAppError(error).message} onRetry={() => refetch()} />
      ) : !data?.length ? (
        <EmptyState icon="history" title="Nenhuma compra finalizada" body="Quando você finalizar uma compra, ela aparece aqui com todos os itens e valores." />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(l) => l.id}
          contentContainerStyle={{ padding: 20, gap: 12 }}
          renderItem={({ item }) => <ListCard list={item} onPress={() => router.push(`/lists/${item.id}/done`)} />}
        />
      )}
    </Screen>
  );
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { defaultShouldDehydrateQuery, type Query, QueryClient } from '@tanstack/react-query';

import { isNetworkError } from './errors';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 1000 * 60 * 60 * 24 * 7, // mantém 7 dias para uso offline
      retry: (count, err) => isNetworkError(err) && count < 2,
      networkMode: 'offlineFirst',
      refetchOnWindowFocus: true,
    },
    mutations: { networkMode: 'always', retry: false },
  },
});

// Cache persistido no aparelho: a lista abre mesmo sem sinal dentro do mercado.
export const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'junto.query-cache.v1',
  throttleTime: 1000,
});

export const PERSIST_MAX_AGE = 1000 * 60 * 60 * 24 * 7;

/** Não guarda no aparelho o que expira (ex.: URL assinada de foto, `meta: { persist: false }`). */
export function shouldPersistQuery(query: Query): boolean {
  return query.meta?.persist !== false && defaultShouldDehydrateQuery(query);
}

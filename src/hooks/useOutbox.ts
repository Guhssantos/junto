import { useSyncExternalStore } from 'react';

import { getConflicts, subscribeConflicts } from '@/offline/conflicts';
import { getOutbox, subscribeOutbox } from '@/offline/outbox';

export function useOutbox() {
  return useSyncExternalStore(subscribeOutbox, getOutbox, getOutbox);
}

export function useConflicts() {
  return useSyncExternalStore(subscribeConflicts, getConflicts, getConflicts);
}

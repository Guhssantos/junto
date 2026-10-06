// Avisos rápidos (toasts) disparáveis de qualquer lugar — UI em components/ui/Toast.tsx.
export type ToastKind = 'info' | 'success' | 'error' | 'warning';
export interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
  action?: { label: string; onPress: () => void };
}

let seq = 0;
let items: ToastItem[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function showToast(message: string, kind: ToastKind = 'info', action?: ToastItem['action']) {
  const item = { id: ++seq, message, kind, action };
  items = [...items.slice(-2), item];
  emit();
  // Avisos com ação (ex.: Desfazer) ficam mais tempo para dar tempo de tocar.
  setTimeout(() => dismissToast(item.id), kind === 'error' || action ? 5000 : 3200);
}

export function dismissToast(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

export const toastStore = {
  get: () => items,
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

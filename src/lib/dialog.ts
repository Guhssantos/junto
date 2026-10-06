import { Alert, Platform } from 'react-native';

// Diálogos de confirmação/escolha que funcionam em Android, iOS e navegador.
// No celular usa o alerta nativo; na web (onde Alert.alert com botões não faz nada)
// a UI é desenhada pelo DialogHost em components/ui/Dialog.tsx.
export interface DialogButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

export interface DialogItem {
  id: number;
  title: string;
  message?: string;
  buttons: DialogButton[];
}

let seq = 0;
let items: DialogItem[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function showDialog(title: string, message?: string, buttons: DialogButton[] = [{ text: 'OK' }]) {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }
  items = [...items, { id: ++seq, title, message, buttons }];
  emit();
}

export function closeDialog(id: number) {
  items = items.filter((d) => d.id !== id);
  emit();
}

export const dialogStore = {
  get: () => items,
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

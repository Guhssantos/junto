import { Alert, Platform } from 'react-native';

import { closeDialog, dialogStore, showDialog } from '@/lib/dialog';
import { buildInviteLink, clearPendingInvite, peekPendingInvite, rememberPendingInvite, takePendingInvite } from '@/lib/invite';

const setOS = (os: typeof Platform.OS) => Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
const original = Platform.OS;

afterEach(() => {
  setOS(original);
  dialogStore.get().forEach((d) => closeDialog(d.id));
  jest.restoreAllMocks();
});

describe('showDialog', () => {
  it('usa o alerta nativo no celular', () => {
    const spy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    showDialog('Excluir?', 'Sem volta', [{ text: 'Cancelar', style: 'cancel' }]);
    expect(spy).toHaveBeenCalledWith('Excluir?', 'Sem volta', [{ text: 'Cancelar', style: 'cancel' }]);
    expect(dialogStore.get()).toHaveLength(0);
  });

  it('na web enfileira o diálogo para o DialogHost (Alert.alert não funciona no navegador)', () => {
    setOS('web');
    const spy = jest.spyOn(Alert, 'alert');
    const onPress = jest.fn();
    showDialog('Sair da lista?', undefined, [{ text: 'Sair', style: 'destructive', onPress }]);
    expect(spy).not.toHaveBeenCalled();
    const [item] = dialogStore.get();
    expect(item.title).toBe('Sair da lista?');
    item.buttons[0].onPress?.();
    expect(onPress).toHaveBeenCalled();
    closeDialog(item.id);
    expect(dialogStore.get()).toHaveLength(0);
  });
});

describe('links de convite na web', () => {
  it('usam o endereço do próprio site quando não há domínio configurado', () => {
    setOS('web');
    const loc = { origin: 'https://junto.pages.dev' };
    Object.defineProperty(globalThis, 'location', { value: loc, configurable: true });
    expect(buildInviteLink('ABCD-1234')).toBe('https://junto.pages.dev/join/ABCD-1234');
  });
});

describe('convite aberto antes do login', () => {
  it('é lembrado uma única vez e só aceita rotas de convite', () => {
    rememberPendingInvite('/join/ABCD-1234');
    expect(takePendingInvite()).toBe('/join/ABCD-1234');
    expect(takePendingInvite()).toBeNull();
    rememberPendingInvite('https://malicioso.com');
    expect(takePendingInvite()).toBeNull();
  });

  it('pode ser lido várias vezes durante a renderização e só some quando o convite abre', () => {
    rememberPendingInvite('/join/WXYZ-9876');
    expect(peekPendingInvite()).toBe('/join/WXYZ-9876');
    expect(peekPendingInvite()).toBe('/join/WXYZ-9876');
    clearPendingInvite();
    expect(peekPendingInvite()).toBeNull();
  });
});

import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * true enquanto o teclado virtual está aberto. Usado para esconder a barra de abas
 * e dar o espaço da tela aos campos.
 * - App nativo: eventos do teclado.
 * - Navegador: a área visível (visualViewport) encolhe bastante com um campo focado.
 */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setVisible(true));
      const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setVisible(false));
      return () => {
        show.remove();
        hide.remove();
      };
    }
    const vv = globalThis.visualViewport;
    if (!vv) return;
    let fullHeight = Math.max(vv.height, globalThis.innerHeight ?? 0);
    const check = () => {
      if (vv.scale > 1.01) return;
      const el = globalThis.document?.activeElement;
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
      if (!typing) fullHeight = Math.max(fullHeight, vv.height);
      setVisible(typing && vv.height < fullHeight * 0.8);
    };
    const onOrientation = () => {
      fullHeight = vv.height;
      check();
    };
    vv.addEventListener('resize', check);
    globalThis.addEventListener?.('orientationchange', onOrientation);
    globalThis.document?.addEventListener('focusout', check);
    return () => {
      vv.removeEventListener('resize', check);
      globalThis.removeEventListener?.('orientationchange', onOrientation);
      globalThis.document?.removeEventListener('focusout', check);
    };
  }, []);

  return visible;
}

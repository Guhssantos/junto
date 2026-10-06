import { useWindowDimensions } from 'react-native';

// Pontos de quebra do layout (celular, tablet, notebook/desktop).
export const BREAKPOINT_TABLET = 768;
export const BREAKPOINT_DESKTOP = 1024;
/** Largura máxima do app em telas grandes. */
export const FRAME_MAX_WIDTH = 1080;
/** Largura confortável para formulários e listas de leitura. */
export const CONTENT_MAX_WIDTH = 720;

export function useLayout() {
  const { width, height } = useWindowDimensions();
  const isDesktop = width >= BREAKPOINT_DESKTOP;
  const isTablet = !isDesktop && width >= BREAKPOINT_TABLET;
  const isPhone = width < BREAKPOINT_TABLET;
  const frameWidth = Math.min(width, FRAME_MAX_WIDTH);
  return {
    width,
    height,
    isPhone,
    isTablet,
    isDesktop,
    landscape: width > height,
    frameWidth,
    /** Colunas para grades de cartões (ex.: listas na Início). */
    columns: frameWidth >= 1000 ? 3 : frameWidth >= 700 ? 2 : 1,
  };
}

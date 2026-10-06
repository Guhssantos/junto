import { useEffect, useState, type ReactNode } from 'react';
import { Animated, PanResponder, Platform, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

import { Icon } from './Icon';
import { Text } from './Text';

const NATIVE_DRIVER = Platform.OS !== 'web';

/** Estado do gesto fora do React (criado uma vez por linha). */
function createSwipe() {
  const x = new Animated.Value(0);
  let width = 360;
  let onDelete = () => {};
  let done = false;
  const reset = () => Animated.spring(x, { toValue: 0, useNativeDriver: NATIVE_DRIVER, bounciness: 6 }).start();
  const responder = PanResponder.create({
    // Só assume o gesto quando ele é claramente horizontal.
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6,
    onMoveShouldSetPanResponderCapture: (_e, g) => Math.abs(g.dx) > 18 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_e, g) => x.setValue(g.dx),
    onPanResponderRelease: (_e, g) => {
      if (!done && (Math.abs(g.dx) > width * 0.35 || Math.abs(g.vx) > 1.2)) {
        done = true;
        const dir = g.dx >= 0 ? 1 : -1;
        Animated.timing(x, { toValue: dir * width * 1.1, duration: 180, useNativeDriver: NATIVE_DRIVER }).start(() => onDelete());
      } else reset();
    },
    onPanResponderTerminate: reset,
  });
  return {
    x,
    handlers: responder.panHandlers,
    setWidth: (w: number) => {
      width = w;
    },
    setOnDelete: (fn: () => void) => {
      onDelete = fn;
    },
  };
}

/**
 * Deslize para a esquerda ou para a direita para excluir (como em apps de e-mail).
 * Feito com PanResponder + Animated do React Native: funciona no Android, iPhone,
 * navegador (toque e mouse) e Expo Go, sem biblioteca nativa extra.
 * Movimentos verticais continuam rolando a lista normalmente.
 */
export function SwipeToDelete({ children, onDelete, label = 'Excluir', radius = 18 }: { children: ReactNode; onDelete: () => void; label?: string; radius?: number }) {
  const { colors } = useTheme();
  const [swipe] = useState(createSwipe);
  const { x } = swipe;
  useEffect(() => swipe.setOnDelete(onDelete), [swipe, onDelete]);

  const leftOpacity = x.interpolate({ inputRange: [0, 40], outputRange: [0, 1], extrapolate: 'clamp' });
  const rightOpacity = x.interpolate({ inputRange: [-40, 0], outputRange: [1, 0], extrapolate: 'clamp' });

  return (
    <View
      onLayout={(e) => swipe.setWidth(e.nativeEvent.layout.width)}
      style={[styles.wrap, { borderRadius: radius }]}
    >
      <View
        style={[StyleSheet.absoluteFill, styles.behind, { backgroundColor: colors.danger }]}
        pointerEvents="none"
        // Só visual: leitores de tela usam o botão "Excluir" de cada item.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        aria-hidden
      >
        <Animated.View style={[styles.side, { opacity: leftOpacity }]}>
          <Icon name="trash" size={20} color="#FFFFFF" />
          <Text variant="caption" style={{ color: '#FFFFFF' }}>{label}</Text>
        </Animated.View>
        <Animated.View style={[styles.side, { opacity: rightOpacity }]}>
          <Text variant="caption" style={{ color: '#FFFFFF' }}>{label}</Text>
          <Icon name="trash" size={20} color="#FFFFFF" />
        </Animated.View>
      </View>
      <Animated.View
        {...swipe.handlers}
        // Web: o navegador rola na vertical e entrega o arrasto horizontal ao app;
        // com mouse, arrastar não seleciona o texto.
        style={[{ transform: [{ translateX: x }], backgroundColor: colors.bg }, Platform.OS === 'web' ? ({ touchAction: 'pan-y', userSelect: 'none' } as object) : null]}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
  behind: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20 },
  side: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});

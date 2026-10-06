import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, Text, type IconName } from '@/components/ui';
import { useKeyboardVisible } from '@/hooks/useKeyboard';
import { useUnreadCount } from '@/hooks/queries';
import { useTheme } from '@/theme/ThemeProvider';

const TABS: Record<string, { label: string; icon: IconName }> = {
  home: { label: 'Início', icon: 'home' },
  shopping: { label: 'Compras', icon: 'cart' },
  notifications: { label: 'Alertas', icon: 'bell' },
  chats: { label: 'Conversas', icon: 'chat' },
  profile: { label: 'Perfil', icon: 'user' },
};

function TabBar({ state, navigation, insets }: BottomTabBarProps) {
  const { colors } = useTheme();
  const unread = useUnreadCount();
  // Teclado aberto: a barra some e o espaço fica para o campo que está sendo preenchido.
  if (useKeyboardVisible()) return null;
  return (
    <View
      accessibilityRole="tablist"
      style={[styles.bar, { backgroundColor: colors.surface, borderTopColor: colors.line, paddingBottom: Math.max(insets.bottom, 10) }]}
    >
      {state.routes.map((route, index) => {
        const tab = TABS[route.name];
        if (!tab) return null;
        const focused = state.index === index;
        const color = focused ? colors.primary : colors.textMuted;
        const badge = route.name === 'notifications' && unread > 0 ? (unread > 99 ? '99+' : String(unread)) : null;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={badge ? `${tab.label}, ${badge} não lidas` : tab.label}
            onPress={() => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
            }}
            style={styles.item}
          >
            <Icon name={tab.icon} size={24} color={color} />
            <Text variant="micro" style={{ color, fontFamily: focused ? 'Manrope_800ExtraBold' : 'Manrope_600SemiBold' }}>{tab.label}</Text>
            {badge ? (
              <View style={[styles.badge, { backgroundColor: colors.accent }]}>
                <Text variant="micro" style={{ color: colors.onAccent }}>{badge}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="home" />
      <Tabs.Screen name="shopping" />
      <Tabs.Screen name="notifications" />
      <Tabs.Screen name="chats" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, paddingHorizontal: 8 },
  item: { flex: 1, alignItems: 'center', gap: 4, minHeight: 52 },
  badge: { position: 'absolute', top: -4, left: '52%', minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
});

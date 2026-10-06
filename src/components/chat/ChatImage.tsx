import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, IconButton, Text } from '@/components/ui';
import { signedImageUrl } from '@/services/chatImages';
import { useTheme } from '@/theme/ThemeProvider';

/** Tamanho da foto na conversa: respeita a proporção, até ~260 px de largura. */
function fitSize(w: number | null | undefined, h: number | null | undefined, maxW: number) {
  const ratio = w && h ? h / w : 3 / 4;
  const width = Math.min(maxW, 260);
  return { width, height: Math.min(Math.round(width * ratio), 340) };
}

/** Foto de uma mensagem. Bucket privado → URL assinada, renovada quando expira. */
export function ChatImage({ path, localUri, width, height, pending }: { path?: string | null; localUri?: string; width?: number | null; height?: number | null; pending?: boolean }) {
  const { colors } = useTheme();
  const { width: screenW } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const signed = useQuery({
    queryKey: ['chat-image', path],
    queryFn: () => signedImageUrl(path!),
    enabled: !!path && !localUri,
    staleTime: 50 * 60_000,
    gcTime: 55 * 60_000,
    meta: { persist: false },
  });
  const uri = localUri ?? signed.data;
  const size = fitSize(width, height, screenW * 0.7);

  return (
    <>
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel="Foto. Toque para ampliar"
        onPress={() => uri && setOpen(true)}
        style={[styles.thumb, size, { backgroundColor: colors.sunken }]}
      >
        {uri && !failed ? (
          <Image
            source={{ uri }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            onError={() => {
              // URL assinada expirada: pede uma nova uma vez.
              if (!localUri && path) void signed.refetch();
              else setFailed(true);
            }}
          />
        ) : failed || signed.error ? (
          <View style={styles.center}>
            <Icon name="image" size={28} color={colors.textMuted} />
            <Text variant="caption" tone="muted">Foto indisponível</Text>
          </View>
        ) : (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}
        {pending ? (
          <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: 'rgba(0,0,0,0.35)' }]}>
            <ActivityIndicator color="#FFFFFF" />
          </View>
        ) : null}
      </Pressable>
      {open && uri ? <ImageViewer uri={uri} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function ImageViewer({ uri, onClose }: { uri: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.viewer}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Fechar foto" />
        <Image source={{ uri }} style={styles.full} resizeMode="contain" accessibilityLabel="Foto ampliada" />
        <View style={[styles.close, { top: insets.top + 12 }]}>
          <IconButton icon="close" label="Fechar" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  thumb: { borderRadius: 14, overflow: 'hidden' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  full: { width: '100%', height: '85%' },
  close: { position: 'absolute', right: 16 },
});

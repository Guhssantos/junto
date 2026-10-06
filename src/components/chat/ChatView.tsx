import { useMemo, useRef, useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { EmptyState, ErrorState, Icon, Loading, Text } from '@/components/ui';
import { useMembers, useMessages, usePermissions } from '@/hooks/queries';
import { toAppError } from '@/lib/errors';
import { showToast } from '@/lib/toast';
import { firstName, formatTime } from '@/lib/format';
import { sendImageMessage, sendMessage } from '@/offline/sync';
import { pickChatImage, type PickedImage } from '@/services/chatImages';
import { useUserId } from '@/providers/AuthProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { font } from '@/theme/tokens';
import type { Message } from '@/types/models';

import { ChatImage } from './ChatImage';
import { ImagePreviewSheet } from './ImagePreviewSheet';

/** Conversa da lista (productId = null) ou de um produto específico. */
export function ChatView({ listId, productId, readOnly }: { listId: string; productId: string | null; readOnly?: boolean }) {
  const userId = useUserId();
  const { colors } = useTheme();
  const { data, isLoading, error, refetch } = useMessages(listId, productId);
  const members = useMembers(listId);
  const perms = usePermissions(listId);
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<{ image: PickedImage; source: 'camera' | 'library' } | null>(null);
  const [sendingPhoto, setSendingPhoto] = useState(false);

  const pick = async (source: 'camera' | 'library') => {
    try {
      const image = await pickChatImage(source);
      if (image) setPhoto({ image, source });
    } catch (e) {
      showToast(toAppError(e, 'Não conseguimos abrir a câmera/galeria.').message, 'error');
    }
  };

  const sendPhoto = async (caption: string) => {
    if (!photo) return;
    setSendingPhoto(true);
    try {
      // A foto aparece na conversa na hora ("enviando…"); a folha fecha logo.
      const p = sendImageMessage(listId, userId, photo.image, caption, productId);
      setPhoto(null);
      await p;
    } catch (e) {
      showToast(toAppError(e, 'Não conseguimos enviar a foto.').message, 'error');
    } finally {
      setSendingPhoto(false);
    }
  };

  const names = useMemo(() => {
    const m = new Map<string, string>();
    members.data?.forEach((x) => m.set(x.user_id, firstName(x.profile?.name)));
    return m;
  }, [members.data]);

  // Celular: lista invertida (mais nova embaixo, padrão de chat). Na web o "inverted" do
  // FlatList é aplicado duas vezes (React Native + react-native-web) e a ordem saía trocada:
  // lá a lista fica na ordem natural e rola sozinha até a última mensagem.
  const INVERTED = Platform.OS !== 'web';
  const listRef = useRef<FlatList<Message>>(null);
  const items = useMemo(() => (INVERTED ? [...(data ?? [])].reverse() : (data ?? [])), [data, INVERTED]);
  const canSend = !readOnly && perms.can('chat.send');

  const send = () => {
    if (!text.trim()) return;
    try {
      sendMessage(listId, userId, text, productId);
      setText('');
    } catch (e) {
      // Nunca falhar em silêncio: a mensagem continua no campo para tentar de novo.
      showToast(toAppError(e, 'Não conseguimos enviar a mensagem.').message, 'error');
    }
  };

  const renderItem = ({ item }: { item: Message }) => {
    const mine = item._pending || item.sender_id === userId;
    const name = item.sender_id ? names.get(item.sender_id) ?? 'Participante' : item._pending ? 'Você' : 'Usuário removido';
    return (
      <View style={[styles.msgWrap, { alignItems: mine ? 'flex-end' : 'flex-start' }]}>
        <View
          style={[
            styles.bubble,
            mine
              ? { backgroundColor: colors.primary, borderBottomRightRadius: 6 }
              : { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderBottomLeftRadius: 6 },
          ]}
        >
          {item.image_path || item._localUri ? (
            <ChatImage path={item.image_path} localUri={item._localUri} width={item.image_width} height={item.image_height} pending={item._pending} />
          ) : null}
          {item.body ? <Text style={{ color: mine ? colors.onPrimary : colors.text }}>{item.body}</Text> : null}
        </View>
        <Text variant="micro" tone="muted" style={{ fontFamily: font.semibold }}>
          {mine ? 'Você' : name} · {formatTime(item.created_at)}
          {item._pending ? ' · enviando…' : ''}
        </Text>
      </View>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      {isLoading ? (
        <Loading label="Carregando conversa…" />
      ) : error && !data ? (
        <ErrorState message={toAppError(error).message} onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon="chat"
          title={productId ? 'Converse sobre este produto' : 'Nenhuma mensagem ainda'}
          body={productId ? 'Marca, tamanho, substituto… tudo fica guardado aqui, junto do produto.' : 'Combine a compra com quem participa da lista.'}
        />
      ) : (
        <FlatList
          ref={listRef}
          data={items}
          inverted={INVERTED}
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          contentContainerStyle={[{ padding: 16, gap: 10 }, !INVERTED && { flexGrow: 1, justifyContent: 'flex-end' }]}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => {
            if (!INVERTED) listRef.current?.scrollToEnd({ animated: false });
          }}
        />
      )}
      {canSend ? (
        <View style={[styles.composer, { backgroundColor: colors.surface, borderTopColor: colors.line }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Tirar foto" onPress={() => void pick('camera')} style={styles.attach} hitSlop={4}>
            <Icon name="camera" size={22} color={colors.textSubtle} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Enviar imagem da galeria" onPress={() => void pick('library')} style={styles.attach} hitSlop={4}>
            <Icon name="image" size={22} color={colors.textSubtle} />
          </Pressable>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={productId ? 'Mensagem sobre este produto' : 'Mensagem para a lista'}
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Mensagem"
            multiline
            maxLength={2000}
            // Computador: Enter envia, Shift+Enter quebra a linha.
            onKeyPress={
              Platform.OS === 'web'
                ? (e) => {
                    const ev = e.nativeEvent as unknown as { key: string; shiftKey?: boolean; isComposing?: boolean };
                    if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) {
                      (e as unknown as { preventDefault: () => void }).preventDefault();
                      send();
                    }
                  }
                : undefined
            }
            style={[styles.input, { backgroundColor: colors.bg, borderColor: colors.line, color: colors.text }]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Enviar mensagem"
            onPress={send}
            disabled={!text.trim()}
            style={[styles.send, { backgroundColor: text.trim() ? colors.primary : colors.sunken }]}
          >
            <Icon name="send" size={20} color={text.trim() ? colors.onPrimary : colors.textMuted} />
          </Pressable>
        </View>
      ) : null}
      <ImagePreviewSheet
        key={photo?.image.uri ?? 'none'}
        image={photo?.image ?? null}
        sending={sendingPhoto}
        onCancel={() => setPhoto(null)}
        onSend={(caption) => void sendPhoto(caption)}
        onRetake={photo ? () => void pick(photo.source) : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  msgWrap: { gap: 4 },
  bubble: { maxWidth: '82%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, gap: 6 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, minHeight: 48, maxHeight: 120, borderRadius: 24, borderWidth: 1.5, paddingHorizontal: 18, paddingTop: 13, paddingBottom: 12, fontFamily: font.medium, fontSize: 16 },
  send: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  attach: { width: 40, height: 48, alignItems: 'center', justifyContent: 'center' },
});

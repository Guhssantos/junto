import { useState } from 'react';
import { Image, StyleSheet, View, useWindowDimensions } from 'react-native';

import { Button, Input, Sheet } from '@/components/ui';
import type { PickedImage } from '@/services/chatImages';

/** Pré-visualização da foto antes de enviar, com legenda opcional. */
export function ImagePreviewSheet({
  image,
  sending,
  onCancel,
  onSend,
  onRetake,
}: {
  image: PickedImage | null;
  sending: boolean;
  onCancel: () => void;
  onSend: (caption: string) => void;
  onRetake?: () => void;
}) {
  const [caption, setCaption] = useState('');
  const { height: screenH } = useWindowDimensions();
  const ratio = image && image.width ? image.height / image.width : 1;
  const maxH = Math.max(180, Math.min(420, screenH * 0.45));

  return (
    <Sheet visible={!!image} onClose={sending ? () => undefined : onCancel} title="Enviar foto">
      {image ? (
        <>
          <View style={[styles.frame, { height: maxH }]}>
            <Image
              source={{ uri: image.uri }}
              style={{ width: '100%', height: '100%', aspectRatio: ratio ? 1 / ratio : undefined }}
              resizeMode="contain"
              accessibilityLabel="Pré-visualização da foto"
            />
          </View>
          <Input
            label="Legenda (opcional)"
            placeholder="Ex.: é essa marca?"
            value={caption}
            onChangeText={setCaption}
            maxLength={2000}
            returnKeyType="send"
            onSubmitEditing={() => !sending && onSend(caption)}
          />
          <Button label="Enviar foto" icon="send" loading={sending} onPress={() => onSend(caption)} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {onRetake ? <Button label="Escolher outra" variant="secondary" size="md" style={{ flex: 1 }} disabled={sending} onPress={onRetake} /> : null}
            <Button label="Cancelar" variant="ghost" size="md" style={{ flex: 1 }} disabled={sending} onPress={onCancel} />
          </View>
        </>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', borderRadius: 16, overflow: 'hidden', backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
});

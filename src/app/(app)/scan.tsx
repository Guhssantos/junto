import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, Header, Icon, IconButton, Screen, Text } from '@/components/ui';
import { parseInvite } from '@/lib/invite';
import { canReadQrFromPhoto, canUseLiveCamera, pickImage, readQrFromImage } from '@/lib/qrImage';
import { showToast } from '@/lib/toast';
import { useTheme } from '@/theme/ThemeProvider';

/** Leitor do QR Code de convite. Só aceita QR Codes do Junto. */
export default function Scan() {
  // Decidido uma vez: hooks de câmera só existem onde a câmera ao vivo é possível.
  const [live] = useState(canUseLiveCamera);
  return live ? <LiveScanner /> : <PhotoScanner reason="insecure" />;
}

function openInvite(data: string): boolean {
  const code = parseInvite(data);
  if (!code) {
    showToast('Este QR Code não é um convite do Junto.', 'warning');
    return false;
  }
  router.replace(`/join/${code}`);
  return true;
}

/** Câmera ao vivo: app nativo e site em HTTPS/localhost. */
function LiveScanner() {
  const [permission, requestPermission] = useCameraPermissions();
  const [asking, setAsking] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const handled = useRef(false);
  const insets = useSafeAreaInsets();

  if (!permission) return <Screen />;

  if (cameraError) return <PhotoScanner reason="no_camera" />;

  if (!permission.granted) {
    const ask = async () => {
      setAsking(true);
      try {
        const res = await requestPermission();
        if (!res.granted && Platform.OS === 'web') showToast('A câmera foi bloqueada no navegador.', 'warning');
      } catch {
        setCameraError(true);
      } finally {
        setAsking(false);
      }
    };
    return <PermissionNeeded canAskAgain={permission.canAskAgain} asking={asking} onAsk={ask} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onMountError={() => setCameraError(true)}
        onBarcodeScanned={({ data }) => {
          if (handled.current) return;
          if (openInvite(data)) handled.current = true;
        }}
      />
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <IconButton icon="close" label="Fechar" onPress={() => (router.canGoBack() ? router.back() : router.replace('/join'))} />
      </View>
      <View style={styles.frame} pointerEvents="none" />
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 24 }]}>
        <Text variant="bodyStrong" style={{ color: '#FFFFFF', textAlign: 'center' }}>Aponte para o QR Code da lista</Text>
        <Button label="Digitar código" variant="secondary" size="md" onPress={() => router.replace('/join')} />
      </View>
    </View>
  );
}

function PermissionNeeded({ canAskAgain, asking, onAsk }: { canAskAgain: boolean; asking: boolean; onAsk: () => void }) {
  const { colors } = useTheme();
  const web = Platform.OS === 'web';
  return (
    <Screen scroll style={{ gap: 16 }}>
      <Header title="Ler QR Code" />
      <View style={{ alignItems: 'center', gap: 12, paddingVertical: 12 }}>
        <View style={[styles.bigIcon, { backgroundColor: colors.primarySoft }]}>
          <Icon name="camera" size={32} color={colors.primary} />
        </View>
        <Text variant="subheading" style={{ textAlign: 'center' }}>Permita o uso da câmera</Text>
        <Text tone="muted" style={{ textAlign: 'center', maxWidth: 340 }}>
          A câmera é usada apenas para ler o QR Code do convite. Nenhuma imagem é guardada.
        </Text>
      </View>
      {canAskAgain ? (
        <Button label="Permitir câmera" icon="camera" loading={asking} onPress={onAsk} />
      ) : web ? (
        <Card style={{ gap: 6 }}>
          <Text variant="bodyStrong">A câmera está bloqueada para este site</Text>
          <Text tone="muted">
            Toque no ícone de cadeado (ou de câmera) ao lado do endereço, permita a Câmera e recarregue a página.
          </Text>
        </Card>
      ) : (
        <Button label="Abrir configurações do aparelho" icon="camera" onPress={() => void Linking.openSettings()} />
      )}
      {canReadQrFromPhoto ? <PhotoButtons /> : null}
      <Button label="Digitar código" variant="ghost" size="md" onPress={() => router.replace('/join')} />
    </Screen>
  );
}

/** Sem câmera ao vivo (site aberto sem HTTPS, ou aparelho sem câmera): lê o QR de uma foto. */
function PhotoScanner({ reason }: { reason: 'insecure' | 'no_camera' }) {
  const { colors } = useTheme();
  return (
    <Screen scroll style={{ gap: 16 }}>
      <Header title="Ler QR Code" />
      <View style={{ alignItems: 'center', gap: 12, paddingVertical: 12 }}>
        <View style={[styles.bigIcon, { backgroundColor: colors.primarySoft }]}>
          <Icon name="qr" size={32} color={colors.primary} />
        </View>
        <Text variant="subheading" style={{ textAlign: 'center' }}>Tire uma foto do QR Code</Text>
        <Text tone="muted" style={{ textAlign: 'center', maxWidth: 360 }}>
          {reason === 'insecure'
            ? 'Neste endereço o navegador não libera a câmera ao vivo (é preciso HTTPS). Tire uma foto do QR Code — a câmera do celular abre na hora.'
            : 'Não encontramos uma câmera disponível. Use uma foto ou imagem do QR Code.'}
        </Text>
      </View>
      <PhotoButtons />
      <Button label="Digitar código" variant="ghost" size="md" onPress={() => router.replace('/join')} />
    </Screen>
  );
}

function PhotoButtons() {
  const [reading, setReading] = useState<'camera' | 'file' | null>(null);
  const read = async (capture: boolean) => {
    const file = await pickImage(capture);
    if (!file) return;
    setReading(capture ? 'camera' : 'file');
    try {
      const text = await readQrFromImage(file);
      if (!text) showToast('Não encontramos um QR Code na imagem. Tente uma foto mais próxima e nítida.', 'warning');
      else openInvite(text);
    } catch {
      showToast('Não conseguimos ler a imagem. Tente outra foto ou digite o código.', 'error');
    } finally {
      setReading(null);
    }
  };
  return (
    <View style={{ gap: 10 }}>
      <Button label="Tirar foto do QR Code" icon="camera" loading={reading === 'camera'} disabled={!!reading} onPress={() => void read(true)} />
      <Button label="Escolher imagem" variant="secondary" size="md" loading={reading === 'file'} disabled={!!reading} onPress={() => void read(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', left: 16, right: 16, flexDirection: 'row' },
  frame: { position: 'absolute', alignSelf: 'center', top: '30%', width: 240, height: 240, borderRadius: 28, borderWidth: 3, borderColor: '#FFFFFF' },
  bottom: { position: 'absolute', left: 20, right: 20, bottom: 0, gap: 14 },
  bigIcon: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
});

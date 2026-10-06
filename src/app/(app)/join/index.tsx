import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Header, Input, Screen, Text } from '@/components/ui';
import { normalizeInviteCode, parseInvite } from '@/lib/invite';

/** Entrar numa lista: digitar/colar o código ou link, ou escanear o QR Code. */
export default function JoinIndex() {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const code = parseInvite(value);
    if (!code) {
      setError('O código tem 4 letras e 4 números, como ABCD-1234.');
      return;
    }
    router.replace(`/join/${code}`);
  };

  return (
    <Screen scroll style={{ gap: 18 }}>
      <Header title="Entrar em uma lista" />
      <Button label="Escanear QR Code" icon="camera" onPress={() => router.push('/scan')} />
      <View style={{ alignItems: 'center' }}>
        <Text tone="muted">ou</Text>
      </View>
      <Input
        label="Código ou link de convite"
        placeholder="ABCD-1234"
        autoCapitalize="characters"
        autoCorrect={false}
        value={value}
        onChangeText={(t) => {
          setError(null);
          // Formata enquanto digita: ABCD1234 → ABCD-1234
          const n = normalizeInviteCode(t);
          setValue(n ?? t.toUpperCase());
        }}
        onSubmitEditing={submit}
        error={error}
      />
      <Button label="Pedir para entrar" variant="secondary" onPress={submit} disabled={!value.trim()} />
      <Card>
        <Text variant="caption" tone="muted">
          Por segurança, o administrador da lista precisa aprovar sua entrada. Você será avisado assim que ele aceitar.
        </Text>
      </Card>
    </Screen>
  );
}

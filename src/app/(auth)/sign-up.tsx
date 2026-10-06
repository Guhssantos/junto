import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Card, Header, Input, Screen, Text } from '@/components/ui';
import { toAppError } from '@/lib/errors';
import { signUp } from '@/services/auth';

export default function SignUp() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState(false);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      const { needsConfirmation } = await signUp({ name, email, password });
      if (needsConfirmation) setConfirmEmail(true);
    } catch (e) {
      setError(toAppError(e).message);
    } finally {
      setLoading(false);
    }
  };

  if (confirmEmail) {
    return (
      <Screen edges={['top', 'bottom']} style={{ justifyContent: 'center', gap: 16 }}>
        <Text variant="title">Confirme seu e-mail</Text>
        <Text tone="muted">Enviamos um link para {email.trim()}. Depois de confirmar, volte e entre com sua senha.</Text>
        <Button label="Ir para o login" onPress={() => router.replace('/sign-in')} />
      </Screen>
    );
  }

  return (
    <Screen scroll edges={['top', 'bottom']} style={{ gap: 20 }}>
      <Header title="Criar conta" />
      <Input label="Seu nome" value={name} onChangeText={setName} autoComplete="name" textContentType="name" maxLength={80} />
      <Input label="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" />
      <Input
        label="Senha"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        hint="Mínimo de 8 caracteres, com letras e números."
        error={error}
      />
      <Button label="Criar conta" onPress={submit} loading={loading} />
      <Card style={{ gap: 6 }}>
        <Text variant="caption" tone="muted">
          Ao criar a conta, você concorda que seu nome e foto ficam visíveis apenas para as pessoas das listas de que participa.
          Você pode excluir sua conta e seus dados a qualquer momento no Perfil.
        </Text>
      </Card>
      <View style={{ height: 8 }} />
    </Screen>
  );
}

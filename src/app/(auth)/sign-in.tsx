import { Link, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Logo } from '@/components/ui/Logo';
import { Button, Input, Screen, Text } from '@/components/ui';
import { toAppError } from '@/lib/errors';
import { signIn } from '@/services/auth';

export default function SignIn() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      await signIn({ email, password }); // o layout redireciona ao detectar a sessão
    } catch (e) {
      setError(toAppError(e).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen scroll edges={['top', 'bottom']} style={{ paddingTop: 64, gap: 32, flexGrow: 1 }}>
      <View style={{ gap: 16 }}>
        <Logo />
        <Text variant="display" accessibilityRole="header">Junto</Text>
        <Text variant="body" tone="muted" style={{ fontSize: 17, lineHeight: 24 }}>
          Sua lista de compras compartilhada, atualizada em tempo real com quem compra com você.
        </Text>
      </View>

      <View style={{ gap: 16 }}>
        <Input label="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" returnKeyType="next" />
        <Input label="Senha" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" returnKeyType="go" onSubmitEditing={submit} error={error} />
        <Link href={{ pathname: '/forgot-password', params: { email } }} style={{ alignSelf: 'flex-end', paddingVertical: 8 }}>
          <Text variant="bodyStrong" tone="primary" style={{ fontSize: 14 }}>Esqueci minha senha</Text>
        </Link>
        <Button label="Entrar" onPress={submit} loading={loading} />
      </View>

      <View style={{ flex: 1 }} />
      <View style={{ gap: 12 }}>
        <Text tone="muted" style={{ textAlign: 'center' }}>Ainda não tem conta?</Text>
        <Button
          label="Criar conta"
          variant="secondary"
          onPress={() => router.push({ pathname: '/sign-up', params: next ? { next } : {} })}
        />
      </View>
    </Screen>
  );
}

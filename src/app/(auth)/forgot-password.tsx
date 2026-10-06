import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Button, Header, Input, Screen, Text } from '@/components/ui';
import { toAppError } from '@/lib/errors';
import { showToast } from '@/lib/toast';
import { requestPasswordReset, resetPasswordWithCode } from '@/services/auth';

/** Recuperação por código de 6 dígitos enviado por e-mail (não depende de links abrirem o app). */
export default function ForgotPassword() {
  const params = useLocalSearchParams<{ email?: string }>();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState(params.email ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setLoading(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(toAppError(e).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen scroll edges={['top', 'bottom']} style={{ gap: 20 }}>
      <Header title="Recuperar senha" />
      {step === 'email' ? (
        <>
          <Text tone="muted">Informe o e-mail da sua conta. Enviaremos um código para criar uma nova senha.</Text>
          <Input label="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" error={error} />
          <Button
            label="Enviar código"
            loading={loading}
            onPress={() =>
              run(async () => {
                await requestPasswordReset(email);
                setStep('code');
              })
            }
          />
        </>
      ) : (
        <>
          <Text tone="muted">Se existir uma conta para {email.trim()}, você receberá um código em instantes. Confira também o spam.</Text>
          <Input label="Código enviado por e-mail" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 8))} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" />
          <Input label="Nova senha" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" hint="Mínimo de 8 caracteres, com letras e números." error={error} />
          <Button
            label="Salvar nova senha"
            loading={loading}
            onPress={() =>
              run(async () => {
                await resetPasswordWithCode({ email, code, password });
                showToast('Senha alterada. Você já está conectado.', 'success');
              })
            }
          />
          <Button label="Reenviar código" variant="ghost" size="md" onPress={() => run(() => requestPasswordReset(email))} />
        </>
      )}
    </Screen>
  );
}

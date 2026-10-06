import { useMutation } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';

import { Button, Header, Icon, Loading, Screen, Text } from '@/components/ui';
import { toAppError } from '@/lib/errors';
import { clearPendingInvite, normalizeInviteCode } from '@/lib/invite';
import { queryClient } from '@/lib/queryClient';
import { qk } from '@/lib/queryKeys';
import { JOIN_MESSAGES, requestJoin, type JoinResult } from '@/services/members';
import { useTheme } from '@/theme/ThemeProvider';

/** Destino de links junto://join/ABCD-1234, do QR Code e do código digitado. */
export default function JoinCode() {
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = normalizeInviteCode(raw ?? '');
  const { colors } = useTheme();
  const m = useMutation<JoinResult, Error>({ mutationFn: () => requestJoin(code ?? '') });

  const { mutate } = m;
  useEffect(() => clearPendingInvite(), []);
  useEffect(() => {
    if (code) mutate();
  }, [code, mutate]);

  const result = m.data;
  useEffect(() => {
    if (result?.status === 'already_member') router.replace(`/lists/${result.list_id}`);
    if (result?.status === 'pending') queryClient.invalidateQueries({ queryKey: qk.allLists });
  }, [result]);

  let body: ReactNode;
  if (!code) {
    body = <Message ok={false} title="Convite inválido" text="Este link não contém um código de convite válido." />;
  } else if (m.isPending || !result && !m.error) {
    body = <Loading label="Enviando pedido…" />;
  } else if (m.error) {
    body = <Message ok={false} title="Não foi possível enviar" text={toAppError(m.error).message} onRetry={() => m.mutate()} />;
  } else if (result?.status === 'pending') {
    body = (
      <Message
        ok
        title="Pedido enviado!"
        text={`Avisamos o administrador de “${result.list_name}”. Assim que ele aceitar, a lista aparece na sua tela inicial.`}
      />
    );
  } else if (result && result.status !== 'already_member') {
    body = <Message ok={false} title="Convite não aceito" text={JOIN_MESSAGES[result.status]} />;
  } else {
    body = <Loading />;
  }

  function Message({ ok, title, text, onRetry }: { ok: boolean; title: string; text: string; onRetry?: () => void }) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14, padding: 12 }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: ok ? colors.primarySoft : colors.dangerSoft }}>
          <Icon name={ok ? 'check' : 'close'} size={32} color={ok ? colors.primary : colors.danger} strokeWidth={3} />
        </View>
        <Text variant="title" style={{ textAlign: 'center' }}>{title}</Text>
        <Text tone="muted" style={{ textAlign: 'center' }}>{text}</Text>
        {onRetry ? <Button label="Tentar novamente" size="md" onPress={onRetry} /> : null}
        <Button label="Ir para o início" variant="ghost" size="md" onPress={() => router.replace('/home')} />
      </View>
    );
  }

  return (
    <Screen>
      <Header title={code ? `Convite ${code}` : 'Convite'} />
      {body}
    </Screen>
  );
}

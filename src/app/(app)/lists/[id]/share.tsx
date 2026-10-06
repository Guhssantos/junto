import { useMutation, useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Avatar, Badge, Button, Card, ErrorState, Header, Loading, Screen, Text } from '@/components/ui';
import { useList, useMembers, usePermissions } from '@/hooks/queries';
import { useListRealtime } from '@/hooks/useRealtime';
import { toAppError } from '@/lib/errors';
import { showDialog } from '@/lib/dialog';
import { buildInviteLink } from '@/lib/invite';
import { shareText } from '@/lib/share';
import { ROLE_LABEL } from '@/lib/permissions';
import { queryClient } from '@/lib/queryClient';
import { qk } from '@/lib/queryKeys';
import { showToast } from '@/lib/toast';
import { useUserId } from '@/providers/AuthProvider';
import { createInvite, removeMember, respondJoin, revokeInvites } from '@/services/members';
import { useTheme } from '@/theme/ThemeProvider';
import type { ListMember } from '@/types/models';

function hoursLeft(iso: string) {
  const h = Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 3_600_000));
  return h <= 1 ? 'menos de 1 h' : `${h} h`;
}

export default function ShareList() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = useUserId();
  const { colors } = useTheme();
  const list = useList(id);
  const members = useMembers(id);
  const perms = usePermissions(id);
  const canInvite = perms.can('member.invite') && list.data?.status === 'active';
  useListRealtime(id);

  const invite = useQuery({ queryKey: qk.invite(id), queryFn: () => createInvite(id), enabled: canInvite, staleTime: 5 * 60_000 });

  const regenerate = useMutation({
    mutationFn: async () => {
      await revokeInvites(id);
      return createInvite(id);
    },
    onSuccess: (inv) => {
      queryClient.setQueryData(qk.invite(id), inv);
      showToast('Novo código gerado. O anterior não funciona mais.', 'success');
    },
    onError: (e) => showToast(toAppError(e).message, 'error'),
  });

  const respond = useMutation({
    mutationFn: ({ member, accept }: { member: ListMember; accept: boolean }) => respondJoin(id, member.user_id, accept),
    onSuccess: (_d, { accept, member }) => {
      showToast(accept ? `${member.profile?.name ?? 'Participante'} agora participa da lista` : 'Pedido recusado', 'success');
      queryClient.invalidateQueries({ queryKey: qk.members(id) });
      queryClient.invalidateQueries({ queryKey: qk.notifications });
      queryClient.invalidateQueries({ queryKey: qk.allLists });
    },
    onError: (e) => showToast(toAppError(e).message, 'error'),
  });

  const remove = useMutation({
    mutationFn: (member: ListMember) => removeMember(id, member.user_id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.members(id) }),
    onError: (e) => showToast(toAppError(e).message, 'error'),
  });

  const code = invite.data?.code;
  const link = code ? buildInviteLink(code) : '';
  const pending = (members.data ?? []).filter((m) => m.status === 'pending');
  const active = (members.data ?? []).filter((m) => m.status === 'active');

  return (
    <Screen scroll style={{ gap: 16 }}>
      <Header title="Compartilhar lista" subtitle={list.data?.name} />

      {canInvite ? (
        <Card style={{ alignItems: 'center', gap: 14, paddingVertical: 20 }}>
          {invite.isLoading ? (
            <Loading label="Gerando convite…" />
          ) : invite.error ? (
            <ErrorState message={toAppError(invite.error).message} onRetry={() => invite.refetch()} />
          ) : code ? (
            <>
              <View style={styles.qr} accessible accessibilityLabel={`QR Code do convite ${code}`}>
                <QRCode value={link} size={200} color="#16181D" backgroundColor="#FFFFFF" />
              </View>
              <View style={{ alignItems: 'center', gap: 2 }}>
                <Text variant="overline" tone="muted">Código de convite</Text>
                <Text variant="display" style={{ letterSpacing: 3 }} selectable>{code}</Text>
                <Text variant="caption" tone="muted" style={{ textAlign: 'center' }}>
                  Expira em {hoursLeft(invite.data!.expires_at)} · entrada só com sua aprovação
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 10, alignSelf: 'stretch' }}>
                <Button
                  label="Copiar código"
                  icon="copy"
                  variant="secondary"
                  size="md"
                  style={{ flex: 1 }}
                  onPress={async () => {
                    const ok = await Clipboard.setStringAsync(code).catch(() => false);
                    showToast(ok ? 'Código copiado' : `Não foi possível copiar. O código é ${code}`, ok ? 'success' : 'warning');
                  }}
                />
                <Button
                  label="Compartilhar"
                  icon="share"
                  size="md"
                  style={{ flex: 1 }}
                  onPress={() => void shareText(`Entre na minha lista “${list.data?.name}” no Junto: ${link}\nOu use o código ${code}`)}
                />
              </View>
              <Button label="Gerar novo código" variant="ghost" size="md" loading={regenerate.isPending} onPress={() => regenerate.mutate()} />
            </>
          ) : null}
        </Card>
      ) : (
        <Card>
          <Text tone="muted">Somente administradores podem convidar pessoas para esta lista.</Text>
        </Card>
      )}

      {pending.length && canInvite ? (
        <View style={{ gap: 10 }}>
          <Text variant="subheading" accessibilityRole="header">Pedidos para entrar</Text>
          {pending.map((m) => (
            <Card key={m.id} style={{ gap: 12, borderColor: colors.accent, borderWidth: 1.5 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Avatar profile={m.profile} size={40} />
                <Text style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{m.profile?.name ?? 'Alguém'}</Text> deseja participar desta lista.
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button label="Recusar" variant="danger" size="md" style={{ flex: 1 }} disabled={respond.isPending} onPress={() => respond.mutate({ member: m, accept: false })} />
                <Button label="Aceitar" size="md" style={{ flex: 1 }} disabled={respond.isPending} onPress={() => respond.mutate({ member: m, accept: true })} />
              </View>
            </Card>
          ))}
        </View>
      ) : null}

      <View style={{ gap: 8 }}>
        <Text variant="subheading" accessibilityRole="header">Participantes</Text>
        {active.map((m) => {
          const isOwner = m.user_id === list.data?.owner_id;
          const canRemove = perms.can('member.remove') && !isOwner && m.user_id !== userId;
          return (
            <View key={m.id} style={styles.member}>
              <Avatar profile={m.profile} size={40} />
              <Text variant="bodyStrong" style={{ flex: 1 }}>
                {m.profile?.name ?? 'Participante'}
                {m.user_id === userId ? ' (você)' : ''}
              </Text>
              <Badge
                label={ROLE_LABEL[m.role_id] ?? m.role_id}
                bg={m.role_id === 'admin' ? colors.primarySoft : colors.surfaceAlt}
                fg={m.role_id === 'admin' ? colors.text : colors.textSubtle}
              />
              {canRemove ? (
                <Button
                  label="Remover"
                  variant="ghost"
                  size="md"
                  style={{ paddingHorizontal: 8 }}
                  onPress={() =>
                    showDialog('Remover participante?', `${m.profile?.name ?? 'Esta pessoa'} perderá o acesso à lista.`, [
                      { text: 'Cancelar', style: 'cancel' },
                      { text: 'Remover', style: 'destructive', onPress: () => remove.mutate(m) },
                    ])
                  }
                />
              ) : null}
            </View>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  qr: { padding: 12, backgroundColor: '#FFFFFF', borderRadius: 16 },
  member: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52 },
});

import { useMutation } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { Avatar, Button, Card, Chips, Divider, Icon, Input, Screen, Text, type IconName } from '@/components/ui';
import { toAppError } from '@/lib/errors';
import { showDialog } from '@/lib/dialog';
import { queryClient } from '@/lib/queryClient';
import { qk } from '@/lib/queryKeys';
import { showToast } from '@/lib/toast';
import { getOutbox } from '@/offline/outbox';
import { useAuth } from '@/providers/AuthProvider';
import { signOut } from '@/services/auth';
import { deleteAccount, updateProfile, uploadAvatar } from '@/services/profile';
import { unregisterPush } from '@/services/push';
import { useTheme, type ThemePreference } from '@/theme/ThemeProvider';

function Row({ icon, label, onPress, danger }: { icon: IconName; label: string; onPress: () => void; danger?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, { opacity: pressed ? 0.6 : 1 }]}>
      <Icon name={icon} size={20} color={danger ? colors.danger : colors.text} />
      <Text variant="bodyStrong" tone={danger ? 'danger' : 'default'} style={{ flex: 1 }}>{label}</Text>
      {!danger ? <Icon name="chevron" size={18} color={colors.textMuted} /> : null}
    </Pressable>
  );
}

export default function Profile() {
  const { profile, session, userId } = useAuth();
  const { colors, preference, setPreference } = useTheme();
  const [draft, setDraft] = useState<string | null>(null); // null = sem edição em andamento
  const name = draft ?? profile?.name ?? '';
  const setName = setDraft;

  const save = useMutation({
    mutationFn: updateProfile,
    onSuccess: (p) => {
      queryClient.setQueryData([...qk.me, userId], p);
      setDraft(null);
      queryClient.invalidateQueries({ queryKey: qk.allLists });
      showToast('Perfil atualizado', 'success');
    },
    onError: (e) => showToast(toAppError(e).message, 'error'),
  });

  const avatar = useMutation({
    mutationFn: async () => {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.6 });
      if (res.canceled || !res.assets[0]) return null;
      return uploadAvatar(res.assets[0].uri, res.assets[0].mimeType ?? 'image/jpeg');
    },
    onSuccess: (p) => {
      if (!p) return;
      queryClient.setQueryData([...qk.me, userId], p);
      showToast('Foto atualizada', 'success');
    },
    onError: (e) => showToast(toAppError(e).message, 'error'),
  });

  const doLogout = async () => {
    await unregisterPush().catch(() => undefined);
    await signOut().catch((e) => showToast(toAppError(e).message, 'error'));
  };
  const logout = () => {
    const pending = getOutbox().length;
    if (!pending) return void doLogout();
    showDialog(
      'Alterações não sincronizadas',
      `${pending} ${pending === 1 ? 'alteração ainda não foi enviada' : 'alterações ainda não foram enviadas'}. Se sair agora, elas serão perdidas. Conecte-se à internet e aguarde a sincronização.`,
      [
        { text: 'Ficar', style: 'cancel' },
        { text: 'Sair mesmo assim', style: 'destructive', onPress: () => void doLogout() },
      ],
    );
  };

  const confirmDelete = () =>
    showDialog(
      'Excluir conta',
      'Seus dados pessoais serão apagados. Listas compartilhadas passam para outro participante; listas só suas serão excluídas. Esta ação não pode ser desfeita.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: () => deleteAccount().catch((e) => showToast(toAppError(e).message, 'error')),
        },
      ],
    );

  return (
    <Screen scroll style={{ gap: 18, paddingTop: 12 }}>
      <Text variant="title" accessibilityRole="header">Perfil</Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Alterar foto de perfil" onPress={() => avatar.mutate()} disabled={avatar.isPending}>
          <Avatar profile={profile} size={72} />
          <View style={[styles.camera, { backgroundColor: colors.inverse, borderColor: colors.bg }]}>
            <Icon name="camera" size={14} color={colors.onInverse} />
          </View>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text variant="heading">{profile?.name}</Text>
          <Text tone="muted">{session?.user.email}</Text>
        </View>
      </View>

      <Card style={{ gap: 12 }}>
        <Input label="Nome" value={name} onChangeText={setName} maxLength={80} />
        <Button label="Salvar nome" size="md" variant="secondary" disabled={!name.trim() || name.trim() === profile?.name} loading={save.isPending} onPress={() => save.mutate({ name })} />
      </Card>

      <Card style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">Notificações push</Text>
            <Text variant="caption" tone="muted">Avisos no celular mesmo com o app fechado</Text>
          </View>
          <Switch
            accessibilityLabel="Notificações push"
            value={profile?.push_enabled ?? true}
            onValueChange={(v) => save.mutate({ push_enabled: v })}
            trackColor={{ true: colors.primary, false: colors.lineStrong }}
            thumbColor="#FFFFFF"
          />
        </View>
        <Divider />
        <Text variant="bodyStrong">Aparência</Text>
        <Chips<ThemePreference>
          label="Aparência"
          value={preference}
          onChange={setPreference}
          options={[
            { value: 'system', label: 'Automática' },
            { value: 'light', label: 'Clara' },
            { value: 'dark', label: 'Escura' },
          ]}
        />
      </Card>

      <Card style={{ paddingVertical: 4 }}>
        <Row icon="history" label="Histórico de compras" onPress={() => router.push('/history')} />
        <Divider />
        <Row icon="qr" label="Entrar em uma lista com código" onPress={() => router.push('/join')} />
        <Divider />
        <Row icon="logout" label="Sair" onPress={logout} />
      </Card>

      <Card style={{ gap: 8 }}>
        <Text variant="bodyStrong">Privacidade (LGPD)</Text>
        <Text variant="caption" tone="muted">
          Seu nome e foto aparecem apenas para pessoas das listas de que você participa. Seus dados são usados somente para o
          funcionamento do app e você pode excluí-los a qualquer momento.
        </Text>
        <Row icon="trash" label="Excluir minha conta" onPress={confirmDelete} danger />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
  camera: { position: 'absolute', right: -2, bottom: -2, width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});

/** No navegador não há push nativo: as notificações chegam pela central do app e pelo tempo real. */
export function useNotificationTap(): { id: string; data: Record<string, unknown> } | null {
  return null;
}

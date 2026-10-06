import * as Notifications from 'expo-notifications';

/** Último toque numa notificação push (Android/iOS). A versão web fica em .web.ts. */
export function useNotificationTap(): { id: string; data: Record<string, unknown> } | null {
  const last = Notifications.useLastNotificationResponse();
  if (!last) return null;
  return { id: last.notification.request.identifier, data: last.notification.request.content.data as Record<string, unknown> };
}

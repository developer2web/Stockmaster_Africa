export const NOTIFICATION_RETENTION_MS = 48 * 60 * 60 * 1000;
export function notificationCutoff(now = Date.now()) {
  return new Date(now - NOTIFICATION_RETENTION_MS).toISOString();
}
export function isNotificationActive(item: { created_at: string }, now = Date.now()) {
  return new Date(item.created_at).getTime() > now - NOTIFICATION_RETENTION_MS;
}

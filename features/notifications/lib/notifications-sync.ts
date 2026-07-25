/** Cross-surface sync between header bell and inbox page. */
export const NOTIFICATIONS_CHANGED_EVENT = "mlf:notifications-changed";

export function emitNotificationsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
}

export function onNotificationsChanged(handler: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, handler);
  return () => window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, handler);
}

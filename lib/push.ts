// On-device notifications.
//
// This build has no backend, so only the first of the two usual layers exists
// here, and it is the one that needs no server anyway:
//
//   On-device system notifications — once the user grants permission, the
//   service worker raises a real OS notification, shown on the lock screen or
//   notification tray while the app is installed. Everything that triggers one
//   originates in the browser from the sample data.
//
// The second layer — true background push, where a server pushes to a device
// that is not open — is intentionally NOT wired here. It would need a backend to
// hold subscriptions and send with a VAPID private key, and this repo has no
// backend by design (see ARCHITECTURE.md). subscribeToPush() below still records
// a subscription so the surrounding UI works in the demo, but nothing sends to
// it, and no subscription ever leaves the device.

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'Notification' in window
  );
}

export function permission(): NotificationPermission {
  if (typeof Notification === 'undefined') return 'denied';
  return Notification.permission;
}

export async function requestPermission(): Promise<NotificationPermission> {
  if (typeof Notification === 'undefined') return 'denied';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

// Raise a real OS notification via the service worker (so it also shows when the
// app is in the background). Falls back to the page Notification if no SW.
export async function showLocalNotification(
  title: string,
  body?: string,
  url = '/',
): Promise<void> {
  if (permission() !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg) {
      await reg.showNotification(title, {
        body,
        icon: '/icons/icon.svg',
        badge: '/icons/icon-maskable.svg',
        data: { url },
        tag: 'beacon',
      });
      return;
    }
  } catch {
    /* fall through */
  }
  try {
    new Notification(title, { body });
  } catch {}
}

// Register a background-push subscription. No-op unless a VAPID public key is
// configured. Returns the subscription so the caller can persist it server-side.
export async function subscribeToPush(): Promise<PushSubscription | null> {
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapid || !pushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) return existing;
    return await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid),
    });
  } catch {
    return null;
  }
}

function urlBase64ToUint8Array(base64: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out.buffer;
}

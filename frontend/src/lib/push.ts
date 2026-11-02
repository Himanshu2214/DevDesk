// Phone approval (standalone mode): this device receives sign-in requests as notifications and approves them by
// tapping the number the new sign-in shows (edge function push-approve, migration 20261110000000_phone_approval).
import { functionError, keepSignedIn, sb } from './supabase';

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
/** iPhone/iPad only allow notifications for the app added to the Home Screen */
export const needsHomeScreen = () => /iPhone|iPad/.test(navigator.userAgent) && !matchMedia('(display-mode: standalone)').matches;

/** calls push-approve and turns its errors into readable messages */
export async function pushCall<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await sb().functions.invoke('push-approve', { body: { action, ...body } });
  if (error) {
    const { status, message } = await functionError(error);
    throw new Error(message || (status === 404 ? 'Phone approval is not set up yet (setup guide, step 19).'
      : status ? `Phone approval failed (error ${status}).` : 'Phone approval could not be reached. Check your connection; if it keeps failing, look at the push-approve logs in Supabase.'));
  }
  return data as T;
}

const registration = async () => (await navigator.serviceWorker.getRegistration()) ?? null;
/** this browser's push address, if it has one */
export async function currentEndpoint(): Promise<string | null> {
  if (!pushSupported()) return null;
  return (await (await registration())?.pushManager.getSubscription())?.endpoint ?? null;
}

/** a readable name for the device list: "iPhone · Safari" */
export function deviceLabel(): string {
  const ua = navigator.userAgent;
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /CrOS/.test(ua) ? 'Chromebook' : /Linux/.test(ua) ? 'Linux' : 'Device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${os} · ${browser}`;
}

const keyBytes = (k: string) => Uint8Array.from(atob(k.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((k.length + 3) % 4)), c => c.charCodeAt(0));

/** asks for permission, subscribes this browser and saves it as an approval device */
export async function enablePush(): Promise<void> {
  if (!pushSupported()) throw new Error('This browser cannot receive notifications.');
  const reg = await registration();
  if (!reg) throw new Error('Open the installed app (not a preview) to turn this on.');
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('Notifications are blocked. Allow them for this app in the browser or phone settings.');
  const { publicKey } = await pushCall<{ publicKey: string }>('key');
  const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  const j = sub.toJSON();
  const { error } = await sb().from('push_devices').upsert({ endpoint: sub.endpoint, p256dh: j.keys?.p256dh ?? '', auth: j.keys?.auth ?? '', label: deviceLabel() }, { onConflict: 'endpoint' });
  if (error) throw new Error(error.message);
  keepSignedIn();
}

/** On a device set up for approvals: whenever the app is opened or brought back to the front, a waiting sign-in
 *  request opens the approve screen – so approving works even when the notification never shows up.
 *  Other browsers never ask (no push subscription). Returns the clean-up function. */
export function watchForRequests(open: () => void): () => void {
  let last = 0, stopped = false;
  const check = async () => {
    if (stopped || document.visibilityState !== 'visible' || Date.now() - last < 5000) return;
    last = Date.now();
    try {
      if (!(await currentEndpoint())) return;
      keepSignedIn();                       // phones set up before this was automatic stay signed in from now on
      const { request } = await pushCall<{ request: unknown }>('pending');
      if (request && !stopped) open();
    } catch { /* not set up or offline: the notification and the codes still work */ }
  };
  check();
  document.addEventListener('visibilitychange', check);
  addEventListener('focus', check);
  return () => { stopped = true; document.removeEventListener('visibilitychange', check); removeEventListener('focus', check) };
}

/** removes this browser's subscription (the row is removed by the caller) */
export async function disablePushHere(): Promise<void> {
  await (await (await registration())?.pushManager.getSubscription())?.unsubscribe();
}

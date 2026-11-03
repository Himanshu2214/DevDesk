// "Trusted for 24 hours": after the second step (emailed code or authenticator app) the server gives this browser a
// random token (only its hash is stored there). A later sign-in on the same browser by the same account, within the
// 24 hours, sends the token instead of asking for a code again. Another browser, another account or an expired token
// still asks. "Sign out all other devices" ends every trust but this browser's.
import { sb } from './supabase';

const KEY = 'slate-trust';
interface Stored { u: string; t: string; exp: string }
const safe = <T,>(fn: () => T, fallback: T): T => { try { return fn() } catch { return fallback } };

export const trustToken = (): string | null => safe(() => (JSON.parse(localStorage.getItem(KEY) ?? 'null') as Stored | null)?.t ?? null, null);
export function saveTrust(userId: string, r: { trust?: string; trustExpiresAt?: string } | null) {
  if (r?.trust && r.trustExpiresAt) safe(() => localStorage.setItem(KEY, JSON.stringify({ u: userId, t: r.trust, exp: r.trustExpiresAt })), undefined);
}
export const clearTrust = () => safe(() => localStorage.removeItem(KEY), undefined);

/** a new session on a browser trusted by this account: let the server mark it verified; true when that worked */
export async function applyTrust(userId: string): Promise<boolean> {
  const s = safe(() => JSON.parse(localStorage.getItem(KEY) ?? 'null') as Stored | null, null);
  if (!s || s.u !== userId || Date.parse(s.exp) < Date.now()) { if (s) clearTrust(); return false }
  const { data, error } = await sb().functions.invoke('verify-login-code', { body: { trust: s.t } });
  if (error || !(data as { verified?: boolean } | null)?.verified) { clearTrust(); return false }
  return true;
}

/** after the authenticator app: ask the server to trust this browser too (best effort) */
export async function trustAfterApp(userId: string) {
  const { data } = await sb().functions.invoke('verify-login-code', { body: { issueTrust: true } }).catch(() => ({ data: null }));
  saveTrust(userId, data as { trust?: string; trustExpiresAt?: string } | null);
}

/** "Sign out all other devices": every other browser has to enter a code again */
export async function revokeOtherTrust() {
  await sb().functions.invoke('verify-login-code', { body: { revokeTrust: true, keep: trustToken() } }).catch(() => {});
}

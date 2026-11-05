// Supabase client for the standalone (cloud) backend. Created on first use, so the SAP and mock builds never start it.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';

/** running as the standalone Android app (Capacitor: the app is bundled into the APK), not in a browser */
export const isNativeApp = () => Capacitor.isNativePlatform();
/** the public web address – used for links in emails, which open in the phone's browser, never the app's internal address */
const PUBLIC_URL = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined) || 'https://slatespace-32m.pages.dev/';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const supabaseConfigured = !!(url && anonKey);

/* "Remember me": the session is kept in localStorage (survives closing the browser) or only in sessionStorage
   (this tab; closing it signs out). The choice is stored before signing in and applies to every write after. */
const REMEMBER = 'slate-remember';
const safe = <T,>(fn: () => T, fallback: T): T => { try { return fn() } catch { return fallback } };
export const getRemember = () => safe(() => localStorage.getItem(REMEMBER) !== '0', true);
export const setRemember = (on: boolean) => safe(() => localStorage.setItem(REMEMBER, on ? '1' : '0'), undefined);
const sessionStore = {
  getItem: (k: string) => safe(() => sessionStorage.getItem(k) ?? localStorage.getItem(k), null),
  setItem: (k: string, v: string) => safe(() => {
    const [keep, drop] = getRemember() ? [localStorage, sessionStorage] : [sessionStorage, localStorage];
    keep.setItem(k, v); drop.removeItem(k);
  }, undefined),
  removeItem: (k: string) => safe(() => { localStorage.removeItem(k); sessionStorage.removeItem(k) }, undefined),
};

let client: SupabaseClient | null = null;
export function sb(): SupabaseClient {
  if (!supabaseConfigured) throw new Error('Supabase is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.supabase.local');
  return (client ??= createClient(url!, anonKey!, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storage: sessionStore },
  }));
}

/** A private file through /object/authenticated/…, which Storage checks against the access rules on every request.
 *  (supabase-js download() uses /object/…, which the CDN may answer from its cache – even for someone whose access was
 *  removed after they had opened the file once: security audit finding F12.) */
export async function downloadPrivate(bucket: string, path: string): Promise<Blob> {
  const { data } = await sb().auth.getSession();
  const res = await fetch(`${url!.replace(/\/+$/, '')}/storage/v1/object/authenticated/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`, {
    headers: { apikey: anonKey!, Authorization: `Bearer ${data.session?.access_token ?? anonKey}` }, cache: 'no-store' });
  if (!res.ok) throw new Error('The file could not be downloaded');
  return res.blob();
}

/** Where email links (confirm, reset) and Google send the user back to: this app's own address */
export const appUrl = () => (isNativeApp() ? PUBLIC_URL : location.origin + location.pathname);

/** Why a functions.invoke() failed: the HTTP status and the function's own { error } message when it answered at all.
 *  A network failure or a crashed function gives neither (status undefined). */
export async function functionError(e: unknown): Promise<{ status?: number; message?: string }> {
  const ctx = (e as { context?: unknown }).context;
  if (!(ctx instanceof Response)) return {};
  const body = await ctx.json().catch(() => null) as { error?: unknown } | null;
  return { status: ctx.status, message: typeof body?.error === 'string' ? body.error : undefined };
}

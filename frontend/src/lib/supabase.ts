// Supabase client for the standalone (cloud) backend. Created on first use, so the SAP and mock builds never start it.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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

/** Where email links (confirm, reset) and Google send the user back to: this app's own address */
export const appUrl = () => location.origin + location.pathname;

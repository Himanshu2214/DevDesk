// Cloudflare Turnstile (bot check) for the sign-in forms. Invisible for normal visitors; Supabase verifies the token
// (Authentication → Attack Protection). Without VITE_TURNSTILE_SITE_KEY nothing is loaded and no token is needed.
import { useCallback, useEffect, useRef, useState } from 'react';

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileApi {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  reset(id: string): void;
  remove(id: string): void;
}
declare global { interface Window { turnstile?: TurnstileApi } }

let loading: Promise<TurnstileApi> | null = null;
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  return (loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT; s.async = true; s.defer = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile did not load')));
    s.onerror = () => { loading = null; reject(new Error('The bot check could not load. Check your connection.')) };
    document.head.appendChild(s);
  }));
}

/** Returns the widget element to place in the form, the current token, and reset() for after each attempt (tokens are single-use) */
export function useTurnstile() {
  const box = useRef<HTMLDivElement>(null);
  const id = useRef<string | null>(null);
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!SITE_KEY) return;
    let gone = false;
    loadTurnstile().then(ts => {
      if (gone || !box.current) return;
      id.current = ts.render(box.current, {
        sitekey: SITE_KEY, appearance: 'interaction-only', size: 'flexible', theme: document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
        callback: (t: string) => { setToken(t); setError('') },
        'expired-callback': () => setToken(''),
        'error-callback': () => { setToken(''); setError('The bot check failed. Reload the page and try again.') },
      });
    }).catch(e => setError((e as Error).message));
    return () => { gone = true; if (id.current) window.turnstile?.remove(id.current); id.current = null };
  }, []);
  const reset = useCallback(() => { setToken(''); if (id.current) window.turnstile?.reset(id.current) }, []);
  return {
    enabled: !!SITE_KEY,
    /** true when a token is available (or no bot check is configured) */
    ready: !SITE_KEY || !!token,
    token: token || undefined,
    error,
    reset,
    widget: SITE_KEY ? <div ref={box} className="ts-box" /> : null,
  };
}

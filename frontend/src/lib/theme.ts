// Appearance: dark / light / follow the system, stored per browser (SmoothUI Theme Toggle in the user menu and sidebar).
// index.html applies it before the first paint, so there is no flash of the wrong colours.

export type Mode = 'dark' | 'light' | 'system';

const read = (k: string) => { try { return localStorage.getItem(k) } catch { return null } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } };
const systemDark = () => matchMedia('(prefers-color-scheme: dark)').matches;

export const getMode = (): Mode => { const m = read('devdesk-theme'); return m === 'light' || m === 'system' ? m : 'dark' };
/** the mode actually shown (system resolved) */
export const shownMode = (): 'dark' | 'light' => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

/** Applies the stored choice to <html> and tells charts to re-read the colours */
export function applyTheme() {
  const r = document.documentElement, mode = getMode();
  r.dataset.theme = mode === 'system' ? (systemDark() ? 'dark' : 'light') : mode;
  delete r.dataset.palette;                              // colour themes were removed; drop an old choice
  dispatchEvent(new Event('devdesk-theme'));
}
export function setMode(m: Mode) { write('devdesk-theme', m); applyTheme() }

// follow the system while "system" is chosen
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (getMode() === 'system') applyTheme() });

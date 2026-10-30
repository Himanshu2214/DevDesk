// Appearance: colour theme (palette, styles/themes.css) and mode (dark / light / follow the system), stored per browser.
// index.html applies both before the first paint, so there is no flash of the wrong colours.

export interface Palette { id: string; name: string; dark: [string, string]; light: [string, string] }
/** [surface, accent] per mode – used for the swatches in the picker */
export const PALETTES: Palette[] = [
  { id: 'slate', name: 'Slate', dark: ['#13161b', '#4c7dff'], light: ['#ffffff', '#2f5fe0'] },
  { id: 'vercel', name: 'Vercel', dark: ['#0a0a0a', '#ededed'], light: ['#ffffff', '#171717'] },
  { id: 'claude', name: 'Claude', dark: ['#262624', '#d97757'], light: ['#faf9f5', '#c96442'] },
  { id: 'supabase', name: 'Supabase', dark: ['#171717', '#3ecf8e'], light: ['#ffffff', '#15a36a'] },
  { id: 'catppuccin', name: 'Catppuccin', dark: ['#1e1e2e', '#cba6f7'], light: ['#eff1f5', '#8839ef'] },
  { id: 'ocean', name: 'Ocean Breeze', dark: ['#0f172a', '#2dd4bf'], light: ['#ffffff', '#0d9488'] },
  { id: 'cosmic', name: 'Cosmic Night', dark: ['#121126', '#a48fff'], light: ['#ffffff', '#6e56cf'] },
  { id: 'nature', name: 'Nature', dark: ['#172019', '#6abf69'], light: ['#fbfaf6', '#2e7d32'] },
  { id: 'sunset', name: 'Sunset Horizon', dark: ['#1f1814', '#ff7e5f'], light: ['#fffaf7', '#e8573a'] },
  { id: 'twitter', name: 'Twitter', dark: ['#0b0d10', '#1d9bf0'], light: ['#ffffff', '#1d9bf0'] },
  { id: 'amber', name: 'Amber Minimal', dark: ['#171717', '#f59e0b'], light: ['#ffffff', '#d97706'] },
];
export type Mode = 'dark' | 'light' | 'system';

const read = (k: string) => { try { return localStorage.getItem(k) } catch { return null } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } };
const systemDark = () => matchMedia('(prefers-color-scheme: dark)').matches;

export const getMode = (): Mode => { const m = read('devdesk-theme'); return m === 'light' || m === 'system' ? m : 'dark' };
export const getPalette = (): string => { const p = read('devdesk-palette'); return PALETTES.some(x => x.id === p) ? p! : 'slate' };
/** the mode actually shown (system resolved) */
export const shownMode = (): 'dark' | 'light' => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

/** Applies the stored choice to <html> and tells charts to re-read the colours */
export function applyTheme() {
  const r = document.documentElement, mode = getMode(), palette = getPalette();
  r.dataset.theme = mode === 'system' ? (systemDark() ? 'dark' : 'light') : mode;
  if (palette === 'slate') delete r.dataset.palette; else r.dataset.palette = palette;
  dispatchEvent(new Event('devdesk-theme'));
}
export function setMode(m: Mode) { write('devdesk-theme', m); applyTheme() }
export function setPalette(id: string) { write('devdesk-palette', id); applyTheme() }

// follow the system while "system" is chosen
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (getMode() === 'system') applyTheme() });

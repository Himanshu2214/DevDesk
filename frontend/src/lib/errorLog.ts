// Client error logging: crashes caught by the error boundaries plus uncaught errors and rejected promises. Messages are
// cleaned before they leave the browser (no email addresses, tokens, keys or URL query strings), shortened, and sent at
// most a few times per page load; the standalone build stores them in Supabase (client_errors), the others only log
// to the console.
import { api } from '../api';

const MAX_PER_LOAD = 20;
let sent = 0;
const seen = new Set<string>();

/** removes anything that could identify a person or unlock something */
export function redact(text: string): string {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '<email>')
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, '<token>')                       // JWTs
    .replace(/([?&#][\w-]+=)[^&#\s'")]*/g, '$1<v>')                          // URL query and hash values
    .replace(/\b(bearer|apikey|authorization|password|secret|token|code)\b(\s*[:=]\s*|\s+)(?!<v>)\S+/gi, '$1$2<hidden>')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '<long>')                             // keys, hashes, long ids
    .replace(/\b\d{6}\b/g, '<6 digits>');                                     // sign-in codes
}

/** chunks of an older build were removed after a deployment: reloading fixes it */
export const isStaleBuild = (e: unknown) => /dynamically imported module|Importing a module script failed|Loading chunk .* failed|error loading dynamically/i.test(String((e as Error)?.message ?? e));

export function logError(e: unknown, where: string) {
  const err = e instanceof Error ? e : new Error(String((e as { message?: string })?.message ?? e));
  const message = redact(`${err.name}: ${err.message}`).slice(0, 500);
  if (sent >= MAX_PER_LOAD || seen.has(message)) return;
  seen.add(message); sent++;
  if (import.meta.env.DEV) console.error(`[${where}]`, e);
  api.logClientError?.({
    message,
    stack: redact(err.stack ?? '').slice(0, 2000),
    where: where.slice(0, 60),
    route: redact(location.hash.split('?')[0]).slice(0, 120),
  }).catch(() => { /* logging must never cause another error */ });
}

/** uncaught errors and rejected promises everywhere in the page */
export function installErrorLogging() {
  addEventListener('error', e => { if (e.error || e.message) logError(e.error ?? e.message, 'window') });
  addEventListener('unhandledrejection', e => logError(e.reason, 'promise'));
}

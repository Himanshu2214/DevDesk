// Email budget and sign-in limits for the edge functions (database side: migration 20261116000000_auth_limits).
// MAIL_DAILY_LIMIT (default 200 = Mailjet free) and MAIL_RESERVE (default 60, kept for sign-in codes) are optional secrets.
import type { admin } from './login-code.ts';

type Db = ReturnType<typeof admin>;
export type MailKind = 'code' | 'notify' | 'digest';
const num = (k: string, d: number) => { const n = Number((Deno.env.get(k) ?? '').trim()); return Number.isFinite(n) && n > 0 ? n : d };

/** salted hash of an address – the log never holds the address itself */
export async function hashAddress(email: string): Promise<string> {
  const data = new TextEncoder().encode(`${email.trim().toLowerCase()}:${Deno.env.get('CODE_PEPPER') ?? ''}`);
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), b => b.toString(16).padStart(2, '0')).join('');
}

/** asks for permission to send one email. When the database cannot answer, sign-in codes still go out; so does
 *  everything while the migration is not installed yet (PGRST202), so nothing stops working before it is run */
export async function takeMailSlot(db: Db, kind: MailKind, userId: string, to: string): Promise<{ ok: boolean; reason: string; slot: string | null }> {
  const { data, error } = await db.rpc('take_mail_slot', { p_kind: kind, p_user: userId, p_to_hash: await hashAddress(to),
    p_daily_limit: num('MAIL_DAILY_LIMIT', 200), p_reserve: num('MAIL_RESERVE', 60) });
  if (error) {
    console.error('mail slot', kind, error.code ?? 'error');
    return { ok: kind === 'code' || error.code === 'PGRST202', reason: 'unavailable', slot: null };
  }
  const row = (data as { ok: boolean; reason: string; slot: string | null }[] | null)?.[0];
  return row ?? { ok: kind === 'code', reason: 'unavailable', slot: null };
}
export async function releaseMailSlot(db: Db, slot: string | null) { if (slot) await db.rpc('release_mail_slot', { p_slot: slot }) }

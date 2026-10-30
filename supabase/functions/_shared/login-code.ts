// Shared helpers for the 2-step login code functions (Supabase Edge Functions, Deno).
import { createClient, type User } from 'npm:@supabase/supabase-js@2.117.3';

export const CODE_TTL_MIN = 10;
export const MAX_ATTEMPTS = 5;
export const RESEND_AFTER_S = 60;

export const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
export const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

/** Service-role client: bypasses row level security, so only these functions can read or write the code tables */
export const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

/** Checks the caller's access token with the auth server and returns the user and the session the token belongs to */
export async function caller(req: Request): Promise<{ user: User; sessionId: string } | Response> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: 'Not signed in' });
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data.user) return json(401, { error: 'Your sign-in has expired. Sign in again.' });
  let sessionId = '';
  try { sessionId = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).session_id ?? '' } catch { /* malformed */ }
  if (!sessionId) return json(401, { error: 'No session in the token. Sign in again.' });
  return { user: data.user, sessionId };
}

/** SHA-256 of code + session + server secret, so a leaked table row does not reveal the code */
export async function hashCode(code: string, sessionId: string): Promise<string> {
  const data = new TextEncoder().encode(`${code}:${sessionId}:${Deno.env.get('CODE_PEPPER') ?? ''}`);
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), b => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time string comparison */
export function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

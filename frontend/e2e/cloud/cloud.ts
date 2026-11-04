// Helpers for the cloud tests: a dedicated TEST Supabase project only (frontend/.env.e2e.local, never committed).
// Test users are created per run with random passwords and removed again afterwards; emails go to the mail_sink table
// (secret MAIL_SINK=table on the test project), so no real email is sent.
import { expect, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

/** the production project – the tests refuse to run against it */
const PRODUCTION_REF = 'udsqireigvipmpepbtrf';

function readEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync('.env.e2e.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
const env = readEnv();
export const SUPABASE_URL = env.VITE_SUPABASE_URL ?? '';
const SERVICE_KEY = env.E2E_SERVICE_ROLE_KEY ?? '';
if (!SUPABASE_URL || !SERVICE_KEY || !env.VITE_SUPABASE_ANON_KEY) throw new Error('.env.e2e.local needs VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY and E2E_SERVICE_ROLE_KEY (see e2e/README.md)');
if (SUPABASE_URL.includes(PRODUCTION_REF)) throw new Error('Refusing to run: .env.e2e.local points at the PRODUCTION project. Use the separate test project.');

/** service-role client for setting up, checking and cleaning test data (never used by the app under test) */
export const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

export interface TestUser { id: string; email: string; password: string; name: string }
const run = Date.now().toString(36);

/** a fresh confirmed account for this run; onboarded unless asked otherwise */
export async function createUser(role: string, opts: { onboarded?: boolean } = {}): Promise<TestUser> {
  const email = `e2e-${role}-${run}-${randomBytes(3).toString('hex')}@example.com`;
  const password = randomBytes(18).toString('base64url');
  const name = `E2E ${role[0].toUpperCase()}${role.slice(1)}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true,
    user_metadata: { full_name: name, onboarded: opts.onboarded ?? true } });
  if (error || !data.user) throw new Error('creating a test user failed: ' + error?.message);
  return { id: data.user.id, email, password, name };
}

/** removes a test user and everything they own (the same path as "Delete account") */
export async function removeUser(u?: TestUser) {
  if (!u) return;
  await admin.rpc('delete_user_data', { p_user: u.id });
  await admin.auth.admin.deleteUser(u.id);
  await admin.from('mail_sink').delete().eq('to_address', u.email.toLowerCase());
}

/** the newest sign-in code emailed to this user (from the mail sink) */
export async function latestCode(u: TestUser): Promise<string> {
  let code = '';
  await expect.poll(async () => {
    const { data } = await admin.from('mail_sink').select('subject').eq('to_address', u.email.toLowerCase()).order('id', { ascending: false }).limit(1);
    code = (data?.[0]?.subject as string | undefined)?.match(/^(\d{6}) is your/)?.[1] ?? '';
    return code;
  }, { message: 'a sign-in code in mail_sink', timeout: 20_000 }).not.toBe('');
  return code;
}

/** email + password, then the emailed code; ends on the app with the sidebar visible */
export async function signIn(page: Page, u: TestUser, opts: { expectCode?: boolean } = {}) {
  await page.goto('/');
  await page.getByLabel('Email').fill(u.email);
  await page.getByLabel('Password').fill(u.password);
  await page.getByRole('button', { name: /^Sign in/ }).click();
  if (opts.expectCode !== false) {
    await expect(page.getByRole('heading', { name: 'Enter your sign-in code' })).toBeVisible();
    const code = await latestCode(u);
    await page.locator('.otp input').first().fill(code);
  }
  await expect(page.locator('.side')).toBeVisible({ timeout: 20_000 });
}

export async function signOut(page: Page) {
  await page.locator('button:has(.um-name)').click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByLabel('Email')).toBeVisible();
}

/** a ticket owned by the user, created directly in the database (fast set-up; the UI path is tested in the sample suite) */
export async function seedTicket(u: TestUser, title: string): Promise<{ id: string; ticketId: string }> {
  const { data, error } = await admin.from('tickets').insert({ user_id: u.id, Title: title, Project: 'GEN' }).select('TicketUUID, TicketId').single();
  if (error) throw new Error('seeding a ticket failed: ' + error.message);
  return { id: data.TicketUUID as string, ticketId: data.TicketId as string };
}

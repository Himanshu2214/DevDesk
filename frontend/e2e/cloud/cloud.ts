// Helpers for the cloud tests: a dedicated TEST Supabase project only (frontend/.env.e2e.local, never committed).
// Test users are created per run with random passwords and removed again afterwards; emails go to the mail_sink table
// (secret MAIL_SINK=table on the test project), so no real email is sent.
import { expect, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { ABANDONED_AFTER_MS, checkBundle, checkConfig, cleanupUser, describeFailures, e2eEmail, parseEnvFile, sweep, verifyProject, type AdminLike, type CleanupFailure } from './safety';

// every check that needs no network runs as soon as this file loads; nothing below can run if one fails
const config = checkConfig(parseEnvFile(readFileSync('.env.e2e.local', 'utf8')), process.env);
export const SUPABASE_URL = config.url;
/** the public (anon / publishable) key – what the app and every permission check use; never the service key */
export const ANON_KEY = config.anonKey;

/** service-role client for setting up, checking and cleaning test data (never used by the app under test) */
export const admin: SupabaseClient = createClient(config.url, config.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const adminLike = admin as unknown as AdminLike;

/** this run's id (set once in playwright.config.ts, shared by the set-up, the tests and the clean-up) */
const run = process.env.E2E_RUN ?? Date.now().toString(36);

let safe: Promise<void> | undefined;
/** The server-side checks (service key accepted, mail_sink present) and the app build check, once per process.
 *  Every helper that talks to Supabase awaits this first. */
export function ensureSafe(): Promise<void> {
  return safe ??= (async () => {
    await verifyProject(adminLike, { url: config.url, key: config.anonKey, fetch: (u, init) => fetch(u, init) });
    const dir = join('e2e-dist-cloud', 'assets');
    if (!existsSync(dir)) throw new Error('The cloud test build (e2e-dist-cloud) is missing; run the tests with npm run e2e:cloud.');
    checkBundle(readdirSync(dir).filter(f => f.endsWith('.js')).map(name => ({ name, text: readFileSync(join(dir, name), 'utf8') })), config.ref, config.serviceKey);
  })();
}

export interface TestUser { id: string; email: string; password: string; name: string }

/** a fresh confirmed account for this run; onboarded unless asked otherwise */
export async function createUser(role: string, opts: { onboarded?: boolean } = {}): Promise<TestUser> {
  await ensureSafe();
  const email = e2eEmail(role, run, randomBytes(3).toString('hex'));
  const password = randomBytes(18).toString('base64url');
  const name = `E2E ${role[0].toUpperCase()}${role.slice(1)}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true,
    user_metadata: { full_name: name, onboarded: opts.onboarded ?? true, e2e_run: run } });
  if (error || !data.user) throw new Error('creating a test user failed: ' + error?.message);
  return { id: data.user.id, email, password, name };
}

/** Removes test users and everything they own (the same path as "Delete account"). Every user and step is attempted;
 *  any failure then fails the test run with the user and the step that failed. */
export async function removeUsers(...users: (TestUser | undefined)[]) {
  await ensureSafe();
  const failures: CleanupFailure[] = [];
  for (const u of users) if (u) failures.push(...await cleanupUser(adminLike, { id: u.id, email: u.email, user_metadata: { e2e_run: run } }));
  if (failures.length) throw new Error(describeFailures(failures));
}

/** abandoned E2E accounts of earlier runs (see ABANDONED_AFTER_MS) and, at the end, this run's leftovers */
export async function sweepAccounts(includeThisRun: boolean) {
  await ensureSafe();
  const r = await sweep(adminLike, { run: includeThisRun ? run : undefined, olderThanMs: ABANDONED_AFTER_MS });
  if (r.failures.length) throw new Error(describeFailures(r.failures));
  return r.removed.length;
}

/** the newest mail_sink row for this user so far (0 if none): take it before a sign-in, so latestCode waits for the
 *  code of THAT sign-in and never returns an older one still in the sink */
export async function codeMark(u: TestUser): Promise<number> {
  await ensureSafe();
  const { data } = await admin.from('mail_sink').select('id').eq('to_address', u.email.toLowerCase()).order('id', { ascending: false }).limit(1);
  return Number(data?.[0]?.id ?? 0);
}

/** the newest sign-in code emailed to this user after `mark` (from the mail sink) */
export async function latestCode(u: TestUser, mark = 0): Promise<string> {
  await ensureSafe();
  let code = '';
  await expect.poll(async () => {
    const { data } = await admin.from('mail_sink').select('subject').eq('to_address', u.email.toLowerCase()).gt('id', mark).order('id', { ascending: false }).limit(1);
    code = (data?.[0]?.subject as string | undefined)?.match(/^(\d{6}) is your/)?.[1] ?? '';
    return code;
  }, { message: 'a sign-in code in mail_sink', timeout: 20_000 }).not.toBe('');
  return code;
}

/** email + password, then the emailed code; ends on the app with the sidebar visible */
export async function signIn(page: Page, u: TestUser, opts: { expectCode?: boolean } = {}) {
  await page.goto('/');
  await page.getByLabel('Email').fill(u.email);
  await page.getByLabel('Password', { exact: true }).fill(u.password);
  const mark = await codeMark(u);
  // what the code check answered when it did not succeed: named in the failure instead of only "element not found"
  const verifyFailures: string[] = [];
  const onResponse = async (r: import('@playwright/test').Response) => {
    if (r.url().endsWith('/functions/v1/verify-login-code') && !r.ok()) verifyFailures.push(`${r.status()} ${(await r.text().catch(() => '')).slice(0, 200)}`);
  };
  page.on('response', onResponse);
  await page.getByRole('button', { name: /^Sign in/ }).click();
  if (opts.expectCode !== false) {
    await expect(page.getByRole('heading', { name: 'Enter your sign-in code' })).toBeVisible();
    const code = await latestCode(u, mark);
    await page.locator('.otp input').first().fill(code);
  }
  try { await expect(page.locator('.side')).toBeVisible({ timeout: 20_000 }) }
  catch (e) { throw verifyFailures.length ? new Error(`verify-login-code answered: ${verifyFailures.join(' | ')}\n${(e as Error).message}`) : e }
  finally { page.off('response', onResponse) }
}

export async function signOut(page: Page) {
  await page.locator('button:has(.um-name)').click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByLabel('Email')).toBeVisible();
}

/** a ticket owned by the user, created directly in the database (fast set-up; the UI path is tested in the sample suite) */
export async function seedTicket(u: TestUser, title: string): Promise<{ id: string; ticketId: string }> {
  await ensureSafe();
  const { data, error } = await admin.from('tickets').insert({ user_id: u.id, Title: title, Project: 'GEN' }).select('TicketUUID, TicketId').single();
  if (error) throw new Error('seeding a ticket failed: ' + error.message);
  return { id: data.TicketUUID as string, ticketId: data.TicketId as string };
}

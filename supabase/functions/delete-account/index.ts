// Deletes the caller's account: their attachment files, their rows (delete_user_data), then the auth user.
// Every row also references auth.users with "on delete cascade", so nothing is left behind either way.
// Only a session that has passed the second step (emailed code or authenticator app) may do this.
import { admin, caller, cors, json, sessionOk } from '../_shared/login-code.ts';

const BUCKET = 'attachments';

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  const who = await caller(req);
  if (who instanceof Response) return who;
  const { user, sessionId, aal } = who;
  const db = admin();

  if (!(await sessionOk(db, user.id, sessionId, aal))) return json(403, { error: 'Sign in again with your code before deleting the account.' });

  // files first: storage is not covered by the database cascade
  for (;;) {
    const { data: files, error } = await db.storage.from(BUCKET).list(user.id, { limit: 1000 });
    if (error) { console.error('delete-account list', error.message); return json(500, { error: `Your files could not be removed (${error.message}). Nothing was deleted.` }) }
    if (!files?.length) break;
    const { error: rmErr } = await db.storage.from(BUCKET).remove(files.map(f => `${user.id}/${f.name}`));
    if (rmErr) return json(500, { error: 'Your files could not be removed. Nothing was deleted.' });
    if (files.length < 1000) break;
  }

  // the rows next (migration 20261109): a failure here comes back with Postgres's own message
  const { error: dataErr } = await db.rpc('delete_user_data', { p_user: user.id });
  if (dataErr) {
    console.error('delete-account data', user.id, dataErr.code, dataErr.message);
    return json(500, { error: dataErr.code === 'PGRST202' ? 'The account deletion is not set up yet – run the migration 20261109000000_delete_user_data.sql in Supabase.' : `Your data could not be deleted (${dataErr.message}). Nothing was changed apart from your files.` });
  }

  const { error } = await db.auth.admin.deleteUser(user.id);
  if (error) {
    // the reason is shown to the user (and in the function logs), so a failure can be fixed instead of guessed
    console.error('delete-account', user.id, error.status, error.message);
    return json(500, { error: `The account could not be deleted (${error.message || 'unknown reason'}). Your data was already removed; try again to finish.` });
  }
  return json(200, { deleted: true });
});

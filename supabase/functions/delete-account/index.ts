// Deletes the caller's account: their attachment files, then the auth user. Every table row references
// auth.users with "on delete cascade", so the database removes all of the user's data with it.
// Only a session that has passed the second step (emailed code or authenticator app) may do this.
import { admin, caller, cors, json } from '../_shared/login-code.ts';

const BUCKET = 'attachments';

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  const who = await caller(req);
  if (who instanceof Response) return who;
  const { user, sessionId, aal } = who;
  const db = admin();

  const { data: verified } = await db.from('verified_sessions').select('session_id').eq('session_id', sessionId).eq('user_id', user.id).maybeSingle();
  if (!verified && aal !== 'aal2') return json(403, { error: 'Sign in again with your code before deleting the account.' });

  // files first: storage is not covered by the database cascade
  for (;;) {
    const { data: files, error } = await db.storage.from(BUCKET).list(user.id, { limit: 1000 });
    if (error) return json(500, { error: 'Your files could not be removed. Nothing was deleted.' });
    if (!files?.length) break;
    const { error: rmErr } = await db.storage.from(BUCKET).remove(files.map(f => `${user.id}/${f.name}`));
    if (rmErr) return json(500, { error: 'Your files could not be removed. Nothing was deleted.' });
    if (files.length < 1000) break;
  }

  const { error } = await db.auth.admin.deleteUser(user.id);
  if (error) return json(500, { error: 'The account could not be deleted. Try again.' });
  return json(200, { deleted: true });
});

// Google sign-in in the Android app. Google does not allow its sign-in page inside an app's web view, so the app opens
// it in the phone's browser (a Chrome Custom Tab over the app). After the user picks their account, Supabase sends the
// browser to com.slatespace.app://auth-callback?code=…, which Android hands back to the app (intent filter in
// AndroidManifest.xml); the app then trades the code for a session (PKCE – the code is useless without the verifier that
// stays in the app). The 2-step code follows as for every sign-in.
// Supabase must allow that address: Authentication → URL Configuration → Redirect URLs.
// Loaded only inside the app (dynamic import), so the web build does not carry it.
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { sb } from './supabase';

export const APP_AUTH_CALLBACK = 'com.slatespace.app://auth-callback';

let report: (message: string) => void = () => {};
let listening = false;

/** shows sign-in problems in the screen that is open now (the sign-in screen sets this when it mounts) */
export function onNativeSignInError(fn: (message: string) => void) { report = fn }

/** starts listening for the link back from the browser – once per app start */
export function listenForNativeSignIn() {
  if (listening) return;
  listening = true;
  void App.addListener('appUrlOpen', async ({ url }) => {
    if (!url.startsWith(APP_AUTH_CALLBACK)) return;
    await Browser.close().catch(() => { /* already closed */ });
    const u = new URL(url);
    const params = new URLSearchParams(u.search || u.hash.replace(/^#/, ''));
    const problem = params.get('error_description') || params.get('error');
    if (problem) return report(problem);
    const code = params.get('code');
    if (!code) return report('Google sign-in did not finish. Try again.');
    const { error } = await sb().auth.exchangeCodeForSession(code);
    if (error) report(error.message);
    // success: Supabase announces SIGNED_IN and the sign-in screen moves on to the emailed code
  });
}

/** opens Google's sign-in in the phone's browser; null when it opened, otherwise why not */
export async function googleSignInNative(): Promise<string | null> {
  listenForNativeSignIn();
  const { data, error } = await sb().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: APP_AUTH_CALLBACK, skipBrowserRedirect: true } });
  if (error || !data?.url) return error?.message ?? 'Google sign-in could not start. Try again.';
  await Browser.open({ url: data.url });
  return null;
}

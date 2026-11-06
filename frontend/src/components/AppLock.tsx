// App lock (Android app, when switched on in Account): covers the app when it opens and when it comes back after more
// than a minute in the background, until the person unlocks with fingerprint, face or the phone's screen lock.
// Cancelling the prompt leaves the lock screen with Unlock and Sign out, so a broken sensor never locks anyone out.
import { useCallback, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { sb } from '../lib/supabase';

const KEY = 'slate-app-lock';
const AWAY_MS = 60_000;
export const appLockOn = () => { try { return localStorage.getItem(KEY) === '1' } catch { return false } };
export const setAppLockOn = (on: boolean) => { try { if (on) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY) } catch { /* private mode */ } };

export function AppLock() {
  const native = Capacitor.isNativePlatform();
  const [locked, setLocked] = useState(() => native && appLockOn());
  const [asking, setAsking] = useState(false);
  const tryUnlock = useCallback(async () => {
    setAsking(true);
    const ok = await (await import('../lib/appLock')).unlock();
    setAsking(false);
    if (ok) setLocked(false);
  }, []);

  useEffect(() => { if (locked) void tryUnlock() }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!native) return;
    let awaySince = 0;
    const handle = import('@capacitor/app').then(({ App }) => App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) { awaySince = Date.now(); return }
      if (appLockOn() && awaySince && Date.now() - awaySince > AWAY_MS) { setLocked(true); void tryUnlock() }
      awaySince = 0;
    }));
    return () => { void handle.then(h => h.remove()) };
  }, [native, tryUnlock]);

  if (!locked) return null;
  return <div className="app-lock" role="dialog" aria-modal="true" aria-label="SLATE·SPACE is locked">
    <img src="./icons/icon-192.png" alt="" width={72} height={72} />
    <b>SLATE·SPACE is locked</b>
    <p>Unlock with your fingerprint, face or screen lock.</p>
    <button className="btn primary" onClick={tryUnlock} disabled={asking}>Unlock</button>
    <button className="btn" onClick={() => { setAppLockOn(false); void sb().auth.signOut() }}>Sign out</button>
  </div>;
}

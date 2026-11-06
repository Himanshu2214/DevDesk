// "Get the Android app": the signed APK is served next to the website (public/downloads/slatespace.apk – copied there
// after each `npm run build:app`, see android/README). Offered on the website of the cloud build only: never inside the
// app itself, and not on iPhones / iPads (an APK cannot run there).
import { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Icon } from './Icons';

export const APK_URL = './downloads/slatespace.apk';
const isCloud = import.meta.env.VITE_BACKEND === 'supabase';
const isAndroid = () => /Android/i.test(navigator.userAgent);
const isApple = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
/** the website (cloud build) on anything but an iPhone / iPad, and not inside the app */
export const offerAndroidApp = () => isCloud && !Capacitor.isNativePlatform() && !isApple();

/** small text link (sign-in screen footer) */
export function AndroidAppLink() {
  if (!offerAndroidApp()) return null;
  return <><span aria-hidden="true"> · </span><a href={APK_URL} download="slatespace.apk">Android app</a></>;
}

/** Account → Android app */
export function AndroidAppSection({ Section }: { Section: (p: { title: string; sub: string; children: React.ReactNode }) => React.ReactElement }) {
  if (!offerAndroidApp()) return null;
  return <Section title="Android app" sub="SLATE·SPACE as an app on your Android phone: full screen, sign-in with Google, reminders for due tickets.">
    <div className="apk-get">
      <img src="./icons/icon-192.png" alt="" width={48} height={48} />
      <span><b>SLATE·SPACE for Android</b><small>Android 7.0 or newer · about 8 MB</small></span>
      <a className="btn primary" href={APK_URL} download="slatespace.apk"><Icon name="download" size={15} />Download</a>
    </div>
    <ol className="muted apk-steps">
      <li>Open the downloaded <b>slatespace.apk</b> on your phone (from the browser&apos;s downloads or the Files app).</li>
      <li>Android asks to allow installing apps from that source – allow it once.</li>
      <li>If Play Protect says it does not know the app, choose <b>Install anyway</b> (it is not from the Play Store yet).</li>
    </ol>
  </Section>;
}

const DISMISSED = 'slate-android-banner';
/** one banner on Android phones' browsers until it is used or closed */
export function AndroidAppBanner() {
  const [shown, setShown] = useState(() => { try { return offerAndroidApp() && isAndroid() && localStorage.getItem(DISMISSED) !== '1' } catch { return false } });
  if (!shown) return null;
  const close = () => { try { localStorage.setItem(DISMISSED, '1') } catch { /* private mode: shows again next time */ } setShown(false) };
  return <div className="apk-banner" role="region" aria-label="Android app">
    <img src="./icons/icon-192.png" alt="" width={36} height={36} />
    <span><b>SLATE·SPACE for Android</b><small>Full screen, Google sign-in, reminders</small></span>
    <a className="btn primary" href={APK_URL} download="slatespace.apk" onClick={close}>Install</a>
    <button className="ib" aria-label="Not now" onClick={close}><Icon name="x" /></button>
  </div>;
}

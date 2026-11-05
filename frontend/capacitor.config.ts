// Standalone Android app (Capacitor): the cloud build of SLATE·SPACE is bundled into the APK and runs from the phone
// itself in the app's own window – no browser, no website loading. Only the data comes from Supabase.
// Build: npm run build:app  (vite build --mode supabase --outDir dist-app, then cap sync android) – see android/README.md.
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.slatespace.app',          // same package as the earlier web-app wrapper, so it installs as an update
  appName: 'SLATE·SPACE',
  webDir: 'dist-app',
  android: {
    backgroundColor: '#13161b',         // no white flash before the first paint
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
  server: { androidScheme: 'https' },   // the app's pages are served as https://localhost inside the APK
  plugins: {
    // keep the app clear of the status and navigation bars (Android 15+ draws apps edge to edge); light icons on the dark bars
    SystemBars: { insetsHandling: 'native', style: 'DARK' },
  },
};

export default config;

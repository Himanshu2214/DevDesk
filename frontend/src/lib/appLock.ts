// App lock in the Android app: fingerprint, face or iris – or the phone's own screen lock (PIN / pattern / password) as
// the fallback. Switched on per phone in Account → App lock; the plugin is @capgo/capacitor-native-biometric.
// Loaded only inside the app (dynamic import).
import { BiometryType, NativeBiometric } from '@capgo/capacitor-native-biometric';

/** does this phone have a fingerprint, face or a screen lock that can unlock the app? */
export async function lockAvailable(): Promise<boolean> {
  try { return (await NativeBiometric.isAvailable({ useFallback: true })).isAvailable } catch { return false }
}

/** shows Android's unlock prompt; true when the person proved it is them */
export async function unlock(): Promise<boolean> {
  try {
    await NativeBiometric.verifyIdentity({
      title: 'Unlock SLATE·SPACE', subtitle: 'Fingerprint, face or your screen lock', maxAttempts: 5,
      allowedBiometryTypes: [BiometryType.FINGERPRINT, BiometryType.FACE_AUTHENTICATION, BiometryType.IRIS_AUTHENTICATION, BiometryType.DEVICE_CREDENTIAL],
    });
    return true;
  } catch { return false }
}

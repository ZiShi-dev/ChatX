/** Build-time flag: true when Firebase (google-services.json + server FIREBASE_*) is configured. */
export function fcmEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_FCM === 'true';
}

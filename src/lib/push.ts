import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

// Server-side push send via Firebase Cloud Messaging. No-ops (logs and
// returns) when FIREBASE_SERVICE_ACCOUNT_JSON isn't configured yet, so the
// rest of the app - in particular the Notify feature - keeps working
// exactly as before until the mobile app's Firebase project is set up. The
// in-app popup is always the primary channel; push is a bonus on top of it,
// so a push failure here is logged and swallowed rather than surfaced.
let app: App | null | undefined;

function getFirebaseApp(): App | null {
  if (app !== undefined) return app;
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!json) {
    app = null;
    return app;
  }
  try {
    const existing = getApps();
    app = existing[0] ?? initializeApp({ credential: cert(JSON.parse(json)) });
  } catch (err) {
    console.error("push: failed to initialize Firebase Admin", err);
    app = null;
  }
  return app;
}

export async function sendPushToTokens(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>,
) {
  if (tokens.length === 0) return;
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) return;

  try {
    await getMessaging(firebaseApp).sendEachForMulticast({ tokens, notification: { title, body }, data });
  } catch (err) {
    console.error("push: send failed", err);
  }
}

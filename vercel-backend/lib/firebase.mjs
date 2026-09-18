import admin from "firebase-admin";

let initialized = false;

export function getFirestore() {
  ensureFirebase();
  return admin.firestore();
}

export function getMessaging() {
  ensureFirebase();
  return admin.messaging();
}

function ensureFirebase() {
  if (initialized) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not set");
  }
  const serviceAccount = JSON.parse(raw);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  initialized = true;
}

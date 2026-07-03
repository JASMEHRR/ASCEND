/**
 * Firebase initialization and auth helpers.
 *
 * The Firebase *web* config (apiKey, projectId, ...) is public by design — access
 * is controlled by Firestore Security Rules, not by hiding these values. They are
 * read from `VITE_FIREBASE_*` env vars when present (so dev/prod can use different
 * projects) and fall back to the committed `firebase-applet-config.json`.
 *
 * Genuine secrets (e.g. GEMINI_API_KEY) live server-side only — never here.
 */
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  onAuthStateChanged,
  signOut,
  type User,
  type UserCredential,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import fallbackConfig from '../../firebase-applet-config.json';

const env = import.meta.env as Record<string, string | undefined>;

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? fallbackConfig.apiKey,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? fallbackConfig.authDomain,
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? fallbackConfig.projectId,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? fallbackConfig.storageBucket,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? fallbackConfig.messagingSenderId,
  appId: env.VITE_FIREBASE_APP_ID ?? fallbackConfig.appId,
};

const databaseId = env.VITE_FIREBASE_DATABASE_ID ?? fallbackConfig.firestoreDatabaseId;

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = databaseId ? getFirestore(app, databaseId) : getFirestore(app);

const googleProvider = new GoogleAuthProvider();

/** Subscribe to auth state changes. Returns an unsubscribe function. */
export function subscribeToAuth(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

export function signInWithGoogle(): Promise<UserCredential> {
  return signInWithPopup(auth, googleProvider);
}

export function signInWithEmail(email: string, password: string): Promise<UserCredential> {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function signUpWithEmail(email: string, password: string): Promise<UserCredential> {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  // Best-effort verification email; failure shouldn't block sign-up.
  try {
    await sendEmailVerification(credential.user);
  } catch {
    /* ignore */
  }
  return credential;
}

export function resetPassword(email: string): Promise<void> {
  return sendPasswordResetEmail(auth, email);
}

export function logout(): Promise<void> {
  return signOut(auth);
}

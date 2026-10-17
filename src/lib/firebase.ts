import { getApps, initializeApp, type FirebaseOptions } from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';

const firebaseConfig: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const requiredClientFields: Array<keyof FirebaseOptions> = ['apiKey', 'authDomain', 'projectId', 'appId'];
export const firebaseClientConfigured = requiredClientFields.every((key) => {
  const value = firebaseConfig[key];
  return typeof value === 'string' && value.trim().length > 0;
});

const firebaseApp = firebaseClientConfigured
  ? (getApps().find((app) => app.name === 'nexoss-client') || initializeApp(firebaseConfig, 'nexoss-client'))
  : null;

export const auth = firebaseApp ? getAuth(firebaseApp) : null;

if (auth && import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL) {
  connectAuthEmulator(auth, import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL, { disableWarnings: true });
}

export async function signInWithGoogle(): Promise<User> {
  if (!auth) throw new Error('Falta configurar Firebase Authentication en el entorno local.');
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  if (!auth) throw new Error('Falta configurar Firebase Authentication en el entorno local.');
  const result = await signInWithEmailAndPassword(auth, email.trim(), password);
  return result.user;
}

export async function createEmailAccount(email: string, password: string): Promise<User> {
  if (!auth) throw new Error('Falta configurar Firebase Authentication en el entorno local.');
  const result = await createUserWithEmailAndPassword(auth, email.trim(), password);
  await sendEmailVerification(result.user);
  return result.user;
}

export async function resendVerificationEmail(): Promise<void> {
  if (!auth?.currentUser) throw new Error('Inicia sesión antes de solicitar la verificación.');
  await sendEmailVerification(auth.currentUser);
}

export async function refreshCurrentFirebaseUser(): Promise<void> {
  if (!auth?.currentUser) throw new Error('No hay sesión Firebase.');
  await auth.currentUser.reload();
  await auth.currentUser.getIdToken(true);
}

export async function signOutFirebaseUser(): Promise<void> {
  if (auth) await signOut(auth);
}

export { onAuthStateChanged };
export type { User as FirebaseUser };


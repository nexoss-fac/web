export interface GoogleAuthState {
  isAuthenticated: boolean;
  user: { displayName: string | null; email: string | null; photoURL: string | null } | null;
  accessToken: string | null;
}

export interface GoogleUser {
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

/** External identity is intentionally unavailable in the local NEXOSS copy. */
export async function signInWithGoogle(): Promise<{ user: GoogleUser; accessToken: string }> {
  throw new Error('Google Sheets no está conectado en este entorno local.');
}

export function getAccessToken(): string | null { return null; }
export function setAccessToken(_token: string): void {}
export async function signOutFromGoogle(): Promise<void> {}
export function onGoogleAuthStateChanged(callback: (state: GoogleAuthState) => void): () => void {
  callback({ isAuthenticated: false, user: null, accessToken: null });
  return () => {};
}

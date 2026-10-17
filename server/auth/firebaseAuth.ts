import { existsSync } from 'node:fs';
import { applicationDefault, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

export interface FirebaseIdentity {
  uid: string;
  email?: string;
  emailVerified?: boolean;
  signInProvider?: string;
}

export interface VerifiedFirebaseToken extends FirebaseIdentity {
  [claim: string]: unknown;
}

export type FirebaseIdTokenVerifier = (token: string) => Promise<VerifiedFirebaseToken>;

export interface FirebaseAuthenticatedRequest extends Request {
  firebaseIdentity?: FirebaseIdentity;
}

export class FirebaseAdminConfigurationError extends Error {
  constructor() {
    super('Firebase Admin authentication is not configured.');
    this.name = 'FirebaseAdminConfigurationError';
  }
}

let adminApp: App | undefined;

export function assertFirebaseAdminCredentialSource(
  environment: NodeJS.ProcessEnv = process.env,
  fileExists: (filePath: string) => boolean = existsSync,
): void {
  if (environment.FIREBASE_AUTH_EMULATOR_HOST?.trim()) return;

  const credentialPath = environment.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (credentialPath) {
    if (fileExists(credentialPath)) return;
    throw new FirebaseAdminConfigurationError();
  }

  if (environment.K_SERVICE?.trim() || environment.K_REVISION?.trim()) return;
  throw new FirebaseAdminConfigurationError();
}

function getFirebaseAdminApp(): App {
  if (adminApp) return adminApp;

  const projectId = process.env.FIREBASE_PROJECT_ID?.trim() || process.env.GOOGLE_CLOUD_PROJECT?.trim();
  if (!projectId) throw new FirebaseAdminConfigurationError();

  const emulatorEnabled = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST?.trim());
  assertFirebaseAdminCredentialSource();
  const existingApp = getApps().find((app) => app.name === 'nexoss-auth');
  adminApp = existingApp || initializeApp({
    projectId,
    ...(emulatorEnabled ? {} : { credential: applicationDefault() }),
  }, 'nexoss-auth');
  return adminApp;
}

/** Verifica firma, emisor, proyecto, caducidad y revocación mediante Firebase Admin. */
export const verifyFirebaseIdToken: FirebaseIdTokenVerifier = async (token) => {
  const decoded = await getAuth(getFirebaseAdminApp()).verifyIdToken(token, true);
  return {
    ...decoded,
    uid: decoded.uid,
    email: decoded.email,
    emailVerified: decoded.email_verified,
    signInProvider: decoded.firebase?.sign_in_provider,
  };
};

/**
 * Solo usa la identidad verificada. Los claims de rol/empresa, cabeceras
 * alternativas y valores del cuerpo nunca se copian al contexto de identidad.
 */
export function createFirebaseAuthMiddleware(verifyToken: FirebaseIdTokenVerifier): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const match = /^Bearer\s+([^\s]+)$/i.exec(req.get('authorization') || '');
    if (!match) {
      res.status(401).json({ error: 'Se requiere un token Firebase válido.' });
      return;
    }

    try {
      const decoded = await verifyToken(match[1]);
      if (!decoded || typeof decoded.uid !== 'string' || !decoded.uid.trim()) {
        res.status(401).json({ error: 'El token Firebase no es válido o ha vencido.' });
        return;
      }

      (req as FirebaseAuthenticatedRequest).firebaseIdentity = {
        uid: decoded.uid,
        ...(typeof decoded.email === 'string' ? { email: decoded.email } : {}),
        ...(typeof decoded.emailVerified === 'boolean' ? { emailVerified: decoded.emailVerified } : {}),
        ...(typeof decoded.signInProvider === 'string' ? { signInProvider: decoded.signInProvider } : {}),
      };
      next();
    } catch (error) {
      if (error instanceof FirebaseAdminConfigurationError) {
        res.status(503).json({ error: 'La autenticación Firebase del servidor no está configurada.' });
        return;
      }
      res.status(401).json({ error: 'El token Firebase no es válido o ha vencido.' });
    }
  };
}

export const requireFirebaseAuth = createFirebaseAuthMiddleware(verifyFirebaseIdToken);

import test from 'node:test';
import assert from 'node:assert/strict';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { assertFirebaseAdminCredentialSource, createFirebaseAuthMiddleware, FirebaseAdminConfigurationError, type FirebaseIdentity, type VerifiedFirebaseToken } from './firebaseAuth.ts';

function invoke(middleware: RequestHandler, authorization?: string, extra: Record<string, unknown> = {}) {
  const req = {
    get: (name: string) => name.toLowerCase() === 'authorization' ? authorization : undefined,
    body: extra,
    headers: { 'x-user-id': 'browser-controlled-user', 'x-company-id': 'browser-controlled-company' },
  } as unknown as Request & { firebaseIdentity?: FirebaseIdentity };
  const result: { status?: number; body?: unknown; nextCalled: boolean } = { nextCalled: false };
  const res = {
    status(code: number) { result.status = code; return this; },
    json(body: unknown) { result.body = body; return this; },
  } as unknown as Response;
  const next = (() => { result.nextCalled = true; }) as NextFunction;
  return Promise.resolve(middleware(req, res, next)).then(() => ({ ...result, identity: req.firebaseIdentity }));
}

test('rechaza token ausente con HTTP 401', async () => {
  let verifierCalled = false;
  const result = await invoke(createFirebaseAuthMiddleware(async () => {
    verifierCalled = true;
    throw new Error('no debe verificarse');
  }));
  assert.equal(result.status, 401);
  assert.equal(result.nextCalled, false);
  assert.equal(verifierCalled, false);
});

test('rechaza token inválido con HTTP 401', async () => {
  const result = await invoke(createFirebaseAuthMiddleware(async () => { throw new Error('invalid token'); }), 'Bearer token-invalido');
  assert.equal(result.status, 401);
  assert.equal(result.nextCalled, false);
});

test('rechaza token vencido con HTTP 401', async () => {
  const expired = Object.assign(new Error('expired'), { code: 'auth/id-token-expired' });
  const result = await invoke(createFirebaseAuthMiddleware(async () => { throw expired; }), 'Bearer token-vencido');
  assert.equal(result.status, 401);
  assert.equal(result.nextCalled, false);
});

test('falla cerrado con HTTP 503 si Firebase Admin no está configurado', async () => {
  const result = await invoke(createFirebaseAuthMiddleware(async () => { throw new FirebaseAdminConfigurationError(); }), 'Bearer token-de-prueba');
  assert.equal(result.status, 503);
  assert.equal(result.nextCalled, false);
});

test('acepta Application Default Credentials de Cloud Run sin exigir una clave descargada', () => {
  assert.doesNotThrow(() => assertFirebaseAdminCredentialSource({
    K_SERVICE: 'nexoss-api',
    FIREBASE_PROJECT_ID: 'nexoss-dabfe',
  }, () => false));
});

test('exige credencial explícita fuera de Cloud Run y rechaza rutas de clave inexistentes', () => {
  assert.throws(
    () => assertFirebaseAdminCredentialSource({ FIREBASE_PROJECT_ID: 'nexoss-dabfe' }, () => false),
    FirebaseAdminConfigurationError,
  );
  assert.throws(
    () => assertFirebaseAdminCredentialSource({
      GOOGLE_APPLICATION_CREDENTIALS: 'C:\\missing\\service-account.json',
    }, () => false),
    FirebaseAdminConfigurationError,
  );
});

test('acepta identidad verificada e ignora rol y empresa enviados por el navegador', async () => {
  let checkedToken = '';
  const decoded: VerifiedFirebaseToken = {
    uid: 'firebase-user-1',
    email: 'user@example.invalid',
    emailVerified: true,
    signInProvider: 'google.com',
    role: 'owner',
    companyId: 'company-from-token-claim',
  };
  const result = await invoke(createFirebaseAuthMiddleware(async (token) => {
    checkedToken = token;
    return decoded;
  }), 'Bearer signed-firebase-token', { uid: 'browser-uid', role: 'admin', companyId: 'browser-company' });

  assert.equal(checkedToken, 'signed-firebase-token');
  assert.equal(result.status, undefined);
  assert.equal(result.nextCalled, true);
  assert.deepEqual(result.identity, {
    uid: 'firebase-user-1',
    email: 'user@example.invalid',
    emailVerified: true,
    signInProvider: 'google.com',
  });
});

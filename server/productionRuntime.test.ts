import test from 'node:test';
import assert from 'node:assert/strict';
import { assertProductionRuntimeSupported, ProductionRuntimeBlockedError } from './productionRuntime.ts';

test('permite el runtime de desarrollo local', () => {
  assert.doesNotThrow(() => assertProductionRuntimeSupported({
    NODE_ENV: 'development',
    FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  }));
});

test('bloquea producción si Firebase Auth Emulator está configurado', () => {
  assert.throws(
    () => assertProductionRuntimeSupported({
      NODE_ENV: 'production',
      FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
    }),
    (error: unknown) => error instanceof ProductionRuntimeBlockedError && error.message.includes('FIREBASE_AUTH_EMULATOR_HOST'),
  );
});

test('bloquea producción mientras falte la configuración PostgreSQL central', () => {
  assert.throws(
    () => assertProductionRuntimeSupported({
      NODE_ENV: 'production',
      FIREBASE_PROJECT_ID: 'nexoss-dabfe',
    }),
    (error: unknown) => error instanceof ProductionRuntimeBlockedError && error.message.includes('NEXOSS_PLATFORM_STORAGE'),
  );
});

test('permite producción con credencial Firebase Admin JSON válida para el proyecto', () => {
  assert.doesNotThrow(() => assertProductionRuntimeSupported({
    NODE_ENV: 'production',
    NEXOSS_PLATFORM_STORAGE: 'postgres',
    CONTROL_PLANE_DATABASE_URL: 'postgresql://user:pass@host.example/nexoss_control_plane',
    FIREBASE_PROJECT_ID: 'nexoss-dabfe',
    FIREBASE_ADMIN_CREDENTIALS_JSON: JSON.stringify({
      project_id: 'nexoss-dabfe',
      client_email: 'firebase-admin@nexoss-dabfe.iam.gserviceaccount.com',
      private_key: '-----BEGIN PRIVATE KEY-----\\nprivate-key-material\\n-----END PRIVATE KEY-----',
    }),
  }));
});

test('bloquea producción con credencial Firebase Admin JSON inválida', () => {
  assert.throws(
    () => assertProductionRuntimeSupported({
      NODE_ENV: 'production',
      NEXOSS_PLATFORM_STORAGE: 'postgres',
      CONTROL_PLANE_DATABASE_URL: 'postgresql://user:pass@host.example/nexoss_control_plane',
      FIREBASE_PROJECT_ID: 'nexoss-dabfe',
      FIREBASE_ADMIN_CREDENTIALS_JSON: JSON.stringify({
        project_id: 'otro-proyecto',
        client_email: 'firebase-admin@otro-proyecto.iam.gserviceaccount.com',
        private_key: '-----BEGIN PRIVATE KEY-----\\nprivate-key-material\\n-----END PRIVATE KEY-----',
      }),
    }),
    (error: unknown) => error instanceof ProductionRuntimeBlockedError && error.message.includes('FIREBASE_ADMIN_CREDENTIALS_JSON'),
  );
});

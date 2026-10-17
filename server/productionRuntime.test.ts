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

test('bloquea producción mientras las rutas sigan usando persistencia JSON local', () => {
  assert.throws(
    () => assertProductionRuntimeSupported({
      NODE_ENV: 'production',
      FIREBASE_PROJECT_ID: 'nexoss-dabfe',
    }),
    (error: unknown) => error instanceof ProductionRuntimeBlockedError && error.message.includes('repositorio PostgreSQL'),
  );
});

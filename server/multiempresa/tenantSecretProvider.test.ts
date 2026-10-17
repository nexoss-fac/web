import assert from 'node:assert/strict';
import test from 'node:test';
import { LocalEnvironmentTenantSecretProvider } from './tenantSecretProvider.ts';

test('resuelve una conexión operativa solo desde el entorno local', async () => {
  const provider = new LocalEnvironmentTenantSecretProvider({
    NODE_ENV: 'development',
    MAKD_SHOP_DATABASE_URL: 'postgresql://user:pass@localhost/makd',
  });
  assert.equal(
    await provider.getConnectionString('local-env:MAKD_SHOP_DATABASE_URL'),
    'postgresql://user:pass@localhost/makd',
  );
});

test('rechaza referencias al control plane', async () => {
  const provider = new LocalEnvironmentTenantSecretProvider({
    NODE_ENV: 'development',
    CONTROL_PLANE_DATABASE_URL: 'postgresql://user:pass@localhost/control',
  });
  await assert.rejects(provider.getConnectionString('local-env:CONTROL_PLANE_DATABASE_URL'));
});

test('rechaza referencias de entorno en producción', async () => {
  const provider = new LocalEnvironmentTenantSecretProvider({
    NODE_ENV: 'production',
    MAKD_SHOP_DATABASE_URL: 'postgresql://user:pass@localhost/makd',
  });
  await assert.rejects(provider.getConnectionString('local-env:MAKD_SHOP_DATABASE_URL'));
});

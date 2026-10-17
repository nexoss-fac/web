import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAuthorizedTenant, TenantResolutionError, type MembershipRecord } from './tenantResolver.ts';

const identity = { provider: 'firebase', subject: 'user-test-001', email: 'test@example.invalid' };
const activeMembership: MembershipRecord = {
  companyId: 'company-a', slug: 'empresa-a', companyStatus: 'active', membershipStatus: 'active',
  role: 'owner', secretReference: 'secret://tenant/company-a', connectionStatus: 'ready',
  modules: ['pos', 'inventory', 'reports', 'accounting'],
};
const repo = (record: MembershipRecord | null) => ({ findMembership: async () => record });
const secrets = (value = 'postgresql://test_user:test_password@localhost:5432/test_db') => ({ getConnectionString: async () => value });

async function rejectsCode(promise: Promise<unknown>, code: string, statusCode: number) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof TenantResolutionError);
    assert.equal(error.code, code);
    assert.equal(error.statusCode, statusCode);
    return true;
  });
}

test('rechaza solicitud sin empresa', async () => {
  await rejectsCode(resolveAuthorizedTenant({ identity, requestedCompanyId: '', repository: repo(activeMembership), secrets: secrets() }), 'COMPANY_REQUIRED', 400);
});

test('rechaza identidad ausente', async () => {
  await rejectsCode(resolveAuthorizedTenant({ identity: null, requestedCompanyId: 'company-a', repository: repo(activeMembership), secrets: secrets() }), 'UNAUTHENTICATED', 401);
});

test('rechaza usuario sin membresía activa', async () => {
  await rejectsCode(resolveAuthorizedTenant({ identity, requestedCompanyId: 'company-a', repository: repo(null), secrets: secrets() }), 'MEMBERSHIP_DENIED', 403);
});

test('rechaza empresa suspendida', async () => {
  await rejectsCode(resolveAuthorizedTenant({ identity, requestedCompanyId: 'company-a', repository: repo({ ...activeMembership, companyStatus: 'suspended' }), secrets: secrets() }), 'TENANT_UNAVAILABLE', 503);
});

test('rechaza URL de conexión con formato inválido', async () => {
  await rejectsCode(resolveAuthorizedTenant({ identity, requestedCompanyId: 'company-a', repository: repo(activeMembership), secrets: secrets('https://example.invalid/not-a-db') }), 'TENANT_UNAVAILABLE', 503);
});

test('resuelve contexto solo después de validar identidad, membresía, estado y secreto', async () => {
  const context = await resolveAuthorizedTenant({ identity, requestedCompanyId: 'company-a', repository: repo(activeMembership), secrets: secrets() });
  assert.equal(context.companyId, 'company-a');
  assert.equal(context.role, 'owner');
  assert.equal(context.companySlug, 'empresa-a');
  assert.deepEqual(context.modules, ['pos', 'inventory', 'reports', 'accounting']);
  assert.match(context.connectionString, /^postgresql:\/\//);
});

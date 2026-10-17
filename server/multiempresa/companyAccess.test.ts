import assert from 'node:assert/strict';
import test from 'node:test';
import { createCompanyAccessMiddleware } from './companyAccess.ts';
import type { LocalPlatformStore, MembershipRole, PlatformState } from './platformStore.ts';

const COMPANY = '11111111-1111-4111-8111-111111111111';

function stateFor(role: MembershipRole, industryTemplate = 'other'): PlatformState {
  return {
    companies: [{ id: COMPANY, status: 'active', workspace: { industryTemplate } } as any],
    users: [{ id: 'u1', provider: 'firebase', subject: 'uid-1', email: 'a@b.c', displayName: 'A', createdAt: '' }],
    memberships: [{ companyId: COMPANY, userId: 'u1', role, status: 'active', createdAt: '' }],
    invitations: [],
    plans: [{ id: 'trial', name: 'Prueba', price: 0, currency: 'USD', interval: 'month', limits: { users: 3, products: 500, branches: 1, warehouses: 1 }, modules: ['pos', 'inventory', 'reports', 'accounting'], active: true }],
    subscriptions: [{ companyId: COMPANY, planId: 'trial', status: 'active', currentPeriodEnd: '2999-01-01T00:00:00.000Z' } as any],
    audit: [],
  };
}

function run(role: MembershipRole, method: string, url: string, body?: unknown, industryTemplate = 'other') {
  const store = { readState: () => stateFor(role, industryTemplate) } as unknown as LocalPlatformStore;
  const middleware = createCompanyAccessMiddleware(store);
  const req: any = { method, originalUrl: url, body, firebaseIdentity: { uid: 'uid-1' }, get: (h: string) => (h.toLowerCase() === 'x-company-id' ? COMPANY : undefined) };
  let status = 200;
  let nextCalled = false;
  const res: any = { status(code: number) { status = code; return res; }, json() { return res; } };
  middleware(req, res, () => { nextCalled = true; });
  return { status, nextCalled };
}

for (const role of ['auditor', 'supervisor', 'accountant', 'cashier'] as MembershipRole[]) {
  test(`${role} no puede leer el explorador /api/db/*`, () => {
    for (const url of ['/api/db/tables', '/api/db/table-data?table=sales_transactions', '/api/DB/tables', '/api//db/tables/']) {
      const result = run(role, 'GET', url);
      assert.equal(result.status, 403, `${role} ${url}`);
      assert.equal(result.nextCalled, false);
    }
  });
}

test('owner y admin sí pueden usar /api/db/*', () => {
  for (const role of ['owner', 'admin'] as MembershipRole[]) {
    assert.equal(run(role, 'GET', '/api/db/tables').nextCalled, true);
  }
});

test('auditor conserva lectura de rutas operativas', () => {
  assert.equal(run('auditor', 'GET', '/api/sales').nextCalled, true);
  assert.equal(run('auditor', 'POST', '/api/sales').status, 403);
});

test('cajera tiene acceso al POS y a las operaciones necesarias para vender', () => {
  for (const [method, url, body] of [
    ['GET', '/api/pos/state'],
    ['GET', '/api/pos/version'],
    ['GET', '/api/sales'],
    ['POST', '/api/sales'],
    ['POST', '/api/invoices/next'],
    ['GET', '/api/contacts?tipo=cliente&documento=V123'],
    ['POST', '/api/contacts', { tipo: 'cliente', nombre: 'Cliente' }],
  ] as Array<[string, string, unknown?]>) {
    assert.equal(run('cashier', method, url, body).nextCalled, true, `${method} ${url}`);
  }
});

test('cajera no tiene acceso a módulos distintos de ventas ni a otros contactos', () => {
  for (const [method, url, body] of [
    ['GET', '/api/store/state'],
    ['GET', '/api/store/version'],
    ['GET', '/api/products'],
    ['POST', '/api/products'],
    ['GET', '/api/accounts'],
    ['GET', '/api/layaways'],
    ['POST', '/api/layaways'],
    ['GET', '/api/expenses'],
    ['GET', '/api/contacts?tipo=proveedor'],
    ['POST', '/api/contacts', { tipo: 'proveedor', nombre: 'Proveedor' }],
  ] as Array<[string, string, unknown?]>) {
    const result = run('cashier', method, url, body);
    assert.equal(result.status, 403, `${method} ${url}`);
    assert.equal(result.nextCalled, false, `${method} ${url}`);
  }
});

test('supervisor lee todo pero no escribe en catálogo, contabilidad ni sincronización', () => {
  assert.equal(run('supervisor', 'GET', '/api/catalog/items').nextCalled, true);
  assert.equal(run('supervisor', 'POST', '/api/products').nextCalled, true);
  for (const url of ['/api/catalog/sync-github', '/api/accounting/journal', '/api/store/sync']) {
    assert.equal(run('supervisor', 'POST', url).status, 403, url);
  }
});

test('contador solo escribe asientos del diario', () => {
  assert.equal(run('accountant', 'POST', '/api/accounting/journal').nextCalled, true);
  assert.equal(run('accountant', 'DELETE', '/api/accounting/journal/abc').nextCalled, true);
  assert.equal(run('accountant', 'POST', '/api/sales').status, 403);
  assert.equal(run('accountant', 'PUT', '/api/accounting/journal').status, 403);
});

test('cajera no puede borrar ventas ni leer contactos que no sean clientes', () => {
  assert.equal(run('cashier', 'DELETE', '/api/sales/v1').status, 403);
  assert.equal(run('cashier', 'GET', '/api/contacts?tipo=proveedor').status, 403);
  assert.equal(run('cashier', 'POST', '/api/contacts', { tipo: 'proveedor' }).status, 403);
});

test('un rol desconocido no tiene ningún permiso', () => {
  assert.equal(run('invitado' as MembershipRole, 'GET', '/api/sales').status, 403);
});

test('las funciones de calzado se limitan en servidor al giro footwear', () => {
  assert.equal(run('owner', 'GET', '/api/layaways', undefined, 'footwear').nextCalled, true);
  assert.equal(run('owner', 'GET', '/api/layaways', undefined, 'commerce').status, 403);
  assert.equal(run('admin', 'POST', '/api/ai/analyze-shoe', {}, 'services').status, 403);
  assert.equal(run('owner', 'POST', '/api/ai/analyze-shoe', {}, 'footwear').nextCalled, true);
});

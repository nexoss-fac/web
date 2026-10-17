import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { tenantDataFiles } from './tenantFileStore.ts';

test('cada empresa obtiene rutas de persistencia distintas y debajo de tenants/', () => {
  const root = path.resolve('server/data');
  const first = tenantDataFiles(root, '11111111-1111-4111-8111-111111111111');
  const second = tenantDataFiles(root, '22222222-2222-4222-8222-222222222222');
  assert.notEqual(first.store, second.store);
  assert.notEqual(first.fiscalBoard, second.fiscalBoard);
  assert.ok(first.store.startsWith(path.join(root, 'tenants')));
  assert.ok(second.store.startsWith(path.join(root, 'tenants')));
});

test('rechaza identificadores que podrían escapar de la carpeta de tenant', () => {
  assert.throws(() => tenantDataFiles('server/data', '..\\..\\outside'));
  assert.throws(() => tenantDataFiles('server/data', 'company-x'));
});

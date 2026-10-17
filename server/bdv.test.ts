import test from 'node:test';
import assert from 'node:assert/strict';
import { getRecentVerifications, verifyBdvPayment } from './bdv.ts';
import { tenantStorageContext, type TenantStorageContext } from './multiempresa/companyAccess.ts';

const companyA: TenantStorageContext = { companyId: '11111111-1111-4111-8111-111111111111', uid: 'uid-a', role: 'owner' };
const companyB: TenantStorageContext = { companyId: '22222222-2222-4222-8222-222222222222', uid: 'uid-b', role: 'auditor' };

test('el historial BDV de una empresa no se ve desde otra', async () => {
  await tenantStorageContext.run(companyA, () => verifyBdvPayment({
    referencia: '123456', telefono_origen: '04140000000', cedula_cliente: 'V-1', banco_origen: '0102', monto_bs: 100,
  }));

  const historyA = tenantStorageContext.run(companyA, () => getRecentVerifications());
  const historyB = tenantStorageContext.run(companyB, () => getRecentVerifications());

  assert.equal(historyA.length, 1);
  assert.equal(historyA[0].cedula_cliente, 'V-1');
  assert.deepEqual(historyB, []);
});

test('sin contexto de empresa no se devuelve historial ni se registra la verificación', async () => {
  assert.deepEqual(getRecentVerifications(), []);
  await assert.rejects(() => verifyBdvPayment({
    referencia: '654321', telefono_origen: '04140000000', cedula_cliente: 'V-2', banco_origen: '0102', monto_bs: 50,
  }), /contexto de empresa/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { getRecentVerifications, verifyBdvPayment } from './bdv.ts';
import { tenantStorageContext, type TenantStorageContext } from './multiempresa/companyAccess.ts';

const companyA: TenantStorageContext = { companyId: '11111111-1111-4111-8111-111111111111', uid: 'uid-a', role: 'owner', industryTemplate: 'footwear' };
const companyB: TenantStorageContext = { companyId: '22222222-2222-4222-8222-222222222222', uid: 'uid-b', role: 'auditor', industryTemplate: 'commerce' };
const payment = {
  referencia: '123456', telefono_origen: '04140000000', cedula_cliente: 'V-1',
  banco_origen: '0102', monto_bs: 100, fecha: '2026-11-22',
};

test('el historial BDV de una empresa no se ve desde otra', async () => {
  const oldKey = process.env.BDV_API_KEY;
  const oldDestination = process.env.BDV_TELEFONO_DESTINO;
  delete process.env.BDV_API_KEY;
  delete process.env.BDV_TELEFONO_DESTINO;
  try {
    await tenantStorageContext.run(companyA, () => verifyBdvPayment(payment));
    const historyA = tenantStorageContext.run(companyA, () => getRecentVerifications());
    const historyB = tenantStorageContext.run(companyB, () => getRecentVerifications());
    assert.equal(historyA.length, 1);
    assert.equal(historyA[0].cedula_cliente, 'V-1');
    assert.equal(historyA[0].aprobado, false);
    assert.equal(historyA[0].modo, 'PENDIENTE');
    assert.deepEqual(historyB, []);
  } finally {
    if (oldKey === undefined) delete process.env.BDV_API_KEY; else process.env.BDV_API_KEY = oldKey;
    if (oldDestination === undefined) delete process.env.BDV_TELEFONO_DESTINO; else process.env.BDV_TELEFONO_DESTINO = oldDestination;
  }
});

test('envía el contrato oficial BDV y solo aprueba code 1000 con importe coincidente', async () => {
  const oldKey = process.env.BDV_API_KEY;
  const oldDestination = process.env.BDV_TELEFONO_DESTINO;
  const oldFetch = globalThis.fetch;
  process.env.BDV_API_KEY = 'test-api-key';
  process.env.BDV_TELEFONO_DESTINO = '04141234567';
  let requestUrl = '';
  let requestHeaders: Headers | undefined;
  let requestBody: any;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requestUrl = String(input);
    requestHeaders = new Headers(init?.headers);
    requestBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({
      code: 1000,
      message: 'Monto: 100.00 - estatus : Transaccion realizada',
      data: { status: '1000', amount: '100.00', reason: 'Transaccion realizada' },
      status: 200,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  try {
    const result = await tenantStorageContext.run(companyA, () => verifyBdvPayment(payment));
    assert.equal(requestUrl, 'https://bdvconciliacion.banvenez.com:443/getMovement');
    assert.equal(requestHeaders?.get('X-API-Key'), 'test-api-key');
    assert.equal(requestHeaders?.get('Content-Type'), 'application/json');
    assert.deepEqual(requestBody, {
      cedulaPagador: 'V-1',
      telefonoPagador: '04140000000',
      telefonoDestino: '04141234567',
      referencia: '123456',
      fechaPago: '2026-11-22',
      importe: '100.00',
      bancoOrigen: '0102',
    });
    assert.equal(result.aprobado, true);
    assert.equal(result.codigo_aprobacion, '1000');
    assert.equal(result.modo, 'PRODUCCION');
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.BDV_API_KEY; else process.env.BDV_API_KEY = oldKey;
    if (oldDestination === undefined) delete process.env.BDV_TELEFONO_DESTINO; else process.env.BDV_TELEFONO_DESTINO = oldDestination;
  }
});

test('sin contexto de empresa no se devuelve historial ni se registra la verificación', async () => {
  assert.deepEqual(getRecentVerifications(), []);
  await assert.rejects(() => verifyBdvPayment(payment), /contexto de empresa/);
});

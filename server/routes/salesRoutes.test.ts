import assert from 'node:assert/strict';
import test from 'node:test';
import { registerSalesRoutes, type SalesRouteDeps } from './salesRoutes.ts';

type Handler = (req: any, res: any) => Promise<void> | void;

function setup(overrides: Partial<SalesRouteDeps> = {}) {
  const routes = new Map<string, Handler>();
  const app: any = {};
  for (const method of ['get', 'post', 'patch']) app[method] = (path: string, handler: Handler) => routes.set(`${method.toUpperCase()} ${path}`, handler);
  let store: any = {
    sales: [],
    products: [{ id: 'p1', sku: 'S1', nombre: 'Zapato', talla: '40', stock: 5 }],
    accounts: [{ id: 'a1', nombre: 'Zelle', moneda: 'USD', saldo: 0 }],
  };
  const deps: SalesRouteDeps = {
    readServerStore: () => store,
    writeServerStore: (state) => { store = state; },
    readLocalSales: () => store.sales,
    getNeonSql: () => null,
    normalizeSales: (rows) => rows,
    updateSale: async () => undefined,
    voidSale: async () => ({ ok: true, items: [] }),
    ...overrides,
  };
  registerSalesRoutes(app, deps);
  return { routes, getStore: () => store };
}

async function call(handler: Handler, req: Record<string, unknown>) {
  const result: { status: number; body: any } = { status: 200, body: undefined };
  const res: any = { status(code: number) { result.status = code; return res; }, json(body: unknown) { result.body = body; return res; } };
  await handler({ body: {}, params: {}, ...req }, res);
  return result;
}

const sale = (over: Record<string, unknown> = {}) => ({
  id: 'v1', numero_factura: 'F-1', cliente_nombre: 'Ana', estado: 'completada',
  items: [{ producto_id: 'p1', sku: 'S1', nombre_producto: 'Zapato', talla: '40', cantidad: 2, precio_unitario: 50, costo_unitario: 30, subtotal: 100 }],
  subtotal_usd: 100, descuento_usd: 0, aplica_iva: false, iva_incluido: false, porcentaje_iva: 0, iva_monto_usd: 0,
  total_usd: 100, total_bs: 4000, tasa_cambio: 40, costo_total_usd: 60, ganancia_neta_usd: 40,
  pagos: [{ cuenta: 'Zelle', monto: 100 }], fecha: '2026-10-15T10:00:00Z', usuario: 'Cajera',
  ...over,
});

test('POST /api/sales guarda una venta válida y descuenta stock', async () => {
  const { routes, getStore } = setup();
  const r = await call(routes.get('POST /api/sales')!, { body: sale() });
  assert.equal(r.status, 200);
  assert.equal(r.body.saved, true);
  assert.equal(getStore().products[0].stock, 3);
});

test('POST /api/sales rechaza totales manipulados y no toca el stock', async () => {
  const { routes, getStore } = setup();
  const r = await call(routes.get('POST /api/sales')!, { body: sale({ total_usd: 1, total_bs: 40, ganancia_neta_usd: -59 }) });
  assert.equal(r.status, 400);
  assert.equal(r.body.saved, false);
  assert.equal(getStore().products[0].stock, 5);
  assert.equal(getStore().sales.length, 0);
});

test('el doble envío de la misma venta no descuenta el stock dos veces', async () => {
  const { routes, getStore } = setup();
  const post = routes.get('POST /api/sales')!;
  await call(post, { body: sale() });
  await call(post, { body: sale() });
  assert.equal(getStore().products[0].stock, 3);
  assert.equal(getStore().sales.length, 1);
});

test('si Neon falla responde 502 con saved:false en lugar de saved:true', async () => {
  const failingSql: any = async () => { throw new Error('Neon caído'); };
  failingSql.transaction = async () => { throw new Error('Neon caído'); };
  const { routes } = setup({ getNeonSql: () => failingSql });
  const r = await call(routes.get('POST /api/sales')!, { body: sale() });
  assert.equal(r.status, 502);
  assert.equal(r.body.saved, false);
});

test('PATCH solo actualiza campos permitidos y devuelve 404 si no existe', async () => {
  const { routes, getStore } = setup();
  await call(routes.get('POST /api/sales')!, { body: sale() });
  const ok = await call(routes.get('PATCH /api/sales/:id')!, { params: { id: 'v1' }, body: { notas: 'cobrado', total_usd: 1 } });
  assert.equal(ok.body.success, true);
  assert.equal(getStore().sales[0].notas, 'cobrado');
  assert.equal(getStore().sales[0].total_usd, 100);
  const missing = await call(routes.get('PATCH /api/sales/:id')!, { params: { id: 'nada' }, body: {} });
  assert.equal(missing.status, 404);
});

test('anular devuelve stock una sola vez en modo local', async () => {
  const { routes, getStore } = setup();
  await call(routes.get('POST /api/sales')!, { body: sale() });
  const first = await call(routes.get('POST /api/sales/:id/void')!, { params: { id: 'v1' }, body: { motivo: 'error' } });
  assert.equal(first.body.success, true);
  assert.equal(getStore().products[0].stock, 5);
  const again = await call(routes.get('POST /api/sales/:id/void')!, { params: { id: 'v1' }, body: {} });
  assert.equal(again.body.alreadyVoided, true);
  assert.equal(getStore().products[0].stock, 5);
});

test('PATCH guarda los abonos Cashea en el almacén local', async () => {
  const { routes, getStore } = setup();
  await call(routes.get('POST /api/sales')!, { body: sale() });
  const abonos = [{ id: 'a1', referencia: 'REF-1', monto_usd: 25 }];
  const r = await call(routes.get('PATCH /api/sales/:id')!, { params: { id: 'v1' }, body: { cashea_abonos: abonos, estado_cashea: 'conciliado_parcial' } });
  assert.equal(r.body.success, true);
  assert.deepEqual(getStore().sales[0].cashea_abonos, abonos);
});

test('PATCH avisa con 502 si Neon falla en lugar de responder success', async () => {
  const sqlOk: any = async () => [];
  sqlOk.transaction = async () => [];
  const { routes } = setup({ getNeonSql: () => sqlOk });
  await call(routes.get('POST /api/sales')!, { body: sale() });
  const failing = setup({ getNeonSql: () => sqlOk, updateSale: async () => { throw new Error('Neon caído'); } });
  await call(failing.routes.get('POST /api/sales')!, { body: sale() });
  const r = await call(failing.routes.get('PATCH /api/sales/:id')!, { params: { id: 'v1' }, body: { estado_cashea: 'conciliado_total' } });
  assert.equal(r.status, 502);
  assert.equal(r.body.success, false);
  assert.equal(r.body.localSaved, true);
});

test('avisa una sola vez por venta nueva y no al reenviarla', async () => {
  const notified: string[] = [];
  const { routes } = setup({ onSaleRegistered: (s) => notified.push(s.id) });
  const post = routes.get('POST /api/sales')!;
  await call(post, { body: sale() });
  await call(post, { body: sale() });
  assert.deepEqual(notified, ['v1']);
});

test('no avisa si la venta fue rechazada por totales inválidos', async () => {
  const notified: string[] = [];
  const { routes } = setup({ onSaleRegistered: (s) => notified.push(s.id) });
  await call(routes.get('POST /api/sales')!, { body: sale({ total_usd: 1, total_bs: 40, ganancia_neta_usd: -59 }) });
  assert.deepEqual(notified, []);
});

test('si Neon falla no avisa, y el reintento exitoso sí avisa una vez', async () => {
  const notified: string[] = [];
  let neonUp = false;
  const sqlFake: any = async () => [];
  sqlFake.transaction = async () => { if (!neonUp) throw new Error('Neon caído'); return []; };
  const { routes } = setup({ getNeonSql: () => sqlFake, onSaleRegistered: (s) => notified.push(s.id) });
  const post = routes.get('POST /api/sales')!;
  const first = await call(post, { body: sale() });
  assert.equal(first.status, 502);
  assert.deepEqual(notified, []);
  neonUp = true;
  const retry = await call(post, { body: sale() });
  assert.equal(retry.body.saved, true);
  assert.deepEqual(notified, ['v1']);
});

test('un error al preparar el aviso no impide guardar la venta', async () => {
  const { routes, getStore } = setup({ onSaleRegistered: () => { throw new Error('falla del aviso'); } });
  const r = await call(routes.get('POST /api/sales')!, { body: sale() });
  assert.equal(r.body.saved, true);
  assert.equal(getStore().sales.length, 1);
});

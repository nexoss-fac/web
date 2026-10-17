import assert from 'node:assert/strict';
import test from 'node:test';
import type { Sale, ShoeProduct } from '../../src/types.ts';
import { applySaleToStore, pickUpdatableSaleFields, voidSaleInStore, type LocalSalesStore } from './localSales.ts';

function makeStore(): LocalSalesStore {
  return {
    sales: [],
    products: [{ id: 'p1', sku: 'SKU-1', nombre: 'Zapato', talla: '40', stock: 5 } as unknown as ShoeProduct],
    accounts: [{ id: 'a1', nombre: 'Zelle', moneda: 'USD', saldo: 0 }],
  };
}

function makeSale(overrides: Record<string, unknown> = {}): Sale {
  return {
    id: 'v1', total_usd: 100, estado: 'completada',
    items: [{ producto_id: 'p1', sku: 'SKU-1', nombre_producto: 'Zapato', talla: '40', cantidad: 2, precio_unitario: 50, subtotal: 100 }],
    pagos: [{ cuenta: 'Zelle', monto: 100 }],
    ...overrides,
  } as unknown as Sale;
}

test('una venta nueva descuenta stock y suma el pago a la cuenta', () => {
  const store = makeStore();
  const result = applySaleToStore(store, makeSale());
  assert.equal(result.isNewSale, true);
  assert.equal(store.products[0].stock, 3);
  assert.equal(store.accounts[0].saldo, 100);
  assert.equal(store.sales.length, 1);
});

test('el doble envío no descuenta stock ni suma pagos otra vez', () => {
  const store = makeStore();
  applySaleToStore(store, makeSale());
  const second = applySaleToStore(store, makeSale());
  assert.equal(second.isNewSale, false);
  assert.equal(store.products[0].stock, 3);
  assert.equal(store.accounts[0].saldo, 100);
  assert.equal(store.sales.length, 1);
});

test('reenviar una venta registrada no puede reescribir total ni ítems', () => {
  const store = makeStore();
  applySaleToStore(store, makeSale());
  applySaleToStore(store, makeSale({ total_usd: 1, items: [], notas: 'cobrado' }));
  assert.equal(store.sales[0].total_usd, 100);
  assert.equal(store.sales[0].items.length, 1);
  assert.equal(store.sales[0].notas, 'cobrado');
});

test('el stock nunca queda negativo', () => {
  const store = makeStore();
  store.products[0].stock = 1;
  applySaleToStore(store, makeSale());
  assert.equal(store.products[0].stock, 0);
});

test('pagos con decimales no acumulan error de redondeo', () => {
  const store = makeStore();
  applySaleToStore(store, makeSale({ id: 'v1', pagos: [{ cuenta: 'Zelle', monto: 0.1 }] }));
  applySaleToStore(store, makeSale({ id: 'v2', pagos: [{ cuenta: 'Zelle', monto: 0.2 }] }));
  assert.equal(store.accounts[0].saldo, 0.3);
});

test('anular devuelve el stock y marca la venta', () => {
  const store = makeStore();
  applySaleToStore(store, makeSale());
  const result = voidSaleInStore(store, 'v1', 'error de caja', new Date('2026-01-01T00:00:00Z'));
  assert.equal(result.status, 'voided');
  assert.equal(store.products[0].stock, 5);
  assert.equal(store.sales[0].estado, 'anulada');
  assert.equal(store.sales[0].anulada_at, '2026-01-01T00:00:00.000Z');
});

test('anular dos veces no devuelve el stock dos veces', () => {
  const store = makeStore();
  applySaleToStore(store, makeSale());
  voidSaleInStore(store, 'v1', 'x');
  const again = voidSaleInStore(store, 'v1', 'x');
  assert.equal(again.status, 'already_voided');
  assert.equal(store.products[0].stock, 5);
});

test('anular una venta inexistente devuelve not_found', () => {
  assert.equal(voidSaleInStore(makeStore(), 'nada', '').status, 'not_found');
});

test('el PATCH conserva el historial de abonos Cashea y descarta campos no permitidos', () => {
  const abonos = [{ id: 'a1', referencia: 'REF-1', monto_usd: 25 }];
  const updates = pickUpdatableSaleFields({ cashea_abonos: abonos, total_usd: 1, items: [], estado_cashea: 'conciliado_parcial' });
  assert.deepEqual(updates.cashea_abonos, abonos);
  assert.equal(updates.estado_cashea, 'conciliado_parcial');
  assert.equal('total_usd' in updates, false);
  assert.equal('items' in updates, false);
});

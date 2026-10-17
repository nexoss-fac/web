import assert from 'node:assert/strict';
import test from 'node:test';
import { INVENTORY_BOOK_COLUMNS, INVENTORY_BOOK_GROUPS, classifyExitReason } from './inventoryBookLayout.ts';

test('el libro no tiene ningún grupo ni columna de retiros', () => {
  const text = JSON.stringify(INVENTORY_BOOK_GROUPS).toLowerCase();
  assert.equal(text.includes('retiro'), false);
});

test('los grupos van en el orden del modelo, con Donaciones junto a Autoconsumo', () => {
  assert.deepEqual(INVENTORY_BOOK_GROUPS.map((g) => g.id), ['inicial', 'entrada', 'autoconsumo', 'donaciones', 'salida', 'final']);
});

test('las columnas de cada grupo siguen el modelo en Excel', () => {
  const byId = Object.fromEntries(INVENTORY_BOOK_GROUPS.map((g) => [g.id, g.columns.map((c) => c.label)]));
  assert.deepEqual(byId.inicial, ['Cantidad', 'Costo unitario Bs', 'Monto total Bs']);
  assert.deepEqual(byId.entrada, ['Fecha', 'Cantidad', 'Costo unitario Bs', 'Monto Bs']);
  assert.deepEqual(byId.autoconsumo, ['Fecha', 'Cantidad', 'Monto Bs']);
  assert.deepEqual(byId.salida, ['Cantidad', 'Monto Bs']);
  assert.deepEqual(byId.final, ['Cantidad', 'Costo unitario Bs', 'Monto total Bs']);
});

test('los ids de columna son únicos y los costos unitarios no se suman', () => {
  const ids = INVENTORY_BOOK_COLUMNS.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(INVENTORY_BOOK_COLUMNS.filter((c) => c.label.startsWith('Costo unitario')).every((c) => !c.sum));
});

test('clasifica el motivo de una salida', () => {
  assert.equal(classifyExitReason('Autoconsumo del personal'), 'autoconsumo');
  assert.equal(classifyExitReason('Donación a fundación'), 'donaciones');
  assert.equal(classifyExitReason('Producto dañado'), 'salida');
  assert.equal(classifyExitReason(''), 'salida');
});

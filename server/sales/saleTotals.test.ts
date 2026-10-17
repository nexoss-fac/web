import assert from 'node:assert/strict';
import test from 'node:test';
import { validateSaleTotals } from './saleTotals.ts';

const base = {
  items: [{ cantidad: 2, precio_unitario: 50, costo_unitario: 30, subtotal: 100 }],
  subtotal_usd: 100, descuento_usd: 0, aplica_iva: false, iva_incluido: false, porcentaje_iva: 16,
  iva_monto_usd: 0, total_usd: 100, total_bs: 4000, tasa_cambio: 40, costo_total_usd: 60, ganancia_neta_usd: 40,
};

test('una venta coherente sin IVA pasa', () => {
  assert.deepEqual(validateSaleTotals(base), { ok: true, problems: [] });
});

test('IVA incluido: el total no suma otro 16%', () => {
  const sale = { ...base, aplica_iva: true, iva_incluido: true, iva_monto_usd: 100 * 16 / 116, total_usd: 100, ganancia_neta_usd: 100 - 100 * 16 / 116 - 60 };
  assert.equal(validateSaleTotals(sale).ok, true);
});

test('IVA adicional: el total suma el 16%', () => {
  const sale = { ...base, aplica_iva: true, iva_incluido: false, iva_monto_usd: 16, total_usd: 116, total_bs: 4640, ganancia_neta_usd: 40 };
  assert.equal(validateSaleTotals(sale).ok, true);
});

test('con descuento se calcula sobre la base descontada', () => {
  const sale = { ...base, descuento_usd: 10, total_usd: 90, total_bs: 3600, ganancia_neta_usd: 30 };
  assert.equal(validateSaleTotals(sale).ok, true);
});

test('rechaza un total manipulado', () => {
  const result = validateSaleTotals({ ...base, total_usd: 1, total_bs: 40, ganancia_neta_usd: -59 });
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((p) => p.includes('total no coincide')));
});

test('rechaza ganancia inflada', () => {
  assert.equal(validateSaleTotals({ ...base, ganancia_neta_usd: 500 }).ok, false);
});

test('rechaza cantidades inválidas, descuento mayor al subtotal y valores negativos', () => {
  assert.equal(validateSaleTotals({ ...base, items: [{ ...base.items[0], cantidad: 0 }] }).ok, false);
  assert.equal(validateSaleTotals({ ...base, descuento_usd: 500 }).ok, false);
  assert.equal(validateSaleTotals({ ...base, total_usd: -5 }).ok, false);
});

test('rechaza una venta sin productos', () => {
  assert.equal(validateSaleTotals({ ...base, items: [] }).ok, false);
});

test('tolera diferencias de redondeo de centavos', () => {
  assert.equal(validateSaleTotals({ ...base, total_usd: 100.02, total_bs: 4000.8 }).ok, true);
});

test('acepta cantidades decimales (productos por peso o medida)', () => {
  const sale = { ...base, items: [{ cantidad: 2.5, precio_unitario: 40, costo_unitario: 24, subtotal: 100 }] };
  assert.equal(validateSaleTotals(sale).ok, true);
});

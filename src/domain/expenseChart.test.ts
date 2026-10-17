import assert from 'node:assert/strict';
import test from 'node:test';
import { EXPENSE_CUENTA, EXPENSE_PARTIDA, EXPENSE_SUBACCOUNTS, expenseSubaccountsAlphabetical, normalizeExpenseCategory } from './expenseChart.ts';
import { EXPENSE_SUBACCOUNTS as REPORT_SUBACCOUNTS } from './expense-reports.mjs';

test('la norma tiene 21 subcuentas en el orden de Patentadoc', () => {
  assert.equal(EXPENSE_SUBACCOUNTS.length, 21);
  assert.equal(EXPENSE_SUBACCOUNTS[0], 'Sueldos empleados');
  assert.equal(EXPENSE_SUBACCOUNTS[20], 'Servicios privados');
  assert.equal(EXPENSE_PARTIDA, 'Egresos');
  assert.equal(EXPENSE_CUENTA, 'Gastos');
});

test('coincide con la lista que usa el reporte de gastos', () => {
  assert.deepEqual([...EXPENSE_SUBACCOUNTS], [...REPORT_SUBACCOUNTS]);
});

test('el orden alfabético respeta tildes y no repite elementos', () => {
  const sorted = expenseSubaccountsAlphabetical();
  assert.equal(sorted.length, 21);
  assert.equal(sorted[0], 'Arrendamientos');
  assert.equal(new Set(sorted).size, 21);
});

test('las categorías antiguas se convierten a su subcuenta', () => {
  assert.equal(normalizeExpenseCategory('Alquiler de Local'), 'Arrendamientos');
  assert.equal(normalizeExpenseCategory('Nómina y Sueldos'), 'Sueldos empleados');
  assert.equal(normalizeExpenseCategory('Impuestos y Tasas Municipales'), 'Tributos pagados');
  assert.equal(normalizeExpenseCategory('  bancos '), 'Bancos');
});

test('lo que no tiene equivalente queda sin clasificar', () => {
  for (const value of ['Otros Gastos Operativos', 'Empaques, Bolsas y Cajas', 'Compra de Mercancía / Proveedores', '', undefined, 42]) {
    assert.equal(normalizeExpenseCategory(value), 'Sin clasificar');
  }
});

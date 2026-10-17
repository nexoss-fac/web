import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInventoryBookRow, INVENTORY_CATEGORIES } from '../src/domain/inventory-book.mjs';
import { reportExpenses, EXPENSE_SUBACCOUNTS } from '../src/domain/expense-reports.mjs';
import { authorizeCompanyAction } from '../src/domain/authorization-policy.mjs';
import { expenses, inventoryMovements } from '../src/demo/fixtures.mjs';

test('inventory book separates opening, entries, issues, autoconsumption and ending balance', () => {
  const row = buildInventoryBookRow({ companyId: 'demo-a', itemId: 'item-flour', period: '2026-10', opening: { quantity: 20, amountUsd: 50, amountBs: 1825 }, movements: inventoryMovements });
  assert.deepEqual(row.inicio, { quantity: 20, amountUsd: 50, amountBs: 1825 });
  assert.equal(row.entrada.quantity, 100);
  assert.equal(row.salida.quantity, 12);
  assert.equal(row.autoconsumo.quantity, 3);
  assert.deepEqual(row.existencia, { quantity: 105, amountUsd: 262.5, amountBs: 9581.25 });
  assert.equal('retiros' in row, false);
  assert.equal(row.movementCount, 3);
});

test('inventory results are isolated by company', () => {
  const row = buildInventoryBookRow({ companyId: 'demo-a', itemId: 'item-flour', period: '2026-10', movements: inventoryMovements });
  assert.equal(row.entrada.quantity, 100);
});

test('inventory rejects unsupported movements and invalid quantities', () => {
  assert.throws(() => buildInventoryBookRow({ companyId: 'demo-a', itemId: 'item-flour', period: '2026-10', movements: [{ ...inventoryMovements[0], type: 'Retiro' }] }), /Unsupported/);
  assert.throws(() => buildInventoryBookRow({ companyId: 'demo-a', itemId: 'item-flour', period: '2026-10', movements: [{ ...inventoryMovements[0], quantity: -1 }] }), /quantity/);
});

test('expense report groups same supplier, day, and currency with voucher references', () => {
  const [group] = reportExpenses({ expenses, companyId: 'demo-a', from: '2026-10-01', to: '2026-10-31' });
  assert.equal(group.supplier, 'Proveedor Ficticio');
  assert.equal(group.year, '2026');
  assert.equal(group.month, '10');
  assert.equal(group.day, '02');
  assert.equal(group.total, 100);
  assert.deepEqual(group.records.map(row => row.voucher), ['EGR-DEMO-01', 'EGR-DEMO-02']);
  assert.equal(group.records[0].supportingDocument, 'demo://factura-01');
  assert.equal(reportExpenses({ expenses, companyId: 'demo-a', currency: 'Bs' }).length, 0);
});

test('expense report rejects records missing voucher, rate, or attachment reference', () => {
  for (const field of ['voucher', 'rate', 'supportingDocument']) {
    const bad = { ...expenses[0], [field]: '' };
    assert.throws(() => reportExpenses({ expenses: [bad], companyId: 'demo-a' }), new RegExp(field));
  }
});

test('authorization requires an active membership for the requested company and role', () => {
  const identity = { userId: 'user-1' };
  const memberships = [
    { userId: 'user-1', companyId: 'demo-a', role: 'viewer', status: 'active' },
    { userId: 'user-1', companyId: 'demo-b', role: 'admin', status: 'active' },
    { userId: 'user-1', companyId: 'demo-a', role: 'admin', status: 'disabled' }
  ];
  assert.equal(authorizeCompanyAction({ identity, memberships, companyId: 'demo-a', allowedRoles: ['viewer', 'admin'] }), true);
  assert.equal(authorizeCompanyAction({ identity, memberships, companyId: 'demo-b', allowedRoles: ['viewer'] }), false);
  assert.equal(authorizeCompanyAction({ identity: null, memberships, companyId: 'demo-a', allowedRoles: ['admin'] }), false);
  assert.equal(authorizeCompanyAction({ identity, memberships: [{ ...memberships[0], userId: 'attacker' }], companyId: 'demo-a', allowedRoles: ['viewer'] }), false);
});

test('required initial classifications are available', () => {
  assert.deepEqual(INVENTORY_CATEGORIES, [
    'Mercancía',
    'Materia prima',
    'Productos en proceso',
    'Productos terminados'
  ]);
  assert.equal(EXPENSE_SUBACCOUNTS.length, 21);
});

test('inventory book records donations as their own column and deducts them from existence', () => {
  const donation = { companyId: 'demo-a', itemId: 'item-flour', date: '2026-10-20', type: 'Donación', quantity: 5, unitCostUsd: 2.5, unitCostBs: 91.25, amountUsd: 12.5, amountBs: 456.25, rate: 36.5 };
  const row = buildInventoryBookRow({ companyId: 'demo-a', itemId: 'item-flour', period: '2026-10', opening: { quantity: 20, amountUsd: 50, amountBs: 1825 }, movements: [...inventoryMovements, donation] });
  assert.equal(row.donacion.quantity, 5);
  assert.equal(row.existencia.quantity, 100);
  assert.equal('retiros' in row, false);
});

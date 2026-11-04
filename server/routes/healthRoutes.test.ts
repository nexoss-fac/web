import test from 'node:test';
import assert from 'node:assert/strict';
import { healthRoleAllows } from './healthRoutes.ts';

test('owner and admin can read and write clinical records', () => {
  for (const role of ['owner', 'admin']) {
    assert.equal(healthRoleAllows(role, 'GET'), true);
    assert.equal(healthRoleAllows(role, 'POST'), true);
    assert.equal(healthRoleAllows(role, 'PATCH'), true);
  }
});

test('auditor can read but cannot modify clinical records', () => {
  assert.equal(healthRoleAllows('auditor', 'GET'), true);
  assert.equal(healthRoleAllows('auditor', 'HEAD'), true);
  assert.equal(healthRoleAllows('auditor', 'POST'), false);
  assert.equal(healthRoleAllows('auditor', 'PATCH'), false);
  assert.equal(healthRoleAllows('auditor', 'DELETE'), false);
});

test('commercial roles cannot access patient records', () => {
  for (const role of ['accountant', 'supervisor', 'cashier', 'unknown']) {
    assert.equal(healthRoleAllows(role, 'GET'), false);
    assert.equal(healthRoleAllows(role, 'POST'), false);
  }
});

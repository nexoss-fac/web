import assert from 'node:assert/strict';
import test from 'node:test';
import { addMoney, roundMoney, subtractMoney } from './money.ts';

test('0.1 + 0.2 da exactamente 0.3', () => {
  assert.equal(addMoney(0.1, 0.2), 0.3);
});

test('mil sumas de 0.1 no acumulan error', () => {
  let total = 0;
  for (let i = 0; i < 1000; i++) total = addMoney(total, 0.1);
  assert.equal(total, 100);
});

test('redondea 1.005 hacia arriba', () => {
  assert.equal(roundMoney(1.005), 1.01);
  assert.equal(roundMoney(-1.005), -1.01);
});

test('valores inválidos cuentan como cero', () => {
  assert.equal(roundMoney('abc'), 0);
  assert.equal(addMoney(undefined, null, '5.50'), 5.5);
});

test('resta con redondeo', () => {
  assert.equal(subtractMoney(0.3, 0.1), 0.2);
});

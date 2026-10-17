import assert from 'node:assert/strict';
import test from 'node:test';
import { findProductIndex } from './productMatch.ts';

const products = [
  { id: 'p1', sku: 'ABC-1', nombre: 'Zapato Azul', talla: '40' },
  { id: 'p2', sku: 'ABC-2', nombre: 'Zapato Azul', talla: '41' },
  { id: 'p3', sku: '', nombre: 'Gorra', talla: '' },
];

test('encuentra por id aunque tenga espacios', () => {
  assert.equal(findProductIndex(products, { id: ' p2 ' }), 1);
});

test('encuentra por SKU sin distinguir mayúsculas', () => {
  assert.equal(findProductIndex(products, { sku: 'abc-1' }), 0);
});

test('por nombre exige también la talla', () => {
  assert.equal(findProductIndex(products, { nombre: 'zapato azul', talla: '41' }), 1);
  assert.equal(findProductIndex(products, { nombre: 'zapato azul' }), -1);
});

test('una referencia vacía no coincide con productos sin SKU o talla', () => {
  assert.equal(findProductIndex(products, {}), -1);
  assert.equal(findProductIndex(products, { sku: '', nombre: 'Gorra', talla: '' }), -1);
});

test('no encuentra productos inexistentes', () => {
  assert.equal(findProductIndex(products, { id: 'zzz', sku: 'nope' }), -1);
});

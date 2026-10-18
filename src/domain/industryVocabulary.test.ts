import assert from 'node:assert/strict';
import test from 'node:test';
import { COMPANY_INDUSTRIES } from './companyIndustries.ts';
import { getVocabulary } from './industryVocabulary.ts';

const SHOE_WORDS = /calzado|zapat|\bpares?\b|talla|modelo|horma|suela/i;

test('solo el rubro de calzado usa palabras de zapatería', () => {
  for (const key of Object.keys(COMPANY_INDUSTRIES)) {
    const text = JSON.stringify({ ...getVocabulary(key), key: '' });
    if (key === 'footwear') assert.match(text, SHOE_WORDS);
    else assert.doesNotMatch(text, SHOE_WORDS, `el rubro ${key} no debe hablar de zapatos`);
  }
});

test('la tienda de mercancía habla de productos y unidades', () => {
  const v = getVocabulary('commerce');
  assert.equal(v.product, 'Producto');
  assert.equal(v.products, 'Productos');
  assert.equal(v.unit, 'unidades');
  assert.equal(v.goodsPlural, 'productos');
  assert.equal(v.usesSizes, false);
});

test('la zapatería conserva su vocabulario', () => {
  const v = getVocabulary('footwear');
  assert.deepEqual([v.product, v.products, v.unit, v.unitSingular, v.variant, v.variants, v.goods, v.goodsPlural], ['Modelo', 'Modelos', 'pares', 'par', 'Talla', 'Tallas', 'calzado', 'calzados']);
  assert.equal(v.usesSizes, true);
});

test('los servicios no llevan existencias y hablan de servicios', () => {
  for (const key of ['services', 'legal', 'accounting']) {
    const v = getVocabulary(key);
    assert.equal(v.tracksStock, false);
    assert.equal(v.unit, 'servicios');
  }
  assert.equal(getVocabulary('manufacturing').tracksStock, true);
});

test('un valor desconocido cae en el rubro genérico sin romper', () => {
  assert.equal(getVocabulary(null).key, 'other');
  assert.equal(getVocabulary('inventado').products, 'Productos y servicios');
});

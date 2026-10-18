import assert from 'node:assert/strict';
import test from 'node:test';
import { INSPECTION_TEMPLATE, buildInspectionItems, compactEntries, summarizeInspection, templateItemId } from './fiscalInspection.ts';

test('la plantilla trae los 114 puntos numerados sin saltos ni repetidos', () => {
  assert.equal(INSPECTION_TEMPLATE.length, 114);
  INSPECTION_TEMPLATE.forEach(([number], index) => assert.equal(number, index + 1));
  assert.equal(new Set(INSPECTION_TEMPLATE.map(([, title]) => title)).size, 114);
});

test('incluye los puntos 6 y 7 (teléfonos) y los extremos del listado', () => {
  const byNumber = Object.fromEntries(INSPECTION_TEMPLATE.map(([number, title]) => [number, title]));
  assert.equal(byNumber[1], 'Razón Social');
  assert.equal(byNumber[6], 'Teléfono Residencial');
  assert.equal(byNumber[7], 'Teléfono Celular');
  assert.equal(byNumber[10], 'Accionistas');
  assert.equal(byNumber[114], 'Inspección SSL');
});

test('cada punto tiene sección y las pistas de dato del listado original', () => {
  assert.ok(INSPECTION_TEMPLATE.every(([, , section]) => section.length > 0));
  const hint = (n: number) => INSPECTION_TEMPLATE[n - 1][3];
  assert.equal(hint(61), 'Número y fecha');
  assert.equal(hint(72), 'Nombres, apellido, cédula y cargo');
  assert.equal(hint(76), 'Forma');
  assert.equal(hint(112), 'Forma');
});

test('une plantilla, datos guardados y puntos propios', () => {
  const items = buildInspectionItems({
    entries: { [templateItemId(1)]: { value: 'MAKD, C.A.', notes: '', status: 'Cumple', documentIds: ['d1'], hidden: false } },
    customItems: [{ id: 'c-uno', title: 'Permiso de la zona franca', section: '' }],
    observations: '',
  });
  assert.equal(items.length, 115);
  assert.equal(items[0].value, 'MAKD, C.A.');
  assert.deepEqual(items[0].documentIds, ['d1']);
  assert.equal(items[1].status, '');
  assert.equal(items[114].custom, true);
  assert.equal(items[114].section, 'Puntos propios');
});

test('el cumplimiento no cuenta los puntos que no aplican ni los ocultos', () => {
  const items = buildInspectionItems();
  const set = (n: number, patch: Partial<(typeof items)[number]>) => Object.assign(items[n - 1], patch);
  set(1, { status: 'Cumple' }); set(2, { status: 'Cumple' }); set(3, { status: 'No cumple' }); set(4, { status: 'No aplica' });
  set(5, { hidden: true, status: 'No cumple' });
  const summary = summarizeInspection(items);
  assert.equal(summary.total, 113);
  assert.equal(summary.cumple, 2);
  assert.equal(summary.noCumple, 1);
  assert.equal(summary.noAplica, 1);
  assert.equal(summary.compliancePct, 2); // 2 de 112 puntos que aplican
  const sinAplicar = summarizeInspection(items.slice(0, 4));
  assert.equal(sinAplicar.compliancePct, 67);
});

test('solo se guardan los puntos con algún dato', () => {
  const items = buildInspectionItems();
  items[0].value = '  MAKD  ';
  items[8].status = 'No aplica';
  const entries = compactEntries(items);
  assert.deepEqual(Object.keys(entries), ['i001', 'i009']);
  assert.equal(entries.i001.value, 'MAKD');
});

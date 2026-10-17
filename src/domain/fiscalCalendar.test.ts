import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFiscalCalendar, computeFiscalNotifications, countDocumentsByStatus, daysBetween, deriveDocumentStatus, nextOccurrence } from './fiscalCalendar.ts';
import { NATIONAL_PORTALS, VENEZUELA_STATES, isSafePortalUrl, portalsForSettings } from './fiscalPortals.ts';
import { FISCAL_AREAS, FISCAL_DOCUMENT_STATUSES } from './fiscalBoard.ts';

const TODAY = '2026-10-15';
const doc = (id: string, expiresAt: string, status: any = 'Vigente') => ({ id, title: `Doc ${id}`, category: 'RIF', issuer: '', expiresAt, status, published: false, area: 'Tributos nacionales' as const });

test('las áreas y los estados son los pedidos', () => {
  assert.deepEqual([...FISCAL_AREAS], ['Tributos nacionales', 'Municipal (SIGAT / Alcaldía)', 'Bomberos y seguridad', 'Laboral y parafiscal', 'Legal y mercantil', 'Sanidad y manipulación de alimentos']);
  for (const status of ['Vigente', 'Por vencer', 'Vencido', 'En trámite']) assert.ok((FISCAL_DOCUMENT_STATUSES as readonly string[]).includes(status));
});

test('el estado de un documento sale de su fecha, salvo "En trámite"', () => {
  assert.equal(deriveDocumentStatus({ status: 'Vigente', expiresAt: '2027-03-01' }, TODAY), 'Vigente');
  assert.equal(deriveDocumentStatus({ status: 'Vigente', expiresAt: '2026-11-10' }, TODAY), 'Por vencer');
  assert.equal(deriveDocumentStatus({ status: 'Vigente', expiresAt: '2026-10-14' }, TODAY), 'Vencido');
  assert.equal(deriveDocumentStatus({ status: 'Vigente', expiresAt: '2026-10-15' }, TODAY), 'Por vencer');
  assert.equal(deriveDocumentStatus({ status: 'Vigente', expiresAt: '' }, TODAY), 'Pendiente de revisión');
  assert.equal(deriveDocumentStatus({ status: 'En trámite', expiresAt: '2020-01-01' }, TODAY), 'En trámite');
});

test('los contadores suman por estado', () => {
  const counts = countDocumentsByStatus([doc('a', '2027-03-01'), doc('b', '2026-10-20'), doc('c', '2026-01-01'), doc('d', '', 'En trámite')], TODAY);
  assert.deepEqual(counts, { total: 4, vigente: 1, porVencer: 1, vencido: 1, enTramite: 1 });
});

test('daysBetween rechaza fechas inválidas', () => {
  assert.equal(daysBetween('2026-10-15', '2026-10-18'), 3);
  assert.equal(daysBetween('2026-10-15', '2026-02-30'), null);
  assert.equal(daysBetween('x', '2026-10-18'), null);
});

test('los eventos recurrentes avanzan al próximo período sin romper fin de mes', () => {
  assert.equal(nextOccurrence('2026-01-31', 'monthly', '2026-02-10'), '2026-02-28');
  assert.equal(nextOccurrence('2026-01-15', 'quarterly', '2026-10-15'), '2026-10-15');
  assert.equal(nextOccurrence('2025-03-01', 'yearly', '2026-10-15'), '2027-03-01');
  assert.equal(nextOccurrence('2026-05-01', 'none', '2026-10-15'), '2026-05-01');
});

test('el calendario une documentos, requisitos y eventos y los ordena', () => {
  const entries = buildFiscalCalendar({
    today: TODAY,
    board: {
      documents: [doc('rif', '2026-10-18'), doc('tramite', '2026-10-16', 'En trámite')],
      requirements: [{ id: 'r1', title: 'Libros', description: '', frequency: '', sourceLabel: '', sourceUrl: '', status: 'Pendiente', responsible: '', dueDate: '2026-10-10', notes: '', evidenceDocumentId: '' }],
      calendar: [{ id: 'e1', title: 'IVA mensual', area: 'Tributos nacionales', dueDate: '2026-09-15', recurrence: 'monthly', remindDaysBefore: [], notes: '', done: false }],
    },
  });
  assert.deepEqual(entries.map((e) => e.key), ['requisito:r1', 'evento:e1', 'documento:rif']);
  assert.equal(entries[0].level, 'vencido');
  assert.equal(entries[1].dueDate, '2026-10-15');
  assert.equal(entries[1].level, 'hoy');
});

test('las notificaciones avisan lo vencido, lo de hoy y los días de aviso, y no lo lejano', () => {
  const entries = buildFiscalCalendar({
    today: TODAY,
    board: {
      documents: [doc('vencido', '2026-10-10'), doc('d3', '2026-10-18'), doc('d6', '2026-10-21'), doc('lejano', '2026-12-31')],
      requirements: [],
    },
  });
  const notices = computeFiscalNotifications(entries);
  const byRef = Object.fromEntries(notices.map((n) => [n.entry.refId, n.id]));
  assert.match(byRef.vencido, /:vencido$/);
  assert.match(byRef.d3, /:d3$/);
  assert.match(byRef.d6, /:d7$/);
  assert.equal(byRef.lejano, undefined);
});

test('un evento hecho y sin repetición no genera avisos', () => {
  const entries = buildFiscalCalendar({
    today: TODAY,
    board: { documents: [], requirements: [], calendar: [{ id: 'e', title: 'Pago', area: '', dueDate: '2026-10-14', recurrence: 'none', remindDaysBefore: [], notes: '', done: true }] },
  });
  assert.equal(entries.length, 0);
});

test('los portales cambian según el estado elegido', () => {
  const base = { countryCode: 'VE', hiddenPortalIds: [] as string[], customPortals: [] as any[] };
  const bolivar = portalsForSettings({ ...base, stateCode: 'BO' }).map((p) => p.id);
  assert.ok(bolivar.includes('bo-sigat-caroni') && bolivar.includes('bo-bomberos-caroni'));
  const zulia = portalsForSettings({ ...base, stateCode: 'ZU' }).map((p) => p.id);
  assert.ok(zulia.includes('local-bomberos-ZU') && !zulia.includes('bo-bomberos-caroni'));
  assert.equal(portalsForSettings({ ...base, stateCode: '' }).length, NATIONAL_PORTALS.length);
  assert.equal(VENEZUELA_STATES.length, 24);
});

test('se pueden ocultar portales y agregar propios; fuera de Venezuela solo quedan los propios', () => {
  const custom = { id: 'c1', name: 'Portal propio', description: '', area: 'Legal y mercantil', scope: 'Nacional', url: 'https://example.com', procedures: [], instructions: [], stateCodes: [], needsReview: false } as any;
  const ve = portalsForSettings({ countryCode: 'VE', stateCode: 'BO', hiddenPortalIds: ['inces'], customPortals: [custom] });
  assert.ok(!ve.some((p) => p.id === 'inces') && ve.some((p) => p.id === 'c1' && p.custom));
  const other = portalsForSettings({ countryCode: 'CO', stateCode: 'BO', hiddenPortalIds: [], customPortals: [custom] });
  assert.deepEqual(other.map((p) => p.id), ['c1']);
});

test('solo se aceptan enlaces http o https', () => {
  assert.equal(isSafePortalUrl('https://seniat.gob.ve'), true);
  assert.equal(isSafePortalUrl(''), true);
  assert.equal(isSafePortalUrl('javascript:alert(1)'), false);
  assert.equal(isSafePortalUrl('no es url'), false);
});

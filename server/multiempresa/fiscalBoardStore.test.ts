import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { FiscalBoardValidationError, createDefaultFiscalBoard, matchesPublicBoardToken, mergeFiscalRequirements, publicFiscalBoard, validateFiscalBoardState } from './fiscalBoardStore.ts';
import { NATIONAL_FISCAL_REQUIREMENTS, type FiscalRequirement } from '../../src/domain/fiscalBoard.ts';

const requirements: FiscalRequirement[] = [{
  id: 'rif',
  title: 'Registro de Información Fiscal',
  description: 'Mantener la constancia vigente.',
  frequency: 'Vigencia del documento',
  sourceLabel: 'SENIAT',
  sourceUrl: 'https://www.seniat.gob.ve/',
  status: 'Pendiente',
  responsible: '',
  dueDate: '',
  notes: '',
  evidenceDocumentId: '',
}];

test('la plantilla inicia requisitos pendientes sin documentos ni enlace público', () => {
  assert.deepEqual(createDefaultFiscalBoard(requirements), {
    documents: [],
    requirements,
    auditEvents: [],
  });
});

test('la lista nacional se limita a deberes respaldados por el COT y enlaza la fuente oficial', () => {
  assert.deepEqual(
    NATIONAL_FISCAL_REQUIREMENTS.map(({ id, status, sourceUrl }) => ({ id, status, sourceUrl })),
    [
      { id: 'cot-155-1-libros-registros', status: 'Pendiente', sourceUrl: 'https://historico.tsj.gob.ve/gaceta/febrero/29022020/29022020-6507.pdf' },
      { id: 'cot-155-6-declaraciones-soportes-origen', status: 'Pendiente', sourceUrl: 'https://historico.tsj.gob.ve/gaceta/febrero/29022020/29022020-6507.pdf' },
      { id: 'cot-155-2-registros-tributarios', status: 'Pendiente', sourceUrl: 'https://historico.tsj.gob.ve/gaceta/febrero/29022020/29022020-6507.pdf' },
    ],
  );
  assert.ok(NATIONAL_FISCAL_REQUIREMENTS.every((item) => item.description.includes('cartelera')));
});

test('incorpora nuevos requisitos nacionales sin perder las respuestas de auditoría existentes', () => {
  const newRequirement = { ...requirements[0], id: 'new-item', title: 'Nuevo requisito' };
  const saved = { ...requirements[0], status: 'Cumplido' as const, notes: 'Verificado' };
  const merged = mergeFiscalRequirements([requirements[0], newRequirement], [saved]);
  assert.equal(merged[0].status, 'Cumplido');
  assert.equal(merged[0].notes, 'Verificado');
  assert.equal(merged[1].status, 'Pendiente');
  assert.equal(merged[1].notes, '');
});

test('valida estado del checklist y conserva solo los campos públicos seleccionables', () => {
  const board = createDefaultFiscalBoard(requirements);
  board.requirements[0].status = 'Cumplido';
  board.requirements[0].responsible = 'Administración';
  board.documents.push({
    id: 'rif-copy',
    title: 'RIF',
    category: 'RIF',
    issuer: 'SENIAT',
    expiresAt: '',
    status: 'Vigente',
    fileName: 'rif.pdf',
    fileData: 'data:application/pdf;base64,JVBERiQ=',
    published: true,
  });

  const result = validateFiscalBoardState(board, requirements);
  assert.equal(result.requirements[0].status, 'Cumplido');
  assert.equal(result.documents[0].published, true);
  assert.equal(result.documents[0].fileName, 'rif.pdf');
});

test('rechaza listas de requisitos alteradas y adjuntos inseguros o excesivos', () => {
  assert.throws(() => validateFiscalBoardState({ documents: [], requirements: [] }, requirements));
  assert.throws(() => validateFiscalBoardState({
    documents: [{
      id: 'x', title: 'Documento', status: 'Vigente', published: true,
      fileData: 'data:text/html;base64,PHNjcmlwdD4=',
    }],
    requirements,
  }, requirements));
  assert.throws(() => validateFiscalBoardState({
    documents: [{
      id: 'x', title: 'Documento', status: 'Vigente', published: true,
      fileData: `data:application/pdf;base64,${Buffer.alloc(16 * 1024 * 1024 + 1).toString('base64')}`,
    }],
    requirements,
  }, requirements));
});

test('el enlace público valida su token y solo expone documentos publicados y campos de cartelera', () => {
  const token = 'a'.repeat(64);
  const board = createDefaultFiscalBoard(requirements);
  board.publicTokenHash = createHash('sha256').update(token).digest('hex');
  board.requirements[0].notes = 'Nota interna privada';
  board.auditEvents = [{ id: 'event', actorUid: 'uid-private', action: 'updated', createdAt: '2026-01-01T00:00:00Z', summary: 'Cambio privado' }];
  board.documents = [
    { id: 'published', title: 'RIF', category: 'RIF', issuer: 'SENIAT', expiresAt: '', status: 'Vigente', published: true, fileData: 'data:application/pdf;base64,JVBERiQ=' },
    { id: 'private', title: 'Documento interno', category: 'Otro', issuer: 'Interno', expiresAt: '', status: 'Vigente', published: false, fileName: 'interno.pdf' },
  ];

  assert.equal(matchesPublicBoardToken(board.publicTokenHash, token), true);
  assert.equal(matchesPublicBoardToken(board.publicTokenHash, 'b'.repeat(64)), false);
  assert.equal(matchesPublicBoardToken(board.publicTokenHash, 'malformed'), false);
  assert.equal(matchesPublicBoardToken(undefined, token), false);

  const publicView = publicFiscalBoard('Empresa', board);
  assert.equal(publicView.companyName, 'Empresa');
  assert.deepEqual(publicView.documents.map((document) => document.id), ['published']);
  assert.equal('notes' in publicView.requirements[0], false);
  assert.equal('auditEvents' in publicView, false);
});

const baseDocument = { id: 'doc-1', title: 'RIF', category: 'RIF', issuer: 'SENIAT', expiresAt: '2027-01-31', status: 'Vigente' as const, published: false };

test('un requisito puede vincular un documento existente y rechaza uno que no existe', () => {
  const board = createDefaultFiscalBoard(requirements);
  board.documents.push({ ...baseDocument });
  board.requirements[0].evidenceDocumentId = 'doc-1';
  assert.equal(validateFiscalBoardState(board, requirements).requirements[0].evidenceDocumentId, 'doc-1');

  board.requirements[0].evidenceDocumentId = 'no-existe';
  assert.throws(() => validateFiscalBoardState(board, requirements), (error) => error instanceof FiscalBoardValidationError);
});

test('acepta el estado "En trámite" y las seis áreas, y rechaza áreas desconocidas', () => {
  const board = createDefaultFiscalBoard(requirements);
  board.documents.push({ ...baseDocument, status: 'En trámite', area: 'Bomberos y seguridad' });
  const result = validateFiscalBoardState(board, requirements);
  assert.equal(result.documents[0].status, 'En trámite');
  assert.equal(result.documents[0].area, 'Bomberos y seguridad');

  board.documents[0].area = 'Inventada' as never;
  assert.throws(() => validateFiscalBoardState(board, requirements), FiscalBoardValidationError);
});

test('valida el calendario fiscal: fechas reales, repetición y días de aviso', () => {
  const board = createDefaultFiscalBoard(requirements);
  const event = { id: 'e1', title: 'Declaración de IVA', area: 'Tributos nacionales' as const, dueDate: '2026-11-15', recurrence: 'monthly' as const, remindDaysBefore: [1, 7, 3], notes: '', done: false };
  const ok = validateFiscalBoardState({ ...board, calendar: [event] }, requirements);
  assert.deepEqual(ok.calendar?.[0].remindDaysBefore, [7, 3, 1]);

  for (const bad of [{ ...event, dueDate: '2026-02-30' }, { ...event, recurrence: 'diaria' }, { ...event, remindDaysBefore: [1, 2, 3, 4, 5, 6, 7] }, { ...event, title: '  ' }]) {
    assert.throws(() => validateFiscalBoardState({ ...board, calendar: [bad as never] }, requirements), FiscalBoardValidationError);
  }
  assert.throws(() => validateFiscalBoardState({ ...board, calendar: [event, event] }, requirements), FiscalBoardValidationError);
});

test('valida la configuración de portales: estado, enlaces seguros y límites', () => {
  const board = createDefaultFiscalBoard(requirements);
  const custom = { id: 'p1', name: 'Bomberos de mi municipio', description: '', area: 'Bomberos y seguridad' as const, scope: 'Municipal' as const, url: 'https://example.org/bomberos', procedures: ['Inspección'], instructions: [], stateCodes: ['BO'], needsReview: false };
  const settings = { countryCode: 've', stateCode: 'bo', notificationsEnabled: true, remindDaysBefore: [], hiddenPortalIds: ['inces'], customPortals: [custom] };
  const result = validateFiscalBoardState({ ...board, settings }, requirements);
  assert.equal(result.settings?.stateCode, 'BO');
  assert.equal(result.settings?.countryCode, 'VE');
  assert.deepEqual(result.settings?.remindDaysBefore, [7, 3, 1]);
  assert.equal(result.settings?.customPortals[0].custom, true);

  assert.throws(() => validateFiscalBoardState({ ...board, settings: { ...settings, customPortals: [{ ...custom, url: 'javascript:alert(1)' }] } }, requirements), FiscalBoardValidationError);
  assert.throws(() => validateFiscalBoardState({ ...board, settings: { ...settings, stateCode: 'XX' } }, requirements), FiscalBoardValidationError);
});

test('sin calendario ni configuración en la petición, el resultado no los incluye (el servidor conserva los anteriores)', () => {
  const result = validateFiscalBoardState(createDefaultFiscalBoard(requirements), requirements);
  assert.equal('calendar' in result, false);
  assert.equal('settings' in result, false);
});

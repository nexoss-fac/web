import { createHash, timingSafeEqual } from 'node:crypto';
import { readJsonFileWithBackup, writeJsonFileAtomic } from './tenantFileStore.ts';
import type { FiscalArea, FiscalBoardSettings, FiscalBoardState, FiscalCalendarEvent, FiscalPortalConfig, FiscalRequirement } from '../../src/domain/fiscalBoard.ts';
import { FISCAL_AREAS, FISCAL_DOCUMENT_STATUSES, FISCAL_RECURRENCES } from '../../src/domain/fiscalBoard.ts';
import { DEFAULT_REMIND_DAYS, daysBetween, deriveDocumentStatus, toDateKey } from '../../src/domain/fiscalCalendar.ts';
import { VENEZUELA_STATES, isSafePortalUrl } from '../../src/domain/fiscalPortals.ts';

export class FiscalBoardValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FiscalBoardValidationError';
  }
}

export function createDefaultFiscalBoard(requirements: FiscalRequirement[]): FiscalBoardState {
  return { documents: [], requirements: structuredClone(requirements), auditEvents: [] };
}

export function readFiscalBoard(filePath: string, requirements: FiscalRequirement[]): FiscalBoardState {
  const parsed = readJsonFileWithBackup(filePath);
  return normalizeFiscalBoard(parsed, requirements);
}

export function normalizeFiscalBoard(parsed: unknown, requirements: FiscalRequirement[]): FiscalBoardState {
  if (parsed === undefined || parsed === null) return createDefaultFiscalBoard(requirements);
  if (!parsed || typeof parsed !== 'object') throw new Error('El expediente fiscal almacenado no es válido.');
  const value = parsed as Partial<FiscalBoardState>;
  if (!Array.isArray(value.documents) || !Array.isArray(value.requirements)) {
    throw new Error('El expediente fiscal almacenado tiene un formato incompatible.');
  }
  return {
    documents: value.documents,
    requirements: mergeFiscalRequirements(requirements, value.requirements),
    auditEvents: Array.isArray(value.auditEvents) ? value.auditEvents : [],
    ...(Array.isArray(value.calendar) ? { calendar: value.calendar } : {}),
    ...(value.settings && typeof value.settings === 'object' ? { settings: value.settings } : {}),
    ...(value.inspection && typeof value.inspection === 'object' ? { inspection: value.inspection } : {}),
    ...(typeof value.publicTokenHash === 'string' ? { publicTokenHash: value.publicTokenHash } : {}),
    ...(typeof value.updatedAt === 'string' ? { updatedAt: value.updatedAt } : {}),
  };
}

export function mergeFiscalRequirements(defaults: FiscalRequirement[], savedRequirements: FiscalRequirement[]): FiscalRequirement[] {
  const savedById = new Map(savedRequirements
    .filter((item) => item && typeof item.id === 'string')
    .map((item) => [item.id, item]));
  return defaults.map((definition) => {
    const saved = savedById.get(definition.id);
    return {
      ...definition,
      ...(saved && ['Pendiente', 'Cumplido', 'No aplica'].includes(saved.status) ? { status: saved.status } : {}),
      responsible: typeof saved?.responsible === 'string' ? saved.responsible : '',
      dueDate: typeof saved?.dueDate === 'string' ? saved.dueDate : '',
      notes: typeof saved?.notes === 'string' ? saved.notes : '',
      evidenceDocumentId: typeof saved?.evidenceDocumentId === 'string' ? saved.evidenceDocumentId : '',
    };
  });
}

export function saveFiscalBoard(filePath: string, state: FiscalBoardState): void {
  writeJsonFileAtomic(filePath, state);
}

export function matchesPublicBoardToken(tokenHash: string | undefined, token: string): boolean {
  if (!tokenHash || !/^[0-9a-f]{64}$/i.test(tokenHash) || !/^[0-9a-f]{64}$/i.test(token)) return false;
  const expected = Buffer.from(tokenHash, 'hex');
  const provided = createHash('sha256').update(token).digest();
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

export function publicFiscalBoard(companyName: string, board: FiscalBoardState, today = toDateKey(new Date())) {
  return {
    companyName,
    updatedAt: board.updatedAt || null,
    requirements: board.requirements.map(({ id, title, description, frequency, sourceLabel, sourceUrl, status, dueDate, area }) => ({
      id, title, description, frequency, sourceLabel, sourceUrl, status, dueDate, ...(area ? { area } : {}),
    })),
    documents: board.documents.filter((document) => document.published).map((document) => ({
      id: document.id,
      title: document.title,
      category: document.category,
      area: document.area || '',
      issuer: document.issuer,
      expiresAt: document.expiresAt,
      // El estado público se calcula con la fecha de hoy, no con el que se guardó al cargar el documento.
      status: deriveDocumentStatus(document, today),
      fileName: document.fileName,
      fileData: document.fileData,
    })),
  };
}

export function validateFiscalBoardState(value: unknown, defaults: FiscalRequirement[]): FiscalBoardState {
  if (!value || typeof value !== 'object') throw new FiscalBoardValidationError('El expediente fiscal enviado no es válido.');
  const payload = value as Partial<FiscalBoardState>;
  if (!Array.isArray(payload.documents) || payload.documents.length > 100) {
    throw new FiscalBoardValidationError('La carpeta puede contener hasta 100 documentos.');
  }
  if (!Array.isArray(payload.requirements)) throw new FiscalBoardValidationError('La lista de requisitos no es válida.');

  const defaultById = new Map(defaults.map((item) => [item.id, item]));
  const submittedIds = new Set<string>();
  const submittedById = new Map(payload.requirements.map((item) => {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string') throw new FiscalBoardValidationError('Hay un requisito inválido.');
    if (submittedIds.has(item.id)) throw new FiscalBoardValidationError('Hay requisitos duplicados.');
    submittedIds.add(item.id);
    return [item.id, item] as const;
  }));
  if (submittedById.size !== defaultById.size || [...defaultById.keys()].some((id) => !submittedById.has(id))) {
    throw new FiscalBoardValidationError('La lista de requisitos no coincide con la versión vigente.');
  }
  const requirements = defaults.map((definition) => {
    const item = submittedById.get(definition.id)!;
    if (!['Pendiente', 'Cumplido', 'No aplica'].includes(String(item.status))) {
      throw new FiscalBoardValidationError('El estado de un requisito no es válido.');
    }
    return {
      ...definition,
      status: item.status!,
      responsible: textField(item.responsible, 160),
      dueDate: textField(item.dueDate, 10),
      notes: textField(item.notes, 2000),
      evidenceDocumentId: textField(item.evidenceDocumentId, 128),
    };
  });
  let totalAttachmentBytes = 0;
  const documentIds = new Set<string>();
  const documents = payload.documents.map((document) => {
    if (!document || typeof document !== 'object' || typeof document.id !== 'string') throw new FiscalBoardValidationError('Hay un documento inválido.');
    if (!document.id.trim() || documentIds.has(document.id)) throw new FiscalBoardValidationError('Hay documentos sin identificador o duplicados.');
    documentIds.add(document.id);
    const title = textField(document.title, 200);
    if (!title) throw new FiscalBoardValidationError('Cada documento debe tener un nombre.');
    if (!(FISCAL_DOCUMENT_STATUSES as readonly string[]).includes(String(document.status))) {
      throw new FiscalBoardValidationError('El estado de un documento no es válido.');
    }
    const fileData = typeof document.fileData === 'string' ? document.fileData : undefined;
    if (fileData) {
      const match = /^data:(application\/pdf|image\/(?:png|jpeg));base64,([A-Za-z0-9+/]+=*)$/.exec(fileData);
      if (!match) throw new FiscalBoardValidationError('Los adjuntos deben ser PDF, PNG o JPEG.');
      totalAttachmentBytes += Buffer.from(match[2], 'base64').byteLength;
      if (totalAttachmentBytes > 16 * 1024 * 1024) throw new FiscalBoardValidationError('El total de adjuntos no puede superar 16 MB.');
    }
    return {
      id: document.id.slice(0, 128),
      title,
      category: textField(document.category, 80),
      area: areaField(document.area, 'del documento'),
      issuer: textField(document.issuer, 160),
      expiresAt: textField(document.expiresAt, 10),
      status: document.status!,
      ...(typeof document.fileName === 'string' ? { fileName: textField(document.fileName, 180) } : {}),
      ...(fileData ? { fileData } : {}),
      ...(typeof document.documentNumber === 'string' ? { documentNumber: textField(document.documentNumber, 120) } : {}),
      ...(typeof document.ownerName === 'string' ? { ownerName: textField(document.ownerName, 200) } : {}),
      ...(typeof document.taxId === 'string' ? { taxId: textField(document.taxId, 80) } : {}),
      ...(typeof document.issueDate === 'string' ? { issueDate: textField(document.issueDate, 10) } : {}),
      ...(typeof document.notes === 'string' ? { notes: textField(document.notes, 2000) } : {}),
      ...(typeof document.suggestedRequirement === 'string' ? { suggestedRequirement: textField(document.suggestedRequirement, 200) } : {}),
      published: document.published === true,
    };
  });

  // Se comprueba al final, cuando ya se conocen todos los documentos enviados.
  if (requirements.some((item) => item.evidenceDocumentId && !documentIds.has(item.evidenceDocumentId))) {
    throw new FiscalBoardValidationError('Un requisito está vinculado a un documento que ya no existe.');
  }

  const calendar = payload.calendar === undefined ? undefined : validateCalendar(payload.calendar);
  const settings = payload.settings === undefined ? undefined : validateSettings(payload.settings);
  const inspection = payload.inspection === undefined ? undefined : validateInspection(payload.inspection, documentIds);
  return { documents, requirements, ...(calendar ? { calendar } : {}), ...(settings ? { settings } : {}), ...(inspection ? { inspection } : {}) };
}

function validateInspection(value: unknown, documentIds: Set<string>): NonNullable<FiscalBoardState['inspection']> {
  if (!value || typeof value !== 'object') throw new FiscalBoardValidationError('El informe de inspección no es válido.');
  const item = value as Partial<NonNullable<FiscalBoardState['inspection']>>;
  const rawEntries = item.entries && typeof item.entries === 'object' ? Object.entries(item.entries) : [];
  if (rawEntries.length > 300) throw new FiscalBoardValidationError('El informe supera el máximo de puntos permitido.');
  const entries: NonNullable<FiscalBoardState['inspection']>['entries'] = {};
  for (const [id, raw] of rawEntries) {
    if (!raw || typeof raw !== 'object') throw new FiscalBoardValidationError('Hay una respuesta de inspección inválida.');
    const status = raw.status;
    if (status !== '' && !['Cumple', 'No cumple', 'No aplica'].includes(String(status))) throw new FiscalBoardValidationError('El estado de un punto de inspección no es válido.');
    const documentIdsForEntry = Array.isArray(raw.documentIds) ? raw.documentIds.filter((docId): docId is string => typeof docId === 'string') : [];
    if (documentIdsForEntry.length > 20 || documentIdsForEntry.some((docId) => !documentIds.has(docId))) throw new FiscalBoardValidationError('Un punto del informe está vinculado a un documento inexistente.');
    entries[textField(id, 64)] = { value: textField(raw.value, 1000), notes: textField(raw.notes, 2000), status: status as '' | 'Cumple' | 'No cumple' | 'No aplica', documentIds: documentIdsForEntry, hidden: raw.hidden === true };
  }
  const customItems = Array.isArray(item.customItems) ? item.customItems : [];
  if (customItems.length > 100) throw new FiscalBoardValidationError('Puedes agregar hasta 100 puntos propios.');
  const customIds = new Set<string>();
  const normalizedCustom = customItems.map((raw) => {
    if (!raw || typeof raw !== 'object') throw new FiscalBoardValidationError('Hay un punto propio inválido.');
    const id = textField(raw.id, 64); const title = textField(raw.title, 200); const section = textField(raw.section, 80);
    if (!id || !title || customIds.has(id)) throw new FiscalBoardValidationError('Los puntos propios necesitan un identificador y título únicos.');
    customIds.add(id); return { id, title, section };
  });
  return { entries, customItems: normalizedCustom, observations: textField(item.observations, 10_000) };
}

function areaField(value: unknown, where: string): FiscalArea | '' {
  if (value === undefined || value === null || value === '') return '';
  if (!(FISCAL_AREAS as readonly string[]).includes(String(value))) throw new FiscalBoardValidationError(`El área ${where} no es válida.`);
  return value as FiscalArea;
}

function remindDaysField(value: unknown): number[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 6 || value.some((day) => !Number.isInteger(day) || day < 0 || day > 365)) {
    throw new FiscalBoardValidationError('Los días de aviso deben ser hasta 6 números enteros entre 0 y 365.');
  }
  return [...new Set(value as number[])].sort((a, b) => b - a);
}

function stringList(value: unknown, maxItems: number, maxLength: number, label: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > maxItems) throw new FiscalBoardValidationError(`${label} admite hasta ${maxItems} elementos.`);
  return value.map((item) => textField(item, maxLength)).filter(Boolean);
}

function validateCalendar(value: unknown): FiscalCalendarEvent[] {
  if (!Array.isArray(value) || value.length > 200) throw new FiscalBoardValidationError('El calendario fiscal puede tener hasta 200 eventos.');
  const ids = new Set<string>();
  return value.map((raw) => {
    if (!raw || typeof raw !== 'object') throw new FiscalBoardValidationError('Hay un evento del calendario inválido.');
    const item = raw as Partial<FiscalCalendarEvent>;
    const id = textField(item.id, 128);
    if (!id || ids.has(id)) throw new FiscalBoardValidationError('Hay eventos del calendario sin identificador o duplicados.');
    ids.add(id);
    const title = textField(item.title, 160);
    if (!title) throw new FiscalBoardValidationError('Cada evento del calendario debe tener un nombre.');
    const dueDate = textField(item.dueDate, 10);
    if (daysBetween('2000-01-01', dueDate) === null) throw new FiscalBoardValidationError('La fecha de un evento del calendario no es válida.');
    const recurrence = item.recurrence ?? 'none';
    if (!(FISCAL_RECURRENCES as readonly string[]).includes(recurrence)) throw new FiscalBoardValidationError('La repetición de un evento no es válida.');
    return {
      id, title, dueDate, recurrence,
      area: areaField(item.area, 'del evento'),
      remindDaysBefore: remindDaysField(item.remindDaysBefore),
      notes: textField(item.notes, 1000),
      done: item.done === true,
    };
  });
}

function validateSettings(value: unknown): FiscalBoardSettings {
  if (!value || typeof value !== 'object') throw new FiscalBoardValidationError('La configuración de la carpeta fiscal no es válida.');
  const item = value as Partial<FiscalBoardSettings>;
  const countryCode = textField(item.countryCode, 2).toUpperCase();
  if (countryCode && !/^[A-Z]{2}$/.test(countryCode)) throw new FiscalBoardValidationError('El país no es válido.');
  const stateCode = textField(item.stateCode, 2).toUpperCase();
  if (stateCode && !VENEZUELA_STATES.some((state) => state.code === stateCode)) throw new FiscalBoardValidationError('El estado elegido no es válido.');
  const remind = remindDaysField(item.remindDaysBefore);
  const stateCodes = new Set(VENEZUELA_STATES.map((state) => state.code));
  if (item.customPortals !== undefined && (!Array.isArray(item.customPortals) || item.customPortals.length > 30)) {
    throw new FiscalBoardValidationError('Puedes agregar hasta 30 portales propios.');
  }
  const portalIds = new Set<string>();
  const customPortals = (item.customPortals ?? []).map((raw): FiscalPortalConfig => {
    if (!raw || typeof raw !== 'object') throw new FiscalBoardValidationError('Hay un portal propio inválido.');
    const id = textField(raw.id, 64);
    if (!id || portalIds.has(id)) throw new FiscalBoardValidationError('Hay portales propios sin identificador o duplicados.');
    portalIds.add(id);
    const name = textField(raw.name, 120);
    if (!name) throw new FiscalBoardValidationError('Cada portal propio debe tener un nombre.');
    const url = textField(raw.url, 500);
    if (!isSafePortalUrl(url)) throw new FiscalBoardValidationError('El enlace de un portal debe empezar por http:// o https://.');
    const area = areaField(raw.area, 'del portal');
    if (!area) throw new FiscalBoardValidationError('Cada portal propio debe tener un área.');
    const scope = raw.scope && ['Nacional', 'Estadal', 'Municipal'].includes(raw.scope) ? raw.scope : 'Nacional';
    const codes = stringList(raw.stateCodes, 24, 2, 'Los estados del portal').map((code) => code.toUpperCase());
    if (codes.some((code) => !stateCodes.has(code))) throw new FiscalBoardValidationError('Un portal tiene un estado no válido.');
    return {
      id, name, area, scope, url, stateCodes: codes, needsReview: false, custom: true,
      description: textField(raw.description, 400),
      procedures: stringList(raw.procedures, 12, 160, 'Los trámites'),
      instructions: stringList(raw.instructions, 12, 300, 'El instructivo'),
    };
  });
  return {
    countryCode,
    stateCode,
    notificationsEnabled: item.notificationsEnabled !== false,
    remindDaysBefore: remind.length ? remind : [...DEFAULT_REMIND_DAYS],
    hiddenPortalIds: stringList(item.hiddenPortalIds, 50, 64, 'Los portales ocultos'),
    customPortals,
  };
}

function textField(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

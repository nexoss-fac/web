import type { FiscalArea, FiscalBoardDocument, FiscalBoardState, FiscalCalendarEvent, FiscalDocumentStatus, FiscalRecurrence } from './fiscalBoard';

/** Días de aviso por defecto antes de cada vencimiento. */
export const DEFAULT_REMIND_DAYS: readonly number[] = [7, 3, 1];
/** Un documento pasa a "Por vencer" cuando faltan 30 días o menos. */
export const EXPIRING_SOON_DAYS = 30;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

function toUtcDay(value: string): number | null {
  if (!DATE_PATTERN.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const time = Date.UTC(year, month - 1, day);
  const check = new Date(time);
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day ? time : null;
}

export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Días entre dos fechas YYYY-MM-DD (negativo si `to` es anterior a `from`); null si alguna no es válida. */
export function daysBetween(from: string, to: string): number | null {
  const a = toUtcDay(from);
  const b = toUtcDay(to);
  return a === null || b === null ? null : Math.round((b - a) / MS_PER_DAY);
}

function addMonths(dateKey: string, months: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const safeDay = Math.min(day, lastDay); // 31 de enero + 1 mes = 28/29 de febrero
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
}

const RECURRENCE_MONTHS: Record<Exclude<FiscalRecurrence, 'none'>, number> = { monthly: 1, quarterly: 3, yearly: 12 };

/** Para eventos que se repiten: la primera fecha igual o posterior a `today`, contada desde la fecha original. */
export function nextOccurrence(dueDate: string, recurrence: FiscalRecurrence, today: string): string {
  if (recurrence === 'none' || toUtcDay(dueDate) === null) return dueDate;
  const step = RECURRENCE_MONTHS[recurrence];
  let index = 0;
  let current = dueDate;
  while ((daysBetween(today, current) ?? 0) < 0 && index < 1200) {
    index += 1;
    current = addMonths(dueDate, step * index);
  }
  return current;
}

/** Estado de un documento. "En trámite" es manual y no se recalcula; lo demás sale de la fecha de vencimiento. */
export function deriveDocumentStatus(
  document: Pick<FiscalBoardDocument, 'status' | 'expiresAt'>,
  today: string,
): FiscalDocumentStatus {
  if (document.status === 'En trámite') return 'En trámite';
  const left = document.expiresAt ? daysBetween(today, document.expiresAt) : null;
  if (left === null) return 'Pendiente de revisión';
  if (left < 0) return 'Vencido';
  return left <= EXPIRING_SOON_DAYS ? 'Por vencer' : 'Vigente';
}

export interface FiscalDocumentCounts {
  total: number;
  vigente: number;
  porVencer: number;
  vencido: number;
  enTramite: number;
}

export function countDocumentsByStatus(documents: Array<Pick<FiscalBoardDocument, 'status' | 'expiresAt'>>, today: string): FiscalDocumentCounts {
  const counts: FiscalDocumentCounts = { total: documents.length, vigente: 0, porVencer: 0, vencido: 0, enTramite: 0 };
  for (const document of documents) {
    const status = deriveDocumentStatus(document, today);
    if (status === 'Vigente') counts.vigente += 1;
    else if (status === 'Por vencer') counts.porVencer += 1;
    else if (status === 'Vencido') counts.vencido += 1;
    else if (status === 'En trámite') counts.enTramite += 1;
  }
  return counts;
}

export type FiscalEntryKind = 'documento' | 'requisito' | 'evento';
export type FiscalEntryLevel = 'vencido' | 'hoy' | 'proximo' | 'futuro';

export interface FiscalCalendarEntry {
  key: string;
  kind: FiscalEntryKind;
  refId: string;
  title: string;
  area: FiscalArea | '';
  dueDate: string;
  daysLeft: number;
  level: FiscalEntryLevel;
  remindDaysBefore: number[];
}

function levelFor(daysLeft: number, remind: number[]): FiscalEntryLevel {
  if (daysLeft < 0) return 'vencido';
  if (daysLeft === 0) return 'hoy';
  return daysLeft <= Math.max(0, ...remind) ? 'proximo' : 'futuro';
}

/**
 * Une en un solo calendario los vencimientos de documentos, las fechas de los requisitos pendientes
 * y los eventos propios. Ordenado por fecha (lo vencido primero).
 */
export function buildFiscalCalendar(input: {
  board: Pick<FiscalBoardState, 'documents' | 'requirements' | 'calendar'>;
  today: string;
  defaultRemindDays?: readonly number[];
}): FiscalCalendarEntry[] {
  const defaults = [...(input.defaultRemindDays?.length ? input.defaultRemindDays : DEFAULT_REMIND_DAYS)];
  const entries: FiscalCalendarEntry[] = [];
  const push = (kind: FiscalEntryKind, refId: string, title: string, area: FiscalArea | '', dueDate: string, remind: number[]) => {
    const daysLeft = daysBetween(input.today, dueDate);
    if (daysLeft === null) return;
    entries.push({ key: `${kind}:${refId}`, kind, refId, title, area, dueDate, daysLeft, level: levelFor(daysLeft, remind), remindDaysBefore: remind });
  };

  for (const document of input.board.documents) {
    if (!document.expiresAt || document.status === 'En trámite') continue;
    push('documento', document.id, `Vence: ${document.title}`, document.area ?? '', document.expiresAt, defaults);
  }
  for (const requirement of input.board.requirements) {
    if (requirement.status !== 'Pendiente' || !requirement.dueDate) continue;
    push('requisito', requirement.id, requirement.title, requirement.area ?? 'Tributos nacionales', requirement.dueDate, defaults);
  }
  for (const event of input.board.calendar ?? []) {
    if (event.done && event.recurrence === 'none') continue;
    const dueDate = event.recurrence === 'none' ? event.dueDate : nextOccurrence(event.dueDate, event.recurrence, input.today);
    push('evento', event.id, event.title, event.area, dueDate, event.remindDaysBefore.length ? event.remindDaysBefore : defaults);
  }
  return entries.sort((a, b) => a.daysLeft - b.daysLeft || a.title.localeCompare(b.title, 'es'));
}

export interface FiscalNotification {
  /** Estable por entrada y etapa: sirve para no repetir el mismo aviso en el navegador. */
  id: string;
  entry: FiscalCalendarEntry;
  message: string;
}

/** Avisos que corresponden hoy: lo vencido, lo que vence hoy y lo que entra en un día de aviso. */
export function computeFiscalNotifications(entries: FiscalCalendarEntry[]): FiscalNotification[] {
  const notifications: FiscalNotification[] = [];
  for (const entry of entries) {
    if (entry.level === 'futuro') continue;
    let stage: string;
    let message: string;
    if (entry.level === 'vencido') {
      stage = 'vencido';
      message = `Vencido hace ${Math.abs(entry.daysLeft)} día${Math.abs(entry.daysLeft) === 1 ? '' : 's'}: ${entry.title}`;
    } else if (entry.level === 'hoy') {
      stage = 'hoy';
      message = `Vence hoy: ${entry.title}`;
    } else {
      // Etapa = el día de aviso más cercano que ya se alcanzó (por ejemplo, 7, 3 o 1 día antes).
      const reached = [...entry.remindDaysBefore].sort((a, b) => a - b).find((day) => entry.daysLeft <= day);
      if (reached === undefined) continue;
      stage = `d${reached}`;
      message = `Vence en ${entry.daysLeft} día${entry.daysLeft === 1 ? '' : 's'} (${entry.dueDate}): ${entry.title}`;
    }
    notifications.push({ id: `${entry.key}:${entry.dueDate}:${stage}`, entry, message });
  }
  return notifications;
}

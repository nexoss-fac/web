/**
 * Servicio de sincronización en tiempo real con la tasa oficial del Banco Central de Venezuela (BCV).
 * Utiliza DolarApi (https://ve.dolarapi.com/v1/dolares/oficial) como fuente oficial directa,
 * con soporte de reintentos, formato de fechas y manejo de fallos.
 * 
 * Regla Oficial BCV Fin de Semana:
 * La tasa fijada y publicada por el BCV para el día Lunes (fecha valor lunes)
 * es la tasa oficial válida y aplicable para el día Viernes, Sábado y Domingo.
 */

export interface BcvApiResponse {
  moneda: string;
  fuente: string;
  nombre: string;
  compra: number | null;
  venta: number | null;
  promedio: number;
  fechaActualizacion: string;
}

export interface BcvRateInfo {
  rate: number;
  officialDate: string;
  lastSyncedAt: string;
  source: string;
  status: 'synced' | 'syncing' | 'error' | 'manual';
  error?: string;
  isWeekendRate?: boolean;
  effectiveMondayDate?: string;
  currentDayName?: string;
  cycleRuleDescription?: string;
}

const BCV_API_PRIMARY = 'https://ve.dolarapi.com/v1/dolares/oficial';
const BCV_API_FALLBACK = 'https://ve.dolarapi.com/v1/dolares';

export function getWeekendMondayEffectiveDate(): {
  isWeekend: boolean;
  dayName: string;
  mondayFormatted: string;
  cycleRuleDescription: string;
} {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 5 = Friday, 6 = Saturday
  
  // En Venezuela, la tasa oficial del día lunes es válida para Viernes, Sábado y Domingo
  const isWeekendCycle = day === 5 || day === 6 || day === 0;

  const dayNames: Record<number, string> = {
    0: 'Domingo',
    1: 'Lunes',
    2: 'Martes',
    3: 'Miércoles',
    4: 'Jueves',
    5: 'Viernes',
    6: 'Sábado',
  };
  const currentDayName = dayNames[day] || '';

  let daysUntilMonday = 0;
  if (day === 5) {
    daysUntilMonday = 3; // Viernes -> Próximo Lunes
  } else if (day === 6) {
    daysUntilMonday = 2; // Sábado -> Próximo Lunes
  } else if (day === 0) {
    daysUntilMonday = 1; // Domingo -> Mañana Lunes
  }

  const nextMonday = new Date(now);
  nextMonday.setDate(now.getDate() + daysUntilMonday);

  const mondayFormatted = nextMonday.toLocaleDateString('es-VE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const cycleRuleDescription = isWeekendCycle
    ? `La tasa oficial del BCV del día Lunes (${mondayFormatted}) es válida para Viernes, Sábado y Domingo.`
    : 'Tasa oficial del Banco Central de Venezuela.';

  return {
    isWeekend: isWeekendCycle,
    dayName: currentDayName,
    mondayFormatted,
    cycleRuleDescription,
  };
}

function normalizeOfficialDate(value: unknown): string {
  const raw = String(value ?? '').trim();
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  const parsed = new Date(raw);
  if (Number.isFinite(parsed.getTime())) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(parsed);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function normalizeRate(value: unknown): number {
  const rate = typeof value === 'number' ? value : Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(rate) && rate > 0 ? Number(rate.toFixed(4)) : 0;
}

export async function fetchLiveBcvRate(): Promise<{
  rate: number;
  officialDate: string;
  source: string;
  isWeekendRate: boolean;
  effectiveMondayDate?: string;
  currentDayName?: string;
  cycleRuleDescription?: string;
}> {
  // Esta consulta es pública y de solo lectura. Se habilita en el modo local:
  // no transmite información de clientes, ventas ni datos de la empresa.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  let primaryError: unknown;

  try {
    const response = await fetch(BCV_API_PRIMARY, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} al consultar la tasa oficial`);
    const data = await response.json() as BcvApiResponse;
    const rate = normalizeRate(data?.promedio ?? data?.venta);
    if (!rate) throw new Error('La fuente oficial devolvió una tasa vacía o inválida.');
    return {
      rate,
      officialDate: normalizeOfficialDate(data.fechaActualizacion),
      source: 'BCV oficial (consulta de solo lectura vía DolarApi)',
      isWeekendRate: false,
      cycleRuleDescription: 'Se conserva la fecha de vigencia publicada por la fuente; no se inventa una fecha de lunes.',
    };
  } catch (error) {
    primaryError = error;
  } finally {
    clearTimeout(timeoutId);
  }

  // Respaldo: solo se acepta el elemento identificado explícitamente como oficial.
  const fallbackController = new AbortController();
  const fallbackTimeout = setTimeout(() => fallbackController.abort(), 8000);
  try {
    const response = await fetch(BCV_API_FALLBACK, {
      signal: fallbackController.signal,
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} en la fuente de respaldo`);
    const list = await response.json() as Array<BcvApiResponse & { fuente?: string; nombre?: string }>;
    const oficialItem = Array.isArray(list)
      ? list.find((item) => String(item.fuente || item.nombre || '').toLowerCase().includes('oficial'))
      : null;
    const rate = normalizeRate(oficialItem?.promedio ?? oficialItem?.venta);
    if (!oficialItem || !rate) throw new Error('La fuente de respaldo no publicó una tasa oficial válida.');
    return {
      rate,
      officialDate: normalizeOfficialDate(oficialItem.fechaActualizacion),
      source: 'BCV oficial (fuente de respaldo vía DolarApi)',
      isWeekendRate: false,
      cycleRuleDescription: 'Se conserva la fecha de vigencia publicada por la fuente; no se inventa una fecha de lunes.',
    };
  } catch (fallbackError) {
    const primaryMessage = primaryError instanceof Error ? primaryError.message : 'Fuente principal no disponible';
    const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : 'Fuente de respaldo no disponible';
    throw new Error(`No se pudo consultar la tasa oficial. Principal: ${primaryMessage}. Respaldo: ${fallbackMessage}`);
  } finally {
    clearTimeout(fallbackTimeout);
  }
}

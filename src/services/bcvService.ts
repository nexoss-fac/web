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

export async function fetchLiveBcvRate(): Promise<{
  rate: number;
  officialDate: string;
  source: string;
  isWeekendRate: boolean;
  effectiveMondayDate?: string;
  currentDayName?: string;
  cycleRuleDescription?: string;
}> {
  // La tasa del BCV es una consulta pública de solo lectura (no envía datos de la empresa), por eso tiene
  // su propio interruptor: VITE_NEXOSS_ALLOW_BCV=true la permite aunque el modo local aislado siga activo.
  if (import.meta.env.VITE_NEXOSS_LOCAL_ONLY === 'true' && import.meta.env.VITE_NEXOSS_ALLOW_BCV !== 'true') {
    throw new Error('Las consultas externas están desactivadas en el modo local aislado. Para permitir solo la tasa del BCV, agrega VITE_NEXOSS_ALLOW_BCV=true al archivo .env y reinicia.');
  }
  const { isWeekend, dayName, mondayFormatted, cycleRuleDescription } = getWeekendMondayEffectiveDate();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(BCV_API_PRIMARY, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status} from BCV API`);
    }

    const data: BcvApiResponse = await response.json();

    if (!data || typeof data.promedio !== 'number' || data.promedio <= 0) {
      throw new Error('Formato de tasa inválido devuelto por la API del BCV');
    }

    const rate = Number(data.promedio.toFixed(2));
    const source = isWeekend
      ? `BCV Oficial: Tasa del Lunes (${mondayFormatted}) válida para Viernes, Sábado y Domingo`
      : 'Banco Central de Venezuela (vía DolarApi)';

    return {
      rate,
      officialDate: data.fechaActualizacion || new Date().toISOString(),
      source,
      isWeekendRate: isWeekend,
      effectiveMondayDate: isWeekend ? mondayFormatted : undefined,
      currentDayName: dayName,
      cycleRuleDescription,
    };
  } catch (err: unknown) {
    clearTimeout(timeoutId);

    // Try fallback endpoint
    try {
      const fallbackResponse = await fetch(BCV_API_FALLBACK, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      if (fallbackResponse.ok) {
        const list = await fallbackResponse.json();
        const oficialItem = Array.isArray(list)
          ? list.find((item: { fuente?: string }) => item.fuente === 'oficial') || list[0]
          : null;

        if (oficialItem && typeof oficialItem.promedio === 'number' && oficialItem.promedio > 0) {
          const rate = Number(oficialItem.promedio.toFixed(2));
          const source = isWeekend
            ? `BCV Oficial: Tasa del Lunes (${mondayFormatted}) válida para Viernes, Sábado y Domingo (Respaldo)`
            : 'Banco Central de Venezuela (vía DolarApi Respaldo)';

          return {
            rate,
            officialDate: oficialItem.fechaActualizacion || new Date().toISOString(),
            source,
            isWeekendRate: isWeekend,
            effectiveMondayDate: isWeekend ? mondayFormatted : undefined,
            currentDayName: dayName,
            cycleRuleDescription,
          };
        }
      }
    } catch {
      // ignore fallback error and throw original
    }

    const errorMsg = err instanceof Error ? err.message : 'Error desconocido al conectar con API BCV';
    throw new Error(errorMsg);
  }
}

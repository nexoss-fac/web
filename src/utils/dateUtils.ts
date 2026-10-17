/**
 * Utilidades de fecha y zona horaria para Venezuela (America/Caracas, UTC-4).
 * Evita desfases por conversión UTC a medianoche que provocan que las facturas
 * emitidas en la noche queden registradas con la fecha del día siguiente.
 */

/**
 * Retorna la fecha actual en Venezuela en formato YYYY-MM-DD.
 */
export function getTodayVenezuela(): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
  } catch {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}

/**
 * Retorna la fecha de ayer en Venezuela en formato YYYY-MM-DD.
 */
export function getYesterdayVenezuela(): string {
  try {
    const now = new Date();
    // Restamos 24 horas
    const yesterday = new Date(now.getTime() - 86400000);
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(yesterday);
  } catch {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}

/**
 * Extrae la clave de fecha (YYYY-MM-DD) para cualquier string de fecha o ISO timestamp,
 * garantizando que corresponda al día civil en Venezuela sin desfasarse al día siguiente en UTC.
 */
export function getSaleDateKey(fechaStr?: string | null): string {
  if (!fechaStr) return getTodayVenezuela();
  
  const clean = String(fechaStr).trim();

  // Si ya es un formato YYYY-MM-DD simple
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return clean;
  }

  // Si viene con formato local YYYY-MM-DDTHH:mm:ss sin sufijo 'Z' ni offset
  if (clean.includes('T') && !clean.includes('Z') && !clean.includes('+')) {
    return clean.split('T')[0];
  }

  // Si es un ISO string en UTC (termina en Z o con offset)
  try {
    const d = new Date(clean);
    if (!isNaN(d.getTime())) {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(d);
    }
  } catch {}

  return clean.split('T')[0] || getTodayVenezuela();
}

/**
 * Genera un timestamp para una venta combinando la fecha de facturación elegida
 * con la hora actual, preservando la fecha seleccionada sin permitir desfases de UTC.
 */
export function createSaleTimestamp(invoiceDate?: string): string {
  const targetDate = invoiceDate && /^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)
    ? invoiceDate
    : getTodayVenezuela();

  const now = new Date();
  let hh = String(now.getHours()).padStart(2, '0');
  let mm = String(now.getMinutes()).padStart(2, '0');
  let ss = String(now.getSeconds()).padStart(2, '0');
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Caracas',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    hh = parts.find((p) => p.type === 'hour')?.value || hh;
    mm = parts.find((p) => p.type === 'minute')?.value || mm;
    ss = parts.find((p) => p.type === 'second')?.value || ss;
  } catch {}

  // Timestamp ISO con offset de Venezuela. PostgreSQL lo convierte correctamente
  // a TIMESTAMP WITH TIME ZONE y conserva la fecha civil seleccionada.
  return `${targetDate}T${hh}:${mm}:${ss}-04:00`;
}

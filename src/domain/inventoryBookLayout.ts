/**
 * Estructura del Libro de Inventario Normado (art. 177 LISLR), tomada del modelo en Excel
 * del contribuyente. NO existe grupo "Retiro": lo que sale por consumo propio va en
 * Autoconsumo y lo que se regala va en Donaciones.
 * Pantalla, Excel y PDF se generan desde esta lista para que nunca se desalineen.
 */
export type BookColumnKind = 'text' | 'qty' | 'money';

export interface BookColumn {
  id: string;
  label: string;
  /** Propiedad de la fila del reporte que se muestra en esta columna. */
  field: string;
  kind: BookColumnKind;
  /** Si el total del pie suma esta columna (los costos unitarios no se suman). */
  sum: boolean;
}

export interface BookGroup {
  id: 'inicial' | 'entrada' | 'autoconsumo' | 'donaciones' | 'salida' | 'final';
  label: string;
  columns: BookColumn[];
}

const date = (id: string, field: string): BookColumn => ({ id, label: 'Fecha', field, kind: 'text', sum: false });
const qty = (id: string, field: string): BookColumn => ({ id, label: 'Cantidad', field, kind: 'qty', sum: true });
const unitCost = (id: string, field: string): BookColumn => ({ id, label: 'Costo unitario Bs', field, kind: 'money', sum: false });
const amount = (id: string, field: string, label = 'Monto Bs'): BookColumn => ({ id, label, field, kind: 'money', sum: true });

export const INVENTORY_BOOK_GROUPS: readonly BookGroup[] = [
  { id: 'inicial', label: 'Existencia inicial', columns: [qty('ini-cant', 'existenciaInicial'), unitCost('ini-costo', 'costoInicialBs'), amount('ini-monto', 'montoInicialBs', 'Monto total Bs')] },
  { id: 'entrada', label: 'Entrada', columns: [date('ent-fecha', 'fechasEntradas'), qty('ent-cant', 'entradas'), unitCost('ent-costo', 'entradasCostoBs'), amount('ent-monto', 'entradasMontoBs')] },
  { id: 'autoconsumo', label: 'Autoconsumo', columns: [date('aut-fecha', 'fechasAutoconsumo'), qty('aut-cant', 'autoconsumo'), amount('aut-monto', 'autoconsumoMontoBs')] },
  { id: 'donaciones', label: 'Donaciones', columns: [date('don-fecha', 'fechasDonaciones'), qty('don-cant', 'donaciones'), amount('don-monto', 'donacionesMontoBs')] },
  { id: 'salida', label: 'Salida', columns: [qty('sal-cant', 'salidas'), amount('sal-monto', 'salidasMontoBs')] },
  { id: 'final', label: 'Existencia final', columns: [qty('fin-cant', 'existenciaFinal'), unitCost('fin-costo', 'costoFinalBs'), amount('fin-monto', 'montoFinalBs', 'Monto total Bs')] },
];

export const INVENTORY_BOOK_COLUMNS: readonly BookColumn[] = INVENTORY_BOOK_GROUPS.flatMap((group) => group.columns);

/** Motivos de salida que el libro reconoce como grupos propios (en minúsculas, sin tildes). */
export const SELF_USE_PATTERN = /auto.?consumo/;
export const DONATION_PATTERN = /donaci[oó]n|donad[oa]s?|obsequi/;

export function classifyExitReason(reason: string): 'autoconsumo' | 'donaciones' | 'salida' {
  const text = String(reason || '').toLowerCase();
  if (DONATION_PATTERN.test(text)) return 'donaciones';
  if (SELF_USE_PATTERN.test(text)) return 'autoconsumo';
  return 'salida';
}

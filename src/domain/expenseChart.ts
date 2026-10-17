/**
 * Norma de clasificación de egresos (sistema Patentadoc):
 *   Partida: Egresos  >  Cuenta: Gastos  >  Subcuenta (21 opciones).
 * El orden de EXPENSE_SUBACCOUNTS es el de la norma; es el orden por defecto de los menús.
 */
export const EXPENSE_PARTIDA = 'Egresos';
export const EXPENSE_CUENTA = 'Gastos';

export const EXPENSE_SUBACCOUNTS = [
  'Sueldos empleados',
  'Sueldos directores',
  'Tributos pagados',
  'Indemnizaciones laborales',
  'Depreciaciones y amortizaciones',
  'Intereses',
  'Traslados',
  'Pérdidas',
  'Reservas',
  'Arrendamientos',
  'Transporte',
  'Honorarios profesionales',
  'Reparaciones',
  'Publicidad comercial',
  'Seguros',
  'Investigación',
  'Representación',
  'Personal',
  'Bancos',
  'Servicios públicos',
  'Servicios privados',
] as const;

export type ExpenseSubaccount = typeof EXPENSE_SUBACCOUNTS[number];

/** Gastos antiguos que no tienen equivalente claro en la norma: hay que reclasificarlos a mano. */
export const UNCLASSIFIED_EXPENSE = 'Sin clasificar' as const;
export type ExpenseCategory = ExpenseSubaccount | typeof UNCLASSIFIED_EXPENSE;

/** Mismas subcuentas en orden alfabético (para quien prefiera ese orden). */
export function expenseSubaccountsAlphabetical(): ExpenseSubaccount[] {
  return [...EXPENSE_SUBACCOUNTS].sort((a, b) => a.localeCompare(b, 'es'));
}

/** Categorías usadas antes de la norma -> subcuenta equivalente. */
const LEGACY_CATEGORY_MAP: Record<string, ExpenseSubaccount> = {
  'alquiler de local': 'Arrendamientos',
  'nómina y sueldos': 'Sueldos empleados',
  'servicios públicos (luz/agua/internet)': 'Servicios públicos',
  'fletes y transporte': 'Transporte',
  'publicidad y redes sociales': 'Publicidad comercial',
  'mantenimiento y reparaciones': 'Reparaciones',
  'impuestos y tasas municipales': 'Tributos pagados',
  'comisiones y gastos bancarios': 'Bancos',
};
// Sin equivalente en la norma (quedan como "Sin clasificar"):
//   'Compra de Mercancía / Proveedores' (es inventario, no gasto),
//   'Empaques, Bolsas y Cajas' y 'Otros Gastos Operativos'.

const normalizeKey = (value: unknown) => String(value ?? '').trim().toLowerCase();

export function normalizeExpenseCategory(value: unknown): ExpenseCategory {
  const key = normalizeKey(value);
  const exact = EXPENSE_SUBACCOUNTS.find((item) => item.toLowerCase() === key);
  if (exact) return exact;
  return LEGACY_CATEGORY_MAP[key] ?? UNCLASSIFIED_EXPENSE;
}

export function isExpenseSubaccount(value: unknown): value is ExpenseSubaccount {
  return EXPENSE_SUBACCOUNTS.some((item) => item === value);
}

/**
 * Utilidades para sumar dinero sin arrastrar error de punto flotante
 * (por ejemplo 0.1 + 0.2 = 0.30000000000000004).
 * Todas redondean a 2 decimales en cada operación. Es el paso intermedio
 * antes de guardar centavos enteros en toda la aplicación.
 */
export function roundMoney(value: unknown): number {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  // Number.EPSILON evita que 1.005 se redondee hacia abajo por su representación binaria.
  return Math.round((amount + Math.sign(amount) * Number.EPSILON) * 100) / 100;
}

export function addMoney(...values: unknown[]): number {
  return values.reduce<number>((sum, value) => roundMoney(sum + roundMoney(value)), 0);
}

export function subtractMoney(a: unknown, b: unknown): number {
  return roundMoney(roundMoney(a) - roundMoney(b));
}

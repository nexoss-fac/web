/**
 * Verifica en el servidor que una venta nueva sea aritméticamente coherente.
 * Antes el servidor guardaba total, IVA y ganancia tal como los enviaba el navegador.
 * Las fórmulas son las del POS (PointOfSale.tsx):
 *   base  = subtotal - descuento
 *   IVA   = incluido ? base * p / (100 + p) : base * p / 100   (0 si no aplica IVA)
 *   total = incluido y aplica ? base : base + IVA
 *   ganancia = max(0, total - IVA) - costo
 */
export interface SaleTotalsInput {
  items?: Array<{ cantidad?: unknown; precio_unitario?: unknown; costo_unitario?: unknown; subtotal?: unknown }>;
  subtotal_usd?: unknown;
  descuento_usd?: unknown;
  aplica_iva?: unknown;
  iva_incluido?: unknown;
  porcentaje_iva?: unknown;
  iva_monto_usd?: unknown;
  total_usd?: unknown;
  total_bs?: unknown;
  tasa_cambio?: unknown;
  costo_total_usd?: unknown;
  ganancia_neta_usd?: unknown;
}

export interface SaleTotalsResult {
  ok: boolean;
  problems: string[];
}

const USD_TOLERANCE = 0.05;   // margen por redondeo del navegador
const BS_TOLERANCE = 0.5;

const num = (value: unknown): number => (typeof value === 'number' ? value : Number(value));
const near = (a: number, b: number, tolerance: number) => Math.abs(a - b) <= tolerance;

export function validateSaleTotals(sale: SaleTotalsInput): SaleTotalsResult {
  const problems: string[] = [];
  const items = Array.isArray(sale.items) ? sale.items : [];
  if (items.length === 0) problems.push('La venta no tiene productos.');

  let itemsSubtotal = 0;
  items.forEach((item, index) => {
    const quantity = num(item.cantidad);
    const price = num(item.precio_unitario);
    const lineSubtotal = num(item.subtotal);
    if (!Number.isFinite(quantity) || quantity <= 0) problems.push(`Producto ${index + 1}: cantidad inválida.`);
    if (!Number.isFinite(price) || price < 0) problems.push(`Producto ${index + 1}: precio inválido.`);
    if (Number.isFinite(quantity) && Number.isFinite(price) && Number.isFinite(lineSubtotal) && !near(lineSubtotal, quantity * price, USD_TOLERANCE)) {
      problems.push(`Producto ${index + 1}: el subtotal no coincide con cantidad por precio.`);
    }
    itemsSubtotal += Number.isFinite(lineSubtotal) ? lineSubtotal : 0;
  });

  const subtotal = num(sale.subtotal_usd);
  const discount = num(sale.descuento_usd ?? 0);
  const total = num(sale.total_usd);
  const iva = num(sale.iva_monto_usd ?? 0);
  const percent = num(sale.porcentaje_iva ?? 0);
  const rate = num(sale.tasa_cambio);
  const totalBs = num(sale.total_bs);

  for (const [label, value] of [['subtotal', subtotal], ['descuento', discount], ['total', total], ['IVA', iva], ['porcentaje de IVA', percent], ['tasa de cambio', rate], ['total en Bs', totalBs]] as const) {
    if (!Number.isFinite(value) || value < 0) problems.push(`El valor de ${label} no es válido.`);
  }
  if (problems.length > 0) return { ok: false, problems };

  if (percent > 100) problems.push('El porcentaje de IVA no puede superar 100.');
  if (discount > subtotal + USD_TOLERANCE) problems.push('El descuento es mayor que el subtotal.');
  if (!near(subtotal, itemsSubtotal, USD_TOLERANCE)) problems.push('El subtotal no coincide con la suma de los productos.');

  const applies = Boolean(sale.aplica_iva);
  const included = applies && Boolean(sale.iva_incluido);
  const base = Math.max(0, subtotal - discount);
  const expectedIva = !applies ? 0 : included ? base * (percent / (100 + percent)) : base * (percent / 100);
  const expectedTotal = included ? base : base + expectedIva;

  if (!near(iva, expectedIva, USD_TOLERANCE)) problems.push('El IVA no coincide con el cálculo del servidor.');
  if (!near(total, expectedTotal, USD_TOLERANCE)) problems.push('El total no coincide con el cálculo del servidor.');
  if (totalBs > 0 && rate > 0 && !near(totalBs, total * rate, BS_TOLERANCE)) problems.push('El total en Bs no coincide con total por tasa de cambio.');

  const cost = num(sale.costo_total_usd ?? 0);
  const profit = num(sale.ganancia_neta_usd ?? 0);
  if (Number.isFinite(cost) && Number.isFinite(profit) && !near(profit, Math.max(0, total - iva) - cost, USD_TOLERANCE)) {
    problems.push('La ganancia no coincide con total menos IVA menos costo.');
  }

  return { ok: problems.length === 0, problems };
}

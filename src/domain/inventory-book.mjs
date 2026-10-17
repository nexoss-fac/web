export const INVENTORY_CATEGORIES = Object.freeze([
  'Mercancía',
  'Materia prima',
  'Productos en proceso',
  'Productos terminados'
]);

const MOVEMENTS = new Set(['Entrada', 'Salida', 'Autoconsumo', 'Donación']);

function finiteNonNegative(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new TypeError(`${field} must be a finite non-negative number`);
  return number;
}

function validateMovement(row) {
  for (const field of ['companyId', 'itemId', 'date', 'type']) {
    if (typeof row[field] !== 'string' || row[field].trim() === '') throw new TypeError(`${field} is required`);
  }
  if (!MOVEMENTS.has(row.type)) throw new TypeError(`Unsupported inventory movement: ${row.type}`);
  finiteNonNegative(row.quantity, 'quantity');
  finiteNonNegative(row.unitCostUsd, 'unitCostUsd');
  finiteNonNegative(row.unitCostBs, 'unitCostBs');
  finiteNonNegative(row.amountUsd, 'amountUsd');
  finiteNonNegative(row.amountBs, 'amountBs');
  finiteNonNegative(row.rate, 'rate');
  if (row.rate === 0) throw new TypeError('rate must be greater than zero');
  if (row.type !== 'Entrada' && row.amountUsd < 0) throw new TypeError('movement amount cannot be negative');
}

/**
 * Build one pivot-style inventory row for a company, item and selected period.
 * Opening balances are supplied explicitly until period-opening rules are approved.
 * Amounts are summed as recorded; no currency conversion is performed.
 */
export function buildInventoryBookRow({ companyId, itemId, period, opening, movements }) {
  if (!companyId || !itemId || !/^\d{4}-\d{2}$/.test(period ?? '')) throw new TypeError('companyId, itemId and YYYY-MM period are required');
  const balance = {
    quantity: finiteNonNegative(opening?.quantity ?? 0, 'opening.quantity'),
    amountUsd: finiteNonNegative(opening?.amountUsd ?? 0, 'opening.amountUsd'),
    amountBs: finiteNonNegative(opening?.amountBs ?? 0, 'opening.amountBs')
  };
  const columns = {
    inicio: { ...balance },
    entrada: { quantity: 0, amountUsd: 0, amountBs: 0 },
    salida: { quantity: 0, amountUsd: 0, amountBs: 0 },
    autoconsumo: { quantity: 0, amountUsd: 0, amountBs: 0 },
    donacion: { quantity: 0, amountUsd: 0, amountBs: 0 }
  };
  const selected = movements.filter(row => row.companyId === companyId && row.itemId === itemId && row.date.startsWith(`${period}-`));
  for (const row of selected) {
    validateMovement(row);
    const target = row.type === 'Entrada' ? columns.entrada : row.type === 'Salida' ? columns.salida : row.type === 'Donación' ? columns.donacion : columns.autoconsumo;
    target.quantity += Number(row.quantity);
    target.amountUsd += Number(row.amountUsd);
    target.amountBs += Number(row.amountBs);
  }
  const existence = { ...balance };
  for (const name of ['entrada', 'salida', 'autoconsumo', 'donacion']) {
    const sign = name === 'entrada' ? 1 : -1;
    for (const field of ['quantity', 'amountUsd', 'amountBs']) existence[field] += sign * columns[name][field];
  }
  return Object.freeze({ companyId, itemId, period, ...columns, existencia: existence, movementCount: selected.length });
}

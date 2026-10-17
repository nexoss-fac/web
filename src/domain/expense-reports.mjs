export const EXPENSE_SUBACCOUNTS = Object.freeze([
  'Sueldos empleados', 'Sueldos directores', 'Tributos pagados', 'Indemnizaciones laborales',
  'Depreciaciones y amortizaciones', 'Intereses', 'Traslados', 'Pérdidas', 'Reservas',
  'Arrendamientos', 'Transporte', 'Honorarios profesionales', 'Reparaciones',
  'Publicidad comercial', 'Seguros', 'Investigación', 'Representación', 'Personal',
  'Bancos', 'Servicios públicos', 'Servicios privados'
]);

function validateExpense(row) {
  for (const field of ['companyId', 'supplier', 'date', 'voucher', 'currency', 'subcategory']) {
    if (typeof row[field] !== 'string' || !row[field].trim()) throw new TypeError(`${field} is required`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) throw new TypeError('date must use YYYY-MM-DD');
  for (const field of ['amount', 'rate']) {
    if (!Number.isFinite(Number(row[field])) || Number(row[field]) <= 0) throw new TypeError(`${field} must be greater than zero`);
  }
  if (!row.supportingDocument) throw new TypeError('supportingDocument reference is required');
}

/** Group expenses by supplier and calendar date without converting currencies. */
export function reportExpenses({ expenses, companyId, from, to, currency } = {}) {
  if (!companyId) throw new TypeError('companyId is required');
  const selected = expenses.filter(row => row.companyId === companyId && (!from || row.date >= from) && (!to || row.date <= to) && (!currency || row.currency === currency));
  for (const row of selected) validateExpense(row);
  const groups = new Map();
  for (const row of selected) {
    const [year, month, day] = row.date.split('-');
    const key = [row.supplier, year, month, day, row.currency].join('|');
    const group = groups.get(key) ?? { supplier: row.supplier, year, month, day, currency: row.currency, total: 0, records: [] };
    group.total += Number(row.amount);
    group.records.push(row);
    groups.set(key, group);
  }
  return [...groups.values()].map(group => ({ ...group, records: [...group.records] }));
}

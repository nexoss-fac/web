export const inventoryMovements = Object.freeze([
  { companyId: 'demo-a', itemId: 'item-flour', date: '2026-10-03', type: 'Entrada', quantity: 100, unitCostUsd: 2.5, unitCostBs: 91.25, amountUsd: 250, amountBs: 9125, rate: 36.5 },
  { companyId: 'demo-a', itemId: 'item-flour', date: '2026-10-12', type: 'Salida', quantity: 12, unitCostUsd: 2.5, unitCostBs: 91.25, amountUsd: 30, amountBs: 1095, rate: 36.5 },
  { companyId: 'demo-a', itemId: 'item-flour', date: '2026-10-16', type: 'Autoconsumo', quantity: 3, unitCostUsd: 2.5, unitCostBs: 91.25, amountUsd: 7.5, amountBs: 273.75, rate: 36.5 },
  { companyId: 'demo-b', itemId: 'item-flour', date: '2026-10-04', type: 'Entrada', quantity: 900, unitCostUsd: 2, unitCostBs: 73, amountUsd: 1800, amountBs: 65700, rate: 36.5 }
]);

export const expenses = Object.freeze([
  { companyId: 'demo-a', supplier: 'Proveedor Ficticio', date: '2026-10-02', voucher: 'EGR-DEMO-01', currency: 'USD', amount: 75, rate: 36.5, subcategory: 'Servicios privados', supportingDocument: 'demo://factura-01' },
  { companyId: 'demo-a', supplier: 'Proveedor Ficticio', date: '2026-10-02', voucher: 'EGR-DEMO-02', currency: 'USD', amount: 25, rate: 36.5, subcategory: 'Reparaciones', supportingDocument: 'demo://factura-02' },
  { companyId: 'demo-b', supplier: 'Proveedor Ficticio', date: '2026-10-02', voucher: 'EGR-DEMO-03', currency: 'USD', amount: 900, rate: 36.5, subcategory: 'Transporte', supportingDocument: 'demo://factura-03' }
]);

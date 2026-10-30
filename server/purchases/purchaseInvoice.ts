/**
 * Dominio del lector de facturas de compras.
 * No registra gastos ni altera existencias: prepara datos para revisión y confirmación.
 */

export type PurchaseCurrency = 'USD' | 'VES' | 'BS';

export interface PurchaseInvoiceLine {
  description: string;
  sku: string;
  barcode: string;
  quantity: number;
  unit: string;
  unitCost: number;
  discount: number;
  taxableBase: number;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
  inventoryClassification: 'Materia prima' | 'Mercancía' | 'Productos en proceso' | 'Productos terminados' | 'Por clasificar';
  confidence: 'alta' | 'media' | 'baja';
}

export interface PurchaseInvoiceDraft {
  documentType: 'factura' | 'nota_entrega' | 'otro';
  supplierName: string;
  supplierTaxId: string;
  invoiceNumber: string;
  controlNumber: string;
  issueDate: string;
  currency: PurchaseCurrency | '';
  exchangeRate: number;
  subtotal: number;
  discountTotal: number;
  taxableBase: number;
  exemptBase: number;
  taxTotal: number;
  grandTotal: number;
  lines: PurchaseInvoiceLine[];
  confidence: 'alta' | 'media' | 'baja';
  warnings: string[];
  sourceModel: string;
}

const round = (value: number) => Math.round((value + Number.EPSILON) * 10000) / 10000;
const finiteNonNegative = (value: unknown) => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? round(n) : 0;
};
const clean = (value: unknown, max = 240) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const confidence = (value: unknown): 'alta' | 'media' | 'baja' =>
  value === 'alta' || value === 'baja' ? value : 'media';

/** Normaliza datos de IA sin completar con valores supuestos. */
export function normalizePurchaseInvoiceDraft(input: any, sourceModel = ''): PurchaseInvoiceDraft {
  const warnings: string[] = [];
  const rawLines = Array.isArray(input?.lines) ? input.lines : [];
  const lines: PurchaseInvoiceLine[] = rawLines.slice(0, 250).map((line: any) => {
    const quantity = finiteNonNegative(line?.quantity);
    const unitCost = finiteNonNegative(line?.unitCost);
    const discount = finiteNonNegative(line?.discount);
    const taxableBase = finiteNonNegative(line?.taxableBase);
    const taxRate = finiteNonNegative(line?.taxRate);
    const taxAmount = finiteNonNegative(line?.taxAmount);
    const lineTotal = finiteNonNegative(line?.lineTotal);
    const classification = ['Materia prima', 'Mercancía', 'Productos en proceso', 'Productos terminados'].includes(line?.inventoryClassification)
      ? line.inventoryClassification : 'Por clasificar';
    if (!clean(line?.description)) warnings.push('Hay una línea sin descripción que requiere revisión.');
    if (quantity <= 0) warnings.push('Una o más líneas tienen cantidad no identificada.');
    if (unitCost <= 0) warnings.push('Una o más líneas tienen costo unitario no identificado.');
    return {
      description: clean(line?.description),
      sku: clean(line?.sku, 100),
      barcode: clean(line?.barcode, 100),
      quantity,
      unit: clean(line?.unit, 40),
      unitCost,
      discount,
      taxableBase,
      taxRate,
      taxAmount,
      lineTotal,
      inventoryClassification: classification,
      confidence: confidence(line?.confidence),
    };
  });

  const currencyRaw = String(input?.currency || '').toUpperCase();
  const currency: PurchaseCurrency | '' = ['USD', '$'].includes(currencyRaw) ? 'USD'
    : ['VES', 'BS', 'BS.', 'BOLIVARES', 'BOLÍVARES'].includes(currencyRaw) ? 'VES' : '';
  if (!currency) warnings.push('Moneda no identificada: debe confirmarse antes de contabilizar.');
  if (!clean(input?.supplierName)) warnings.push('Proveedor no identificado.');
  if (!clean(input?.invoiceNumber)) warnings.push('Número de factura no identificado; verificar posibles duplicados.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean(input?.issueDate, 10))) warnings.push('Fecha de emisión no identificada o inválida.');
  if (!lines.length) warnings.push('No se detectaron líneas de productos.');

  const documentType = input?.documentType === 'factura' || input?.documentType === 'nota_entrega' ? input.documentType : 'otro';
  return {
    documentType,
    supplierName: clean(input?.supplierName),
    supplierTaxId: clean(input?.supplierTaxId, 40).toUpperCase(),
    invoiceNumber: clean(input?.invoiceNumber, 100),
    controlNumber: clean(input?.controlNumber, 100),
    issueDate: clean(input?.issueDate, 10),
    currency,
    exchangeRate: finiteNonNegative(input?.exchangeRate),
    subtotal: finiteNonNegative(input?.subtotal),
    discountTotal: finiteNonNegative(input?.discountTotal),
    taxableBase: finiteNonNegative(input?.taxableBase),
    exemptBase: finiteNonNegative(input?.exemptBase),
    taxTotal: finiteNonNegative(input?.taxTotal),
    grandTotal: finiteNonNegative(input?.grandTotal),
    lines,
    confidence: confidence(input?.confidence),
    warnings: [...new Set(warnings)],
    sourceModel: clean(sourceModel, 80),
  };
}

/** Clave determinista para detectar reimportaciones dentro de la misma empresa. */
export function buildPurchaseInvoiceDuplicateKey(input: {
  supplierTaxId?: string;
  supplierName?: string;
  invoiceNumber?: string;
  controlNumber?: string;
}): string | null {
  const supplier = clean(input.supplierTaxId).replace(/[^A-Z0-9]/g, '')
    || clean(input.supplierName).toLocaleLowerCase('es').replace(/\s+/g, ' ');
  const document = clean(input.invoiceNumber).replace(/\s+/g, '').toUpperCase()
    || clean(input.controlNumber).replace(/\s+/g, '').toUpperCase();
  if (!supplier || !document) return null;
  return [supplier, document].join(':');
}

/** Totales informativos; no reemplazan los importes impresos en la factura. */
export function calculatePurchaseInvoiceLineTotal(line: Pick<PurchaseInvoiceLine, 'quantity' | 'unitCost' | 'discount' | 'taxAmount'>): number {
  return round(Math.max(0, line.quantity * line.unitCost - line.discount) + line.taxAmount);
}

export function validatePurchaseInvoiceForConfirmation(draft: PurchaseInvoiceDraft): string[] {
  const errors: string[] = [];
  if (draft.documentType !== 'factura') errors.push('Solo se puede confirmar una factura de compra; las notas de entrega requieren revisión.');
  if (!draft.supplierName) errors.push('Falta identificar al proveedor.');
  if (!draft.supplierTaxId) errors.push('Falta el RIF o identificación fiscal del proveedor.');
  if (!draft.invoiceNumber && !draft.controlNumber) errors.push('Falta el número de factura o número de control.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.issueDate)) errors.push('La fecha de la factura no es válida.');
  if (!draft.currency) errors.push('Debe confirmarse la moneda.');
  if (!draft.lines.length) errors.push('La factura no contiene productos.');
  draft.lines.forEach((line, index) => {
    if (!line.description) errors.push(`La línea ${index + 1} no tiene descripción.`);
    if (line.quantity <= 0) errors.push(`La línea ${index + 1} no tiene una cantidad válida.`);
    if (line.unitCost <= 0) errors.push(`La línea ${index + 1} no tiene un costo unitario válido.`);
    if (!line.unit) errors.push(`La línea ${index + 1} no tiene unidad de medida.`);
    if (line.inventoryClassification === 'Por clasificar') errors.push(`La línea ${index + 1} requiere clasificación de inventario.`);
  });
  return errors;
}

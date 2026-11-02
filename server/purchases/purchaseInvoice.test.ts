import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPurchaseInvoiceDuplicateKey,
  calculatePurchaseInvoiceLineTotal,
  normalizePurchaseInvoiceDraft,
  validatePurchaseInvoiceForConfirmation,
} from './purchaseInvoice.ts';

const valid = () => normalizePurchaseInvoiceDraft({
  documentType: 'factura', supplierName: 'Proveedor C.A.', supplierTaxId: 'J-12345678-9',
  invoiceNumber: 'F-001', issueDate: '2026-10-30', currency: 'USD', grandTotal: 112,
  lines: [{ description: 'Leche', quantity: 10, unit: 'litros', unitCost: 10, taxRate: 12,
    taxableBase: 100, taxAmount: 12, lineTotal: 112, inventoryClassification: 'Materia prima' }],
});

test('normaliza una factura y preserva cantidades, costos e impuestos extraídos', () => {
  const draft = valid();
  assert.equal(draft.lines[0].quantity, 10);
  assert.equal(draft.lines[0].unitCost, 10);
  assert.equal(draft.lines[0].taxAmount, 12);
  assert.equal(draft.grandTotal, 112);
});

test('no inventa moneda, proveedor ni número de factura ausentes', () => {
  const draft = normalizePurchaseInvoiceDraft({ lines: [] });
  assert.equal(draft.currency, '');
  assert.equal(draft.supplierName, '');
  assert.equal(draft.invoiceNumber, '');
  assert.ok(draft.warnings.length >= 4);
});

test('construye clave idempotente por proveedor y documento', () => {
  assert.equal(buildPurchaseInvoiceDuplicateKey({ supplierTaxId: 'J-12345678-9', invoiceNumber: ' F 001 ' }), 'J123456789:F001');
  assert.equal(buildPurchaseInvoiceDuplicateKey({ supplierName: 'Proveedor Uno', controlNumber: '0002' }), 'proveedor uno:0002');
  assert.equal(buildPurchaseInvoiceDuplicateKey({ supplierName: 'Proveedor Uno' }), null);
});

test('calcula total de línea sin perder precisión de decimales', () => {
  assert.equal(calculatePurchaseInvoiceLineTotal({ quantity: 3, unitCost: 0.1, discount: 0, taxAmount: 0.03 }), 0.33);
});

test('bloquea confirmación si faltan datos críticos o clasificación', () => {
  const draft = valid();
  assert.deepEqual(validatePurchaseInvoiceForConfirmation(draft), []);
  draft.lines[0].inventoryClassification = 'Por clasificar';
  assert.ok(validatePurchaseInvoiceForConfirmation(draft).some((e) => e.includes('clasificación')));
  draft.supplierTaxId = '';
  assert.ok(validatePurchaseInvoiceForConfirmation(draft).some((e) => e.includes('RIF')));
});

test('no permite confirmar notas de entrega como factura fiscal', () => {
  const draft = valid();
  draft.documentType = 'nota_entrega';
  assert.ok(validatePurchaseInvoiceForConfirmation(draft).some((e) => e.includes('Solo se puede confirmar')));
});

import { randomUUID } from 'node:crypto';
import { getNeonSql, initDatabaseSchema, readTenantWorkspaceState } from '../db.ts';
import { buildPurchaseInvoiceDuplicateKey, validatePurchaseInvoiceForConfirmation, type PurchaseInvoiceDraft } from './purchaseInvoice.ts';

export interface PurchaseInvoiceMapping {
  productId: string;
  unitFactor: number;
}

export interface CommitPurchaseInvoiceInput {
  draft: PurchaseInvoiceDraft;
  mappings: PurchaseInvoiceMapping[];
  exchangeRate: number;
  userId: string;
}

const round = (value: number) => Math.round((value + Number.EPSILON) * 10000) / 10000;
const inventoryAccount: Record<string, string> = {
  'Materia prima': 'Inventario de Materias Primas',
  'Mercancía': 'Inventario de Mercancía',
  'Productos en proceso': 'Inventario de Productos en Proceso',
  'Productos terminados': 'Inventario de Productos Terminados',
};

export async function commitPurchaseInvoice(input: CommitPurchaseInvoiceInput) {
  const sql = getNeonSql();
  if (!sql) throw new Error('No existe una conexión de base de datos para la empresa activa.');
  await initDatabaseSchema();
  const { draft } = input;
  const errors = validatePurchaseInvoiceForConfirmation(draft);
  if (errors.length) throw new Error(errors.join(' '));
  if (!(input.exchangeRate > 0) || !Number.isFinite(input.exchangeRate)) {
    throw new Error('Indica la tasa BCV correspondiente a la fecha de la factura.');
  }
  if (input.mappings.length !== draft.lines.length) throw new Error('Debes relacionar cada renglón con un producto del inventario.');
  const duplicateKey = buildPurchaseInvoiceDuplicateKey(draft);
  if (!duplicateKey) throw new Error('No se pudo construir la clave de control de duplicados del documento.');

  const state = await readTenantWorkspaceState();
  if (!state || !Array.isArray(state.products) || !Array.isArray(state.movements)) {
    throw new Error('No se pudo leer el inventario de la empresa. No se registró la compra.');
  }
  const expectedUpdatedAt = String(state.updatedAt || '');
  if (!expectedUpdatedAt) throw new Error('El estado de inventario no tiene versión; vuelve a cargar la aplicación antes de confirmar.');

  const products = (state.products as any[]).map((product) => ({ ...product }));
  const movements = [...(state.movements as any[])];
  const productIndex = new Map(products.map((product, index) => [String(product.id), index]));
  const now = new Date().toISOString();
  const invoiceId = randomUUID();
  const journalId = randomUUID();
  const currency = draft.currency === 'USD' ? 'USD' : 'Bs';
  const exchangeRate = round(input.exchangeRate);
  const persistedLines = draft.lines.map((line, index) => {
    const mapping = input.mappings[index];
    const productAt = productIndex.get(String(mapping?.productId || ''));
    if (productAt === undefined) throw new Error(`El renglón ${index + 1} no está vinculado a un producto vigente de esta empresa.`);
    if (!(mapping.unitFactor > 0) || !Number.isFinite(mapping.unitFactor)) {
      throw new Error(`Indica el factor de conversión de unidad para el renglón ${index + 1}.`);
    }
    const product = products[productAt];
    const inventoryQuantity = round(line.quantity * mapping.unitFactor);
    if (!(inventoryQuantity > 0)) throw new Error(`La cantidad convertida del renglón ${index + 1} no es válida.`);
    const unitCostUsd = draft.currency === 'USD' ? round(line.unitCost / mapping.unitFactor) : round(line.unitCost / exchangeRate / mapping.unitFactor);
    const oldStock = Number(product.stock || 0);
    const oldCost = Number(product.costo || 0);
    const newStock = round(oldStock + inventoryQuantity);
    const averageCost = newStock > 0 ? round(((oldStock * oldCost) + (inventoryQuantity * unitCostUsd)) / newStock) : unitCostUsd;
    product.stock = newStock;
    product.costo = averageCost;
    product.unidad_medida = product.unidad_medida || line.unit;
    const movement = {
      id: randomUUID(),
      producto_id: product.id,
      producto_nombre: product.nombre || line.description,
      sku: product.sku || line.sku || '',
      talla: product.talla || product.unidad_medida || line.unit,
      marca: product.marca || '',
      tipo: 'entrada',
      cantidad: inventoryQuantity,
      stock_anterior: oldStock,
      stock_nuevo: newStock,
      motivo: `Compra de proveedor ${draft.supplierName}`,
      fecha: now,
      usuario: input.userId,
      costo_unitario_usd: unitCostUsd,
      costo_unitario_bs: round(unitCostUsd * exchangeRate),
      tasa_cambio: exchangeRate,
      documento: draft.invoiceNumber || draft.controlNumber,
    };
    movements.unshift(movement);
    return {
      ...line,
      productId: product.id,
      productName: product.nombre || line.description,
      unitFactor: mapping.unitFactor,
      inventoryQuantity,
      inventoryUnit: product.unidad_medida || line.unit,
      unitCostUsd,
      movementId: movement.id,
    };
  });

  const lineNet = round(persistedLines.reduce((sum, line) => sum + Math.max(0, Number(line.lineTotal || 0) - Number(line.taxAmount || 0)), 0));
  const taxTotal = round(draft.taxTotal);
  const grandTotal = round(draft.grandTotal);
  if (!(grandTotal > 0) || Math.abs(lineNet + taxTotal - grandTotal) > 0.05) {
    throw new Error('Los importes de los renglones no coinciden con el total de la factura. Corrige los importes antes de confirmar.');
  }
  const lineTaxes = round(persistedLines.reduce((sum, line) => sum + Number(line.taxAmount || 0), 0));
  if (Math.abs(lineTaxes - taxTotal) > 0.05) throw new Error('El IVA de los renglones no coincide con el IVA total de la factura.');

  const accountDebits = new Map<string, number>();
  for (const line of persistedLines) {
    const account = inventoryAccount[line.inventoryClassification] || 'Inventario de Mercancía';
    accountDebits.set(account, round((accountDebits.get(account) || 0) + Math.max(0, Number(line.lineTotal || 0) - Number(line.taxAmount || 0))));
  }
  const journalLines = [
    ...Array.from(accountDebits.entries()).map(([cuenta, debe]) => ({
      partida: '01', cuenta, subcuenta: '', clasificacion: 'Activo corriente',
      subclasificacion: 'Inventario', moneda: currency, debe, haber: 0,
      debe_usd: draft.currency === 'USD' ? debe : round(debe / exchangeRate), haber_usd: 0,
      venta_compra: 'Compra',
    })),
    ...(taxTotal > 0 ? [{
      partida: '01', cuenta: 'IVA Crédito Fiscal', subcuenta: '', clasificacion: 'Activo corriente',
      subclasificacion: 'Impuestos recuperables', moneda: currency, debe: taxTotal, haber: 0,
      debe_usd: draft.currency === 'USD' ? taxTotal : round(taxTotal / exchangeRate), haber_usd: 0,
      venta_compra: 'Compra',
    }] : []),
    {
      partida: '02', cuenta: 'Proveedores', subcuenta: draft.supplierName, clasificacion: 'Pasivo corriente',
      subclasificacion: 'Cuentas por pagar', moneda: currency, debe: 0, haber: grandTotal,
      debe_usd: 0, haber_usd: draft.currency === 'USD' ? grandTotal : round(grandTotal / exchangeRate),
      venta_compra: 'Compra',
    },
  ];
  const nextState = {
    ...state,
    products,
    movements,
    updatedAt: now,
  };
  const invoicePayload = {
    id: invoiceId,
    supplierName: draft.supplierName,
    supplierTaxId: draft.supplierTaxId,
    invoiceNumber: draft.invoiceNumber,
    controlNumber: draft.controlNumber,
    issueDate: draft.issueDate,
    currency: draft.currency,
    exchangeRate,
    subtotal: draft.subtotal,
    discountTotal: draft.discountTotal,
    taxableBase: draft.taxableBase,
    exemptBase: draft.exemptBase,
    taxTotal,
    grandTotal,
    lines: persistedLines,
    duplicateKey,
    sourceModel: draft.sourceModel,
    createdAt: now,
    createdBy: input.userId,
  };
  const journal = {
    id: journalId,
    fecha: draft.issueDate,
    numero_asiento: `COMP-${invoiceId.slice(0, 8).toUpperCase()}`,
    tipo: 'compra',
    origen: 'purchase_invoice',
    origen_id: invoiceId,
    sujeto: draft.supplierName,
    rif: draft.supplierTaxId,
    documento: draft.invoiceNumber || draft.controlNumber,
    tipo_documento: 'FACTURA',
    metodo_pago: 'Crédito proveedor',
    tasa_dolar: exchangeRate,
    total_debe: grandTotal,
    total_haber: grandTotal,
    lineas: journalLines,
    libro_compra_venta: true,
    total_compras: grandTotal,
    compras_no_gravadas: draft.exemptBase,
    compras_gravadas: draft.taxableBase,
    porcentaje_impuesto: 0,
    observaciones: 'Asiento generado desde factura de compra confirmada.',
  };

  await sql`CREATE TABLE IF NOT EXISTS purchase_invoices (
    id VARCHAR(64) PRIMARY KEY,
    duplicate_key TEXT NOT NULL UNIQUE,
    supplier_name VARCHAR(180) NOT NULL,
    supplier_tax_id VARCHAR(50) NOT NULL,
    invoice_number VARCHAR(100),
    control_number VARCHAR(100),
    issue_date DATE NOT NULL,
    currency VARCHAR(10) NOT NULL,
    exchange_rate NUMERIC(14, 4) NOT NULL,
    grand_total NUMERIC(16, 4) NOT NULL,
    lines JSONB NOT NULL,
    document JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'confirmed',
    accounting_entry_id VARCHAR(64),
    created_by VARCHAR(128),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

  const result = await sql`
    WITH reserved AS (
      INSERT INTO purchase_invoices
        (id, duplicate_key, supplier_name, supplier_tax_id, invoice_number, control_number, issue_date, currency, exchange_rate, grand_total, lines, document, status, accounting_entry_id, created_by, created_at)
      VALUES
        (${invoiceId}, ${duplicateKey}, ${draft.supplierName}, ${draft.supplierTaxId}, ${draft.invoiceNumber || null}, ${draft.controlNumber || null}, ${draft.issueDate}::date, ${draft.currency}, ${exchangeRate}, ${grandTotal}, ${JSON.stringify(persistedLines)}::jsonb, ${JSON.stringify(invoicePayload)}::jsonb, 'processing', ${journalId}, ${input.userId}, ${now}::timestamptz)
      ON CONFLICT (duplicate_key) DO NOTHING
      RETURNING id
    ),
    updated AS (
      UPDATE nexoss_workspace_state
      SET state = ${JSON.stringify(nextState)}::jsonb, updated_at = NOW()
      WHERE id = 'current'
        AND state->>'updatedAt' = ${expectedUpdatedAt}
        AND EXISTS (SELECT 1 FROM reserved)
      RETURNING id
    ),
    cleanup AS (
      DELETE FROM purchase_invoices
      WHERE id = ${invoiceId}
        AND EXISTS (SELECT 1 FROM reserved)
        AND NOT EXISTS (SELECT 1 FROM updated)
      RETURNING id
    ),
    journal AS (
      INSERT INTO accounting_entries
        (id, fecha, numero_asiento, tipo, origen, origen_id, sujeto, rif, documento, tipo_documento, metodo_pago, tasa_dolar, total_debe, total_haber, lineas, libro_compra_venta, total_compras, compras_no_gravadas, compras_gravadas, porcentaje_impuesto, observaciones, updated_at)
      SELECT
        ${journalId}, ${draft.issueDate}::timestamptz, ${journal.numero_asiento}, 'compra', 'purchase_invoice', ${invoiceId},
        ${draft.supplierName}, ${draft.supplierTaxId}, ${draft.invoiceNumber || draft.controlNumber}, 'FACTURA', 'Crédito proveedor',
        ${exchangeRate}, ${grandTotal}, ${grandTotal}, ${JSON.stringify(journalLines)}::jsonb, TRUE, ${grandTotal},
        ${draft.exemptBase}, ${draft.taxableBase}, 0, 'Asiento generado desde factura de compra confirmada.', NOW()
      WHERE EXISTS (SELECT 1 FROM updated)
      RETURNING id
    ),
    finalized AS (
      UPDATE purchase_invoices
      SET status = 'confirmed'
      WHERE id = ${invoiceId} AND EXISTS (SELECT 1 FROM journal)
      RETURNING id
    )
    SELECT
      (SELECT COUNT(*)::int FROM reserved) AS reserved_count,
      (SELECT COUNT(*)::int FROM updated) AS updated_count,
      (SELECT COUNT(*)::int FROM journal) AS journal_count,
      (SELECT COUNT(*)::int FROM finalized) AS finalized_count
  `;
  const row = result[0] || {};
  if (Number(row.reserved_count || 0) === 0) {
    const duplicate = await sql`SELECT id FROM purchase_invoices WHERE duplicate_key = ${duplicateKey} LIMIT 1`;
    if (duplicate.length) throw new Error('Esta factura ya fue registrada en esta empresa. No se modificó el inventario.');
    throw new Error('No se pudo reservar la factura para su confirmación.');
  }
  if (Number(row.updated_count || 0) !== 1 || Number(row.journal_count || 0) !== 1 || Number(row.finalized_count || 0) !== 1) {
    throw new Error('El inventario cambió durante la confirmación. No se registró la compra; actualiza la pantalla y vuelve a revisar.');
  }
  return { invoiceId, accountingEntryId: journalId, productsUpdated: persistedLines.length, grandTotal, currency: draft.currency };
}

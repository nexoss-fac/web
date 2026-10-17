/**
 * Reglas de ventas sobre el almacenamiento JSON local, sin Express ni disco.
 * Se extrajeron de server.ts para poder probarlas: doble envío, stock y anulación.
 */
import type { AccountBalance, Sale, ShoeProduct } from '../../src/types.ts';
import { findProductIndex } from '../inventory/productMatch.ts';
import { addMoney } from '../money.ts';

export interface LocalSalesStore {
  sales: Sale[];
  products: ShoeProduct[];
  accounts: AccountBalance[];
}

/** Producto enviado por el navegador tras una venta: solo exige id para poder ubicarlo. */
export type ClientProductUpdate = Partial<ShoeProduct> & { id?: string };

/** Campos que sí se pueden actualizar en una venta ya registrada (los mismos del ON CONFLICT de Neon). */
export const SALE_UPDATABLE_FIELDS = [
  'pagos', 'estado', 'fecha', 'notas', 'estado_cashea',
  'total_positivo_inmediato_usd', 'total_cashea_pendiente_usd',
  // Historial de abonos de Cashea: el cliente lo enviaba y el servidor lo descartaba.
  'cashea_abonos',
] as const;

export type SaleUpdates = Partial<Pick<Sale, typeof SALE_UPDATABLE_FIELDS[number]>>;

export function pickUpdatableSaleFields(source: Partial<Sale> | Record<string, unknown>): SaleUpdates {
  const updates: Record<string, unknown> = {};
  for (const key of SALE_UPDATABLE_FIELDS) {
    if (key in source) updates[key] = (source as Record<string, unknown>)[key];
  }
  return updates as SaleUpdates;
}

/**
 * Registra una venta. Si el id ya existe solo actualiza cobros (sin tocar totales ni ítems);
 * si es nueva, descuenta stock una sola vez y suma los pagos a las cuentas.
 * Los reintentos del navegador no deben duplicar ninguno de esos efectos.
 */
export function applySaleToStore(
  store: LocalSalesStore,
  sale: Sale,
  updatedProducts?: ClientProductUpdate[],
  onStockChange?: (product: ShoeProduct, previous: number, next: number) => void,
): { isNewSale: boolean } {
  const existingIdx = store.sales.findIndex((item) => String(item.id) === String(sale.id));
  if (existingIdx >= 0) {
    store.sales[existingIdx] = { ...store.sales[existingIdx], ...pickUpdatableSaleFields(sale) };
    return { isNewSale: false };
  }
  store.sales.unshift(sale);

  for (const item of Array.isArray(sale.items) ? sale.items : []) {
    const qty = Math.max(1, Number(item.cantidad) || 1);
    const idx = findProductIndex(store.products, {
      id: item.producto_id, sku: item.sku, nombre: item.nombre_producto, talla: item.talla,
    });
    if (idx < 0) continue;
    const previous = Number(store.products[idx].stock || 0);
    const next = Math.max(0, previous - qty);
    store.products[idx].stock = next;
    onStockChange?.(store.products[idx], previous, next);
  }

  for (const fresh of Array.isArray(updatedProducts) ? updatedProducts : []) {
    const idx = findProductIndex(store.products, { id: fresh.id, sku: fresh.sku });
    if (idx >= 0) store.products[idx] = { ...store.products[idx], ...fresh } as ShoeProduct;
    else if (fresh.id) store.products.push(fresh as ShoeProduct);
  }

  for (const pago of Array.isArray(sale.pagos) ? sale.pagos : []) {
    const account = store.accounts.find((a) => a.nombre === pago.cuenta);
    if (account) account.saldo = addMoney(account.saldo, pago.monto);
  }
  return { isNewSale: true };
}

export type VoidLocalResult =
  | { status: 'not_found' }
  | { status: 'already_voided' }
  | { status: 'voided'; restored: Array<{ id: string; cantidad: number; stock: number }> };

/** Anula una venta local: devuelve el stock una sola vez y marca la venta como anulada. */
export function voidSaleInStore(store: LocalSalesStore, id: string, reason: string, now = new Date()): VoidLocalResult {
  const sale = store.sales.find((item) => String(item.id) === String(id));
  if (!sale) return { status: 'not_found' };
  if (sale.estado === 'anulada') return { status: 'already_voided' };

  const restored: Array<{ id: string; cantidad: number; stock: number }> = [];
  for (const item of Array.isArray(sale.items) ? sale.items : []) {
    const qty = Math.max(1, Number(item.cantidad) || 1);
    const idx = findProductIndex(store.products, {
      id: item.producto_id, sku: item.sku, nombre: item.nombre_producto, talla: item.talla,
    });
    if (idx < 0) continue;
    store.products[idx].stock = Number(store.products[idx].stock || 0) + qty;
    restored.push({ id: store.products[idx].id, cantidad: qty, stock: store.products[idx].stock });
  }
  sale.estado = 'anulada';
  sale.motivo_anulacion = String(reason || '');
  sale.anulada_at = now.toISOString();
  return { status: 'voided', restored };
}

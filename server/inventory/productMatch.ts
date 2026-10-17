/**
 * Regla única para encontrar el producto de una línea de venta.
 * Antes estaba copiada en tres rutas de server.ts (vender, sincronizar y anular);
 * si una cambiaba, las otras quedaban con la regla vieja.
 *
 * Orden de coincidencia: id exacto, luego SKU (sin mayúsculas), luego nombre + talla.
 */
export interface ProductRef {
  id?: unknown;
  sku?: unknown;
  nombre?: unknown;
  talla?: unknown;
}

const text = (value: unknown): string => String(value ?? '').trim();

export function productMatches(product: ProductRef, ref: ProductRef): boolean {
  const refId = text(ref.id);
  if (refId && text(product.id) === refId) return true;

  const refSku = text(ref.sku).toLowerCase();
  if (refSku && text(product.sku).toLowerCase() === refSku) return true;

  const refName = text(ref.nombre).toLowerCase();
  const refSize = text(ref.talla);
  return Boolean(
    refName && refSize
    && text(product.nombre).toLowerCase() === refName
    && text(product.talla) === refSize,
  );
}

export function findProductIndex(products: ReadonlyArray<ProductRef>, ref: ProductRef): number {
  return products.findIndex((product) => productMatches(product, ref));
}

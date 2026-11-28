export interface BarcodeProductMatch {
  title: string;
  brand: string;
  model: string;
  category: string;
  description: string;
  images: string[];
  ean: string;
  upc: string;
  gtin: string;
}

export interface BarcodeLookupResult {
  success: boolean;
  found: boolean;
  source?: string;
  barcode?: string;
  product?: BarcodeProductMatch;
  error?: string;
}

/**
 * Consulta el catálogo externo desde el backend autenticado de NEXOSS.
 * El valor del código se mantiene como texto para conservar ceros iniciales.
 */
export async function lookupProductByBarcode(code: string): Promise<BarcodeLookupResult> {
  const normalized = code.replace(/\s+/g, '');
  if (!/^(?:\d{8}|\d{12,14})$/.test(normalized)) {
    throw new Error('El código debe tener 8, 12, 13 o 14 dígitos.');
  }

  const response = await fetch(`/api/products/lookup-barcode?code=${encodeURIComponent(normalized)}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  const result = await response.json().catch(() => ({})) as BarcodeLookupResult;
  if (!response.ok) throw new Error(result.error || 'No se pudo consultar el catálogo.');
  return result;
}

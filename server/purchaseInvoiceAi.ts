import { GoogleGenAI } from '@google/genai';
import { logger } from './logger.ts';
import { normalizePurchaseInvoiceDraft, type PurchaseInvoiceDraft } from './purchases/purchaseInvoice.ts';

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error('Servicio de IA no disponible: GEMINI_API_KEY no está configurada.');
  if (!client) client = new GoogleGenAI({ apiKey: key, httpOptions: { timeout: 30000 } });
  return client;
}

function parseDocument(input: string): { data: string; mimeType: string } {
  const match = input.match(/^data:([\w.+-]+\/[\w.+-]+);base64,(.+)$/s);
  return match ? { data: match[2], mimeType: match[1] } : { data: input, mimeType: 'image/jpeg' };
}

/**
 * Lee una factura de compra para revisión. Nunca guarda gastos, inventario ni asientos.
 * Acepta imágenes y PDF soportados por Gemini; la confirmación es una operación aparte.
 */
export async function analyzePurchaseInvoice(
  documentBase64: string,
  industry = 'comercio general'
): Promise<PurchaseInvoiceDraft> {
  const { data, mimeType } = parseDocument(documentBase64);
  if (!data || data.length < 50) throw new Error('El documento de compra no contiene datos válidos.');
  if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/i.test(mimeType)) {
    throw new Error('Formato no compatible. Usa una imagen JPG, PNG, WEBP o un PDF.');
  }

  const prompt = `Actúas como extractor documental de facturas de compra para un ERP multiempresa.
Sector de la empresa: ${industry.slice(0, 120)}.
Extrae EXCLUSIVAMENTE información visible en el documento. No inventes importes, códigos, RIF, fechas, unidades ni tasas. Si un dato no aparece o es ilegible, usa cadena vacía o cero y baja la confianza.
Identifica el EMISOR como proveedor, no el comprador.
Devuelve cada renglón de producto por separado, no agrupes líneas diferentes.
Distingue cantidad, unidad, costo unitario, descuento, base imponible, alícuota, impuesto de línea y total de línea.
No confundas el total de factura con un costo unitario.
La moneda debe ser USD o VES. Si no está impresa con claridad, déjala vacía.
Las clasificaciones permitidas son Materia prima, Mercancía, Productos en proceso, Productos terminados o Por clasificar. Clasifica según el sector y la descripción del artículo; si no es claro, Por clasificar.
El documento puede ser factura, nota_entrega u otro. No trates comprobantes de pago como facturas.
No calcules ni inventes tasas de cambio. No calcules importes faltantes.
Devuelve JSON con este esquema:
{
 "documentType":"factura|nota_entrega|otro",
 "supplierName":"","supplierTaxId":"","invoiceNumber":"","controlNumber":"","issueDate":"YYYY-MM-DD",
 "currency":"USD|VES|",
 "exchangeRate":0,
 "subtotal":0,"discountTotal":0,"taxableBase":0,"exemptBase":0,"taxTotal":0,"grandTotal":0,
 "confidence":"alta|media|baja",
 "lines":[{"description":"","sku":"","barcode":"","quantity":0,"unit":"","unitCost":0,"discount":0,"taxableBase":0,"taxRate":0,"taxAmount":0,"lineTotal":0,"inventoryClassification":"Materia prima|Mercancía|Productos en proceso|Productos terminados|Por clasificar","confidence":"alta|media|baja"}]
}
Responde solo JSON válido.`;
  const models = ['gemini-2.5-flash', 'gemini-2.0-flash'];
  let lastError: unknown;
  for (const model of models) {
    try {
      const response = await getClient().models.generateContent({
        model,
        contents: { parts: [{ inlineData: { mimeType, data } }, { text: prompt }] },
        config: { responseMimeType: 'application/json', temperature: 0.1 },
      });
      const raw = (response.text || '').replace(/^\`\`\`json\s*/i, '').replace(/\`\`\`\s*$/i, '').trim();
      const parsed = JSON.parse(raw);
      return normalizePurchaseInvoiceDraft(parsed, model);
    } catch (error) {
      lastError = error;
      logger.warn(`[Gemini Purchase Invoice AI] Falló ${model}:`, error instanceof Error ? error.message : error);
    }
  }
  throw new Error(lastError instanceof Error ? lastError.message : 'No se pudo leer la factura de compra.');
}

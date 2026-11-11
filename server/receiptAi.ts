import { GoogleGenAI } from '@google/genai';
import { logger } from './logger.ts';
import { normalizeExpenseCategory } from '../src/domain/expenseChart.ts';

export interface ScannedReceiptData {
  success: boolean;
  monto: number;
  moneda: 'USD' | 'Bs';
  monto_usd: number;
  monto_bs: number;
  categoria: string;
  descripcion: string;
  beneficiario: string;
  fecha: string; // YYYY-MM-DD
  comprobante_ref: string;
  cuenta_sugerida: string;
  detalles_detectados: string;
  confianza: 'alta' | 'media' | 'baja';
  tasa_aplicada?: number;
  items?: Array<{ descripcion: string; cantidad?: number; total?: number }>;
  tipo_documento?: 'factura' | 'recibo' | 'comprobante_transferencia' | 'comprobante_pago' | 'nota_entrega' | 'otro';
  titular?: string;
  origen?: string;
  destino?: string;
  operacion_ref?: string;
  error?: string;
}

let aiClient: GoogleGenAI | null = null;

function getGenAI(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return null;
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        timeout: 30000,
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

function parseBase64Image(input: string, defaultMime = 'image/jpeg'): { data: string; mimeType: string } {
  let mimeType = defaultMime;
  let data = input;

  const match = input.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
  if (match) {
    mimeType = match[1];
    data = match[2];
  }

  return { data, mimeType };
}

/**
 * Analyzes an invoice / receipt photo with Google Gemini Vision
 */
export async function analyzeReceiptImage(
  imageBase64: string,
  exchangeRate = 1,
  historicalRates?: Record<string, number>
): Promise<ScannedReceiptData> {
  const { data, mimeType } = parseBase64Image(imageBase64);

  if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/i.test(mimeType)) {
    throw new Error('Formato no compatible. Envía una imagen JPG, PNG, WEBP o un PDF.');
  }

  if (!data || data.length < 50) {
    throw new Error('La imagen de la factura no contiene datos válidos.');
  }

  const ai = getGenAI();
  if (!ai) {
    throw new Error('Servicio de IA no disponible: GEMINI_API_KEY no configurada.');
  }

  const now = new Date();
  const todayIso = now.toISOString().split('T')[0];

  const prompt = `Eres un asistente contable y auditor experto para la tienda de calzado "NEXOSS" en Venezuela.
Tu tarea es identificar primero el tipo de documento y luego examinar minuciosamente la fotografía. Puede ser una factura, recibo, ticket fiscal, comprobante de pago móvil, comprobante de transferencia bancaria, factura de servicios o nota de entrega. Extrae los datos visibles sin inventar información.

TIPO DE DOCUMENTO Y TRANSFERENCIAS:
- Devuelve tipo_documento como exactamente uno de: factura, recibo, comprobante_transferencia, comprobante_pago, nota_entrega, otro.
- Si es una transferencia bancaria, extrae titular, origen (cuenta o teléfono parcialmente enmascarado), destino (cuenta o teléfono parcialmente enmascarado), beneficiario, número de operación/referencia y concepto.
- No confundas el número de teléfono o cuenta con el número de operación. No inventes datos ocultos.
- Un comprobante de transferencia NO debe registrarse automáticamente como gasto: debe quedar para revisión manual, porque puede ser un traspaso entre cuentas propias o un pago a un tercero.

INSTRUCCIONES DE EXTRACCIÓN:
1. MONTO TOTAL:
   - Identifica el monto final total a pagar o pagado (Total, Total a Pagar, Monto Neto, Total Factura, o Total Pagado).
   - Detecta si está en Bolívares (Bs, Bs.D, Bs.S, VES) o en Dólares ($ o USD).
   - Si no se especifica moneda pero la factura es venezolana con RIF y montos en cientos o miles, suele ser Bolívares (Bs). Si es monto pequeño como 25.00, 45.00 o tiene signo $, es USD.

2. FECHA:
   - Extrae la fecha de emisión de la factura o comprobante.
   - Formato requerido: AAAA-MM-DD (ej: 2026-09-23). Si no tiene año explícito, usa el año actual (${now.getFullYear()}). Si es ilegible, usa "${todayIso}".

3. BENEFICIARIO / PROVEEDOR:
   - Nombre de la empresa, tienda, comercio, prestador de servicio o persona que emitió la factura o recibió el pago (ej: Corpoelec, Tealca, Zoom, Envases Caracas, Proveedora de Calzado Los Andes, Distribuidora Suelas C.A., etc.).
   - Si tiene RIF (J-, V-, G-), inclúyelo junto al nombre si es relevante.

4. NÚMERO DE COMPROBANTE / FACTURA:
   - Número de Factura (N° Factura, Factura N°, N° Control, Comprobante N°, o Referencia de Pago Móvil).

5. CATEGORÍA:
   - Clasifica el gasto en EXACTAMENTE UNA de estas 21 subcuentas de Gastos (Partida Egresos > Cuenta Gastos), escrita tal cual:
     * "Sueldos empleados" (sueldos, comisiones de vendedores, adelantos de quincena)
     * "Sueldos directores" (remuneración de directores o socios administradores)
     * "Tributos pagados" (SENIAT, patente de industria y comercio, aseo urbano, timbres fiscales, tasas municipales)
     * "Indemnizaciones laborales" (prestaciones sociales, liquidaciones, vacaciones pagadas al cese)
     * "Depreciaciones y amortizaciones"
     * "Intereses" (intereses de préstamos o financiamientos)
     * "Traslados" (traslado de personal o de bienes entre locales)
     * "Pérdidas" (pérdidas por robo, daño o siniestro)
     * "Reservas"
     * "Arrendamientos" (alquiler de local, condominio de centro comercial)
     * "Transporte" (fletes, envíos de mercancía por Tealca, MRW, Zoom, combustible)
     * "Honorarios profesionales" (contador, abogado, gestor, diseñador gráfico)
     * "Reparaciones" (mantenimiento, electricista, pintura, aire acondicionado)
     * "Publicidad comercial" (pauta en Instagram o Facebook, volantes, vallas)
     * "Seguros" (pólizas del local o de la mercancía)
     * "Investigación"
     * "Representación" (atenciones a clientes, eventos)
     * "Personal" (uniformes, alimentación y beneficios del personal)
     * "Bancos" (comisión de punto de venta, mantenimiento de cuenta)
     * "Servicios públicos" (Corpoelec, Hidrocapital, Cantv, agua, aseo)
     * "Servicios privados" (internet privado, software, vigilancia, limpieza contratada)
   - Si ninguna encaja con claridad, responde "Sin clasificar". No inventes otra categoría.

6. DESCRIPCIÓN CONCISA:
   - Resumen claro de qué se compró o pagó (ej: "Compra de 500 bolsas impresas para zapatos", "Pago de servicio eléctrico Corpoelec local", "Flete de 3 bultos de calzado Tealca").

7. CUENTA SUGERIDA:
   - Si en el recibo se indica pago en efectivo divisas -> "Efectivo USD"
   - Si se indica efectivo bolívares -> "Efectivo Bs"
   - Si se indica pago móvil o transferencia BDV -> "Pago Móvil (BDV)"
   - Si se indica punto de venta / POS / tarjeta -> "Punto de Venta"
   - Si no se especifica, sugiere "Efectivo USD" o "Pago Móvil (BDV)" según la moneda detectada.

Tasa de cambio actual de referencia: ${exchangeRate.toFixed(2)} Bs/USD.

IMPORTANTE: Responde ÚNICAMENTE con un JSON válido sin bloques markdown, con esta estructura exacta:
{
  "tipo_documento": "factura" | "recibo" | "comprobante_transferencia" | "comprobante_pago" | "nota_entrega" | "otro",
  "titular": "nombre visible del titular de la cuenta",
  "origen": "cuenta o teléfono de origen visible",
  "destino": "cuenta o teléfono de destino visible",
  "operacion_ref": "número de operación o referencia",
  "monto": 25.50,
  "moneda": "USD" | "Bs",
  "categoria": "Transporte",
  "descripcion": "Flete de 3 bultos de calzado",
  "beneficiario": "Tealca",
  "fecha": "2026-09-23",
  "comprobante_ref": "FAC-004921",
  "cuenta_sugerida": "Efectivo USD",
  "detalles_detectados": "Factura por envío de 3 bultos Puerto Ordaz - Caracas",
  "confianza": "alta" | "media" | "baja",
  "items": [
    { "descripcion": "Bolsas ecológicas", "cantidad": 2, "total": 20.00 },
    { "descripcion": "Cinta embalaje", "cantidad": 1, "total": 5.50 }
  ]
}`;

  // Priorizar el modelo que ha respondido correctamente en producción; mantener
  // dos alternativas para evitar depender de un único modelo saturado.
  const modelsToTry = ['gemini-flash-latest', 'gemini-3.1-flash-lite', 'gemini-3.8-flash'];
  let lastErr: any = null;

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  for (const model of modelsToTry) {
    // Un intento acotado por modelo: el siguiente fallback evita acumular esperas
    // de varios minutos y reduce el riesgo de que Render cierre la petición.
    for (let attempt = 1; attempt <= 1; attempt++) {
      try {
        logger.info(`[Gemini Receipt AI] Escaneando factura con ${model} (intento ${attempt})...`);
        const imagePart = {
          inlineData: {
            // Gemini debe recibir el MIME original: PDF no puede etiquetarse como JPEG.
            mimeType: mimeType === 'application/pdf'
              ? 'application/pdf'
              : mimeType.includes('png')
              ? 'image/png'
              : mimeType.includes('webp')
              ? 'image/webp'
              : 'image/jpeg',
            data,
          },
        };
        const textPart = { text: prompt };

        const response = await ai.models.generateContent({
          model,
          contents: { parts: [imagePart, textPart] },
          config: {
            responseMimeType: 'application/json',
            temperature: 0.1,
          },
        });

        const rawText = response.text || '';
        logger.info(`[Gemini Receipt AI] Respuesta recibida (${rawText.length} caracteres) con ${model}`);

        const cleaned = rawText
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim();

        const parsed = JSON.parse(cleaned);

        // Validar fecha
        let fecha = parsed.fecha || todayIso;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
          fecha = todayIso;
        }

        // Determinar tasa efectiva para la fecha detectada de la factura
        let effectiveRate = exchangeRate;
        if (historicalRates && fecha && historicalRates[fecha] && Number(historicalRates[fecha]) > 0) {
          effectiveRate = Number(historicalRates[fecha]);
        }

        const moneda: 'USD' | 'Bs' = parsed.moneda === 'Bs' ? 'Bs' : 'USD';
        const monto = Number(parsed.monto) > 0 ? Number(Number(parsed.monto).toFixed(2)) : 0;
        
        let monto_usd = 0;
        let monto_bs = 0;

        if (moneda === 'USD') {
          monto_usd = monto;
          monto_bs = Number((monto * effectiveRate).toFixed(2));
        } else {
          monto_bs = monto;
          monto_usd = effectiveRate > 0 ? Number((monto / effectiveRate).toFixed(2)) : 0;
        }

        // Validar categoría. Una transferencia queda sin clasificar para impedir
        // que el modo automático la contabilice como gasto sin revisión humana.
        const tiposDocumento = ['factura', 'recibo', 'comprobante_transferencia', 'comprobante_pago', 'nota_entrega', 'otro'] as const;
        const tipoDocumento: NonNullable<ScannedReceiptData['tipo_documento']> = tiposDocumento.includes(parsed.tipo_documento)
          ? parsed.tipo_documento as NonNullable<ScannedReceiptData['tipo_documento']>
          : 'otro';
        const esTransferencia = tipoDocumento === 'comprobante_transferencia';
        const categoria: string = esTransferencia ? 'Sin clasificar' : normalizeExpenseCategory(parsed.categoria);
        const origen = typeof parsed.origen === 'string' ? parsed.origen.trim() : '';
        const destino = typeof parsed.destino === 'string' ? parsed.destino.trim() : '';
        const titular = typeof parsed.titular === 'string' ? parsed.titular.trim() : '';
        const operacionRef = typeof parsed.operacion_ref === 'string' ? parsed.operacion_ref.trim() : '';
        const detallesBase = typeof parsed.detalles_detectados === 'string' ? parsed.detalles_detectados : '';
        const detallesTransferencia = esTransferencia
          ? [`Tipo de documento: comprobante de transferencia`, `Titular: ${titular}`, `Origen: ${origen}`, `Destino: ${destino}`, `Operación: ${operacionRef}`, `Concepto: ${parsed.descripcion || ''}`].filter((part) => !part.endsWith(': ')).join(' · ')
          : '';

        return {
          success: true,
          monto,
          moneda,
          monto_usd,
          monto_bs,
          tasa_aplicada: effectiveRate,
          tipo_documento: tipoDocumento,
          titular,
          origen,
          destino,
          operacion_ref: operacionRef,
          categoria,
          descripcion: esTransferencia
            ? (parsed.descripcion || `Comprobante de transferencia${destino ? ` a ${destino}` : ''}`)
            : (parsed.descripcion || 'Gasto operativo registrado por foto de factura'),
          beneficiario: parsed.beneficiario || (esTransferencia ? destino : '') || 'Proveedor no especificado',
          fecha,
          comprobante_ref: operacionRef || parsed.comprobante_ref || '',
          cuenta_sugerida: parsed.cuenta_sugerida || (moneda === 'USD' ? 'Efectivo USD' : 'Pago Móvil (BDV)'),
          detalles_detectados: [detallesBase, detallesTransferencia].filter(Boolean).join(' · '),
          confianza: ['alta', 'media', 'baja'].includes(parsed.confianza) ? parsed.confianza : 'media',
          items: Array.isArray(parsed.items) ? parsed.items : [],
        };
      } catch (err: any) {
        const errMsg = err?.message || String(err);
        logger.warn(`[Gemini Receipt AI] Falló con modelo ${model} (intento ${attempt}):`, errMsg);
        lastErr = err;

        const isTransientOverload =
          /503|high demand|UNAVAILABLE|429|RESOURCE_EXHAUSTED|DEADLINE_EXCEEDED|deadline expired|fetch failed|ECONNRESET|ETIMEDOUT|timeout|socket|network/i.test(errMsg);

        if (isTransientOverload) {
          logger.warn(`[Gemini Receipt AI] Fallo transitorio en ${model}; se probará el siguiente modelo disponible.`);
          await sleep(350);
        }
        // Cualquier error de proveedor continúa con el siguiente modelo de respaldo.
        break;
      }
    }
  }

  const rawErrMsg = lastErr?.message || '';
  let friendlyMsg = 'No se pudo procesar la imagen de la factura con IA.';

  if (/503|high demand|UNAVAILABLE|DEADLINE_EXCEEDED|deadline expired|fetch failed|ECONNRESET|ETIMEDOUT|timeout|socket|network/i.test(rawErrMsg)) {
    friendlyMsg = 'Gemini está temporalmente saturado o tardó demasiado en responder. Puedes reintentar; el documento se conserva para completar los datos manualmente.';
  } else if (/429|RESOURCE_EXHAUSTED/i.test(rawErrMsg)) {
    friendlyMsg = 'Límite de solicitudes momentáneo alcanzado. Espera unos segundos y pulsa "Reintentar".';
  } else if (rawErrMsg) {
    try {
      const parsedErr = JSON.parse(rawErrMsg);
      if (parsedErr?.error?.message) {
        friendlyMsg = parsedErr.error.message;
      }
    } catch {
      friendlyMsg = rawErrMsg;
    }
  }

  logger.error('[Gemini Receipt AI] Error general:', friendlyMsg);
  throw new Error(friendlyMsg);
}


export interface ScannedCurrencyOperation {
  success: boolean;
  fecha: string;
  monto_bs: number;
  monto_usd: number;
  tasa: number;
  referencia: string;
  metodo: string;
  detalles: string;
  confianza: 'alta' | 'media' | 'baja';
  tipo_evidencia: 'comprobante' | 'efectivo' | 'mixto' | 'otro';
}

/**
 * Lee comprobantes P2P/transferencias o fotografías de efectivo para operaciones
 * de compra y venta de divisas. Los importes no visibles se devuelven como cero.
 */
export async function analyzeCurrencyOperation(
  imageBase64: string,
  operation: 'compra' | 'venta',
  currentRate = 0
): Promise<ScannedCurrencyOperation> {
  const { data, mimeType } = parseBase64Image(imageBase64);
  if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/i.test(mimeType)) {
    throw new Error('Formato no compatible. Envía JPG, PNG, WEBP o PDF.');
  }
  if (!data || data.length < 50) throw new Error('El archivo no contiene datos válidos.');
  const ai = getGenAI();
  if (!ai) throw new Error('Servicio de IA no disponible: GEMINI_API_KEY no configurada.');

  const prompt = `Eres un auditor experto en operaciones de cambio de divisas en Venezuela.
Analiza esta evidencia para una operación de ${operation === 'compra' ? 'COMPRA DE USD (se entregan bolívares y se reciben dólares)' : 'VENTA DE USD (se entregan dólares y se reciben bolívares)'}.
La evidencia puede ser: captura de Binance P2P/USDT, Zelle, transferencia bancaria, comprobante de pago, o fotografía de billetes en efectivo.

REGLAS:
- Extrae únicamente cifras que estén claramente visibles. No inventes importes, tasas, fechas, referencias ni comisiones.
- En capturas de P2P identifica el importe fiat en Bs, el importe neto en USDT/USD, el precio/tasa y el ID/orden.
- En comprobantes bancarios identifica el monto, moneda, fecha, referencia y contraparte si aparece.
- En fotos de efectivo, cuenta los billetes visibles y suma sus denominaciones SOLO si se distinguen y todos los billetes están completos. No supongas billetes ocultos ni valores por el tamaño del montón.
- Si aparecen billetes USD, calcula monto_usd; si aparecen bolívares, calcula monto_bs. En efectivo no inventes una tasa: tasa=0 salvo que esté impresa en la evidencia.
- Si hay dos importes y una tasa claramente visible, comprueba coherencia. Si falta algún dato, devuelve 0 para ese campo.
- Convierte fecha a YYYY-MM-DD solo si es legible; si no, usa cadena vacía.
- metodo debe ser exactamente una de: "Binance P2P (USDT)", "Zelle", "Dólares Efectivo", "Transferencia USD". Si no se identifica, cadena vacía.
- tipo_evidencia debe ser comprobante, efectivo, mixto u otro.
- detalles debe explicar qué datos se pudieron leer, denominaciones/cantidad de billetes y cualquier incertidumbre. No uses datos externos.
- confianza baja si el efectivo está parcialmente oculto, borroso o los importes no se distinguen.

Devuelve SOLO JSON válido:
{
 "fecha":"YYYY-MM-DD o vacío",
 "monto_bs":0,
 "monto_usd":0,
 "tasa":0,
 "referencia":"",
 "metodo":"",
 "detalles":"",
 "confianza":"alta|media|baja",
 "tipo_evidencia":"comprobante|efectivo|mixto|otro"
}
Tasa actual del formulario (solo contexto, no asumir que es la tasa de la operación): ${currentRate > 0 ? currentRate : 'no indicada'}.`;

  let lastError: any = null;
  for (const model of ['gemini-flash-latest', 'gemini-3.1-flash-lite', 'gemini-3.8-flash']) {
    try {
      logger.info(`[Gemini Currency AI] Analizando ${operation} con ${model}...`);
      const response = await ai.models.generateContent({
        model,
        contents: { parts: [
          { inlineData: { mimeType, data } },
          { text: prompt },
        ] },
        config: { responseMimeType: 'application/json', temperature: 0.1 },
      });
      const raw = (response.text || '').replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
      const parsed = JSON.parse(raw);
      const validMethods = ['Binance P2P (USDT)', 'Zelle', 'Dólares Efectivo', 'Transferencia USD'];
      const validConfidence = ['alta', 'media', 'baja'];
      const validEvidence = ['comprobante', 'efectivo', 'mixto', 'otro'];
      const fecha = typeof parsed.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.fecha) ? parsed.fecha : '';
      return {
        success: true,
        fecha,
        monto_bs: Number.isFinite(Number(parsed.monto_bs)) && Number(parsed.monto_bs) > 0 ? Number(Number(parsed.monto_bs).toFixed(2)) : 0,
        monto_usd: Number.isFinite(Number(parsed.monto_usd)) && Number(parsed.monto_usd) > 0 ? Number(Number(parsed.monto_usd).toFixed(2)) : 0,
        tasa: Number.isFinite(Number(parsed.tasa)) && Number(parsed.tasa) > 0 ? Number(Number(parsed.tasa).toFixed(4)) : 0,
        referencia: typeof parsed.referencia === 'string' ? parsed.referencia.trim() : '',
        metodo: validMethods.includes(parsed.metodo) ? parsed.metodo : '',
        detalles: typeof parsed.detalles === 'string' ? parsed.detalles.trim() : '',
        confianza: validConfidence.includes(parsed.confianza) ? parsed.confianza : 'baja',
        tipo_evidencia: validEvidence.includes(parsed.tipo_evidencia) ? parsed.tipo_evidencia : 'otro',
      };
    } catch (err: any) {
      lastError = err;
      const message = err?.message || String(err);
      logger.warn('[Gemini Currency AI] Falló modelo', model, message);
      if (!/503|high demand|UNAVAILABLE|429|RESOURCE_EXHAUSTED|DEADLINE_EXCEEDED|deadline expired|fetch failed|ECONNRESET|ETIMEDOUT|timeout|socket|network/i.test(message)) break;
    }
  }
  throw new Error(lastError?.message || 'No se pudo leer el comprobante de divisas.');
}

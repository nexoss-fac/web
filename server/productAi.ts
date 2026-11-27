import { logger } from './logger.ts';

export interface ProductAnalysisResult {
  success: true;
  nombre: string;
  marca: string;
  modelo: string;
  categoria: string;
  tipo: string;
  color: string;
  material: string;
  descripcion_comercial: string;
  caracteristicas_clave: string[];
  unidad_medida: string;
  es_materia_prima: boolean;
  precio_sugerido_usd: number;
  modelo_ia_usado: string;
}

function parseImage(input: string) {
  const match = input.match(/^data:([\w.+-]+\/[\w.+-]+);base64,(.+)$/s);
  return match ? { mimeType: match[1], data: match[2] } : { mimeType: 'image/jpeg', data: input };
}

function extractText(response: any): string {
  if (typeof response?.output_text === 'string') return response.output_text;
  const steps = Array.isArray(response?.steps) ? response.steps : [];
  return steps.flatMap((step: any) => Array.isArray(step?.content) ? step.content : [])
    .filter((part: any) => part?.type === 'text' && typeof part.text === 'string')
    .map((part: any) => part.text).join('\\n');
}

/** Reconocimiento visual universal mediante Gemini Interactions API REST con timeout y diagnóstico explícitos. */
export async function analyzeProductImage(
  imageBase64: string,
  userHint = '',
  industry = 'comercio general'
): Promise<ProductAnalysisResult> {
  const startedAt = Date.now();
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error('Servicio de IA no disponible: GEMINI_API_KEY no está configurada.');

  const { mimeType, data } = parseImage(imageBase64);
  if (!data || data.length < 50) throw new Error('La imagen no contiene datos válidos.');

  const isFootwear = /footwear|calzado|zapater/i.test(industry);
  const footwearGuidance = isFootwear ? `
IDENTIFICACIÓN PRECISA DE CALZADO:
- Inspecciona la imagen como especialista en catálogo: logotipo y letras visibles, lengüeta, talón, laterales, patrón de paneles, puntera, suela, entresuela, cámara/placa, costuras, ojales y cordones.
- Prioriza reconocer la MARCA y el MODELO comercial exacto cuando los rasgos visuales realmente lo sustenten. Contrasta los detalles característicos de cada marca; no uses solo la silueta genérica.
- Busca nombres o códigos impresos en la lengüeta, plantilla, lateral y suela cuando sean legibles.
- No confundas una línea o familia con un modelo exacto. No inventes números, series, colaboraciones ni ediciones.
- Si el modelo exacto no puede confirmarse, devuelve modelo vacío y crea un nombre útil y concreto: marca visible + tipo/estilo + color principal + rasgo distintivo visible (por ejemplo, "Nike sneaker urbano negro con suela plataforma"). Nunca uses nombres vacíos como "Zapato deportivo", "Calzado", "Producto", "Tenis genérico" ni "Producto por identificar".
- Si la marca no es legible, no la adivines: usa un nombre descriptivo con tipo, color y rasgos visibles específicos.
- Distingue el tipo real: Running, Casual, Deportivo, Botines Fútbol Campo, Fútbol Campo, Micro Tacos, Futsala, Béisbol, Botas, Sandalias u Otros. Fútbol campo solo si se ven tacos de campo.
` : '';
  const prompt = `Eres especialista en identificación visual de inventario para un ERP multiempresa.
Analiza exclusivamente el objeto visible. La empresa pertenece al sector: ${industry}.
${footwearGuidance}
Identifica el artículo, su categoría y características concretas. Distingue el producto del envase.
No inventes marca, modelo, composición, peso, volumen, SKU, lote, vencimiento ni certificaciones. Si un dato no es visible, usa cadena vacía.
El campo nombre debe ser específico, descriptivo y útil para buscar y vender el producto; no repitas etiquetas genéricas. Si modelo está confirmado, incluye marca + modelo + color/variante en nombre. Si no, usa los rasgos visibles concretos.
Pista adicional del usuario: ${userHint || 'Ninguna'}.
Devuelve SOLO JSON válido con: nombre, marca, modelo, categoria, tipo, color, material, descripcion_comercial, caracteristicas_clave (array), unidad_medida, es_materia_prima, precio_sugerido_usd.
No inventes precio: precio_sugerido_usd debe ser 0. La descripción debe separar hechos visibles de inferencias.`;

  // Modelos estables y alternativas de menor demanda. Los 503/429 son transitorios:
  // se reintentan con espera creciente antes de pasar al siguiente modelo.
  const models = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite'];
  let lastError: unknown;

  for (const modelName of models) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000);
      const attemptStarted = Date.now();
      try {
        logger.info(`[Gemini Product AI] REST Interactions: inicio ${modelName}, intento ${attempt}; imagen ${Math.round(data.length * 0.75 / 1024)} KB.`);
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/interactions?key=${encodeURIComponent(apiKey)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: modelName,
            input: [
              { type: 'image', data, mime_type: mimeType.startsWith('image/') ? mimeType : 'image/jpeg' },
              { type: 'text', text: prompt },
            ],
            store: false,
          }),
          signal: controller.signal,
        });

        const responseText = await response.text();
        if (!response.ok) {
          let detail = responseText;
          try {
            const parsedError = JSON.parse(responseText);
            detail = parsedError?.error?.message || responseText;
          } catch { /* conservar respuesta de error original */ }
          const httpError = new Error(`Gemini HTTP ${response.status}: ${detail.slice(0, 700)}`);
          lastError = httpError;
          logger.error(`[Gemini Product AI] Falló ${modelName} intento ${attempt}: ${httpError.message}`);
          if ([429, 500, 502, 503, 504].includes(response.status) && attempt < 2) {
            await new Promise(resolve => setTimeout(resolve, 1200 * attempt));
            continue;
          }
          break;
        }

        let interaction: any;
        try { interaction = JSON.parse(responseText); }
        catch { throw new Error('Gemini devolvió una respuesta HTTP no válida (JSON incorrecto).'); }

        const raw = extractText(interaction).replace(/```json\s*/i, '').replace(/```\s*$/i, '').trim();
        if (!raw) throw new Error(`Gemini no devolvió texto (estado: ${interaction?.status || 'desconocido'}).`);

        let parsed: any;
        try { parsed = JSON.parse(raw); }
        catch { throw new Error(`Gemini devolvió texto que no es JSON: ${raw.slice(0, 300)}`); }

        const clean = (v: unknown) => typeof v === 'string' ? v.trim() : '';
        const brand = clean(parsed.marca);
        const productModel = clean(parsed.modelo);
        const color = clean(parsed.color);
        const kind = clean(parsed.tipo);
        const genericFootwearName = /^(?:(?:adidas|nike|puma|reebok|new balance|asics|under armour)\s+)?(?:zapato(?:s)?|calzado(?: deportivo)?|tenis(?: deportivos)?|zapatilla(?:s)?|sneaker(?:s)?|producto|art[ií]culo)(?:\s+(?:deportivo|deportiva|para hombre|para mujer|con tacos|deportivo con tacos))*$/i;
        const specificFeatures = Array.isArray(parsed.caracteristicas_clave)
          ? parsed.caracteristicas_clave.filter((v: unknown) => typeof v === 'string').map((v: string) => v.trim()).filter(Boolean).slice(0, 3)
          : [];
        const suppliedName = clean(parsed.nombre);
        const description = clean(parsed.descripcion_comercial);
        const usefulDescription = description.split(/[.;]/).map((part: string) => part.trim()).find((part: string) => part.length >= 12 && !genericFootwearName.test(part)) || '';
        const fallbackFeatures = [...specificFeatures, usefulDescription].filter(Boolean).slice(0, 2);
        const descriptiveName = [brand, productModel, kind, color, clean(parsed.material), ...fallbackFeatures]
          .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
        const normalizedName = suppliedName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
        const looksGeneric = genericFootwearName.test(suppliedName) || /^(?:calzado|zapato|tenis|zapatilla|sneaker|producto|articulo)(?:\s+(?:deportivo|deportiva|con tacos|para hombre|para mujer))*$/.test(normalizedName);
        const productName = isFootwear && (!suppliedName || looksGeneric)
          ? (descriptiveName || 'Calzado sin modelo confirmado - revisar identificación visual')
          : (suppliedName || descriptiveName || 'Producto sin identificar');
        const result: ProductAnalysisResult = {
          success: true,
          nombre: productName,
          marca: brand,
          modelo: productModel,
          categoria: clean(parsed.categoria),
          tipo: clean(parsed.tipo),
          color,
          material: clean(parsed.material),
          descripcion_comercial: clean(parsed.descripcion_comercial),
          caracteristicas_clave: Array.isArray(parsed.caracteristicas_clave) ? parsed.caracteristicas_clave.filter((v: unknown) => typeof v === 'string').slice(0, 12) : [],
          unidad_medida: clean(parsed.unidad_medida) || 'Unidad',
          es_materia_prima: parsed.es_materia_prima === true,
          precio_sugerido_usd: 0,
          modelo_ia_usado: modelName,
        };
        logger.info(`[Gemini Product AI] OK ${modelName} en ${Date.now() - attemptStarted} ms; total ${Date.now() - startedAt} ms.`);
        return result;
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`[Gemini Product AI] Falló ${model} intento ${attempt} en ${Date.now() - attemptStarted} ms: ${message}`);
        if (attempt < 2 && (message.includes('503') || message.includes('429') || message.includes('502') || message.includes('504'))) {
          await new Promise(resolve => setTimeout(resolve, 1200 * attempt));
          continue;
        }
        break;
      } finally {
        clearTimeout(timeout);
      }
    }
  }

  throw new Error(lastError instanceof Error ? lastError.message : 'No se pudo identificar el producto. Intenta con una foto más nítida.');
}

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
IDENTIFICACIÓN ESPECIALIZADA DE CALZADO:
- Prioriza leer logotipos, letras, emblemas, patrón de paneles, suela, entresuela, puntera, talón y sistema de cordones.
- Identifica marca y modelo comercial únicamente cuando existan señales visuales suficientes. No deduzcas un modelo solo por la silueta general.
- Para marcas conocidas, contrasta rasgos característicos: Adidas (tres bandas, Trefoil, puntera T), Nike (Swoosh), New Balance (N lateral y códigos de silueta), Puma (Formstrip), Asics (Tiger Stripes), Reebok (Vector), Converse (parche/estrella), Vans (Jazz Stripe).
- Describe el tipo con precisión: running, casual/urbano, fútbol campo, turf/microtacos, futsala, botas, sandalias u otro.
- El color debe distinguir cuerpo, detalles y suela. Material solo si se aprecia claramente.
- Si no puedes confirmar el modelo exacto, deja modelo vacío y crea un nombre descriptivo con marca visible + tipo de calzado + colores. No inventes series, números ni ediciones.
- Si el logotipo no es legible, deja marca vacía; no atribuyas la marca por parecido.
` : '';
  const prompt = `Eres especialista en identificación visual de inventario para un ERP multiempresa.
La empresa pertenece al sector: ${industry}. Analiza exclusivamente lo que se ve en la fotografía.
${isFootwear ? 'El objeto esperado es CALZADO. Aplica estas reglas especializadas:' : 'No asumas que el objeto es calzado; identifica el artículo visible.'}
${footwearGuidance}
Distingue el producto de su envase y no inventes marca, modelo, composición, peso, volumen, SKU, lote, vencimiento ni certificaciones. Si un dato no es visible, usa cadena vacía.
Si parece ingrediente, material de fabricación o empaque, marca es_materia_prima=true; si no puedes determinarlo, false.
Pista del usuario: ${userHint || 'Ninguna'}.
El nombre debe ser útil y específico sin inventar: combina solo marca/modelo/color realmente identificables; si no se identifican, usa una descripción objetiva del artículo y su color.
Devuelve SOLO JSON válido con: nombre, marca, modelo, categoria, tipo, color, material, descripcion_comercial, caracteristicas_clave (array), unidad_medida, es_materia_prima, precio_sugerido_usd.
No inventes precio: precio_sugerido_usd debe ser 0. La descripción debe separar hechos visibles de inferencias.`;

  // Modelos estables y alternativas de menor demanda. Los 503/429 son transitorios:
  // se reintentan con espera creciente antes de pasar al siguiente modelo.
  const models = ['gemini-3.8-flash', 'gemini-3.5-flash-lite'];
  let lastError: unknown;

  for (const model of models) {
    for (let attempt = 1; attempt <= 1; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 24000);
      const attemptStarted = Date.now();
      try {
        logger.info(`[Gemini Product AI] REST Interactions: inicio ${model}, intento ${attempt}; imagen ${Math.round(data.length * 0.75 / 1024)} KB.`);
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/interactions?key=${encodeURIComponent(apiKey)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
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
          logger.error(`[Gemini Product AI] Falló ${model} intento ${attempt}: ${httpError.message}`);
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
        const result: ProductAnalysisResult = {
          success: true,
          nombre: clean(parsed.nombre) || [clean(parsed.marca), clean(parsed.modelo), clean(parsed.color)].filter(Boolean).join(' ') || (isFootwear ? 'Calzado por identificar' : 'Producto por identificar'),
          marca: clean(parsed.marca),
          modelo: clean(parsed.modelo),
          categoria: clean(parsed.categoria),
          tipo: clean(parsed.tipo),
          color: clean(parsed.color),
          material: clean(parsed.material),
          descripcion_comercial: clean(parsed.descripcion_comercial),
          caracteristicas_clave: Array.isArray(parsed.caracteristicas_clave) ? parsed.caracteristicas_clave.filter((v: unknown) => typeof v === 'string').slice(0, 12) : [],
          unidad_medida: clean(parsed.unidad_medida) || 'Unidad',
          es_materia_prima: parsed.es_materia_prima === true,
          precio_sugerido_usd: 0,
          modelo_ia_usado: model,
        };
        logger.info(`[Gemini Product AI] OK ${model} en ${Date.now() - attemptStarted} ms; total ${Date.now() - startedAt} ms.`);
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

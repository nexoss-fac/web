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

  const prompt = `Eres un especialista en identificación visual de inventario para un ERP multiempresa.
Analiza el objeto visible sin asumir que es calzado. La empresa pertenece al sector: ${industry}.
Identifica cualquier artículo: mercancía para reventa, alimentos, bebidas, materias primas, ingredientes, cultivos, empaques, repuestos, herramientas, equipos, ropa o insumos.
Distingue el producto de su envase y no inventes marca, modelo, composición, peso, volumen, SKU, lote, vencimiento ni certificaciones. Si un dato no es visible, usa cadena vacía o cero.
Si parece ingrediente, material de fabricación o empaque, marca es_materia_prima=true; si no puedes determinarlo, false.
Pista del usuario: ${userHint || 'Ninguna'}.
Devuelve SOLO JSON válido con: nombre, marca, modelo, categoria, tipo, color, material, descripcion_comercial, caracteristicas_clave (array), unidad_medida, es_materia_prima, precio_sugerido_usd.
No inventes precio: precio_sugerido_usd debe ser 0. La descripción debe separar hechos visibles de inferencias.`;

  const models = ['gemini-3.8-flash', 'gemini-3.5-flash'];
  let lastError: unknown;

  for (const model of models) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const attemptStarted = Date.now();
    try {
      logger.info(`[Gemini Product AI] REST Interactions: inicio ${model}; imagen ${Math.round(data.length * 0.75 / 1024)} KB.`);
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
        throw new Error(`Gemini HTTP ${response.status}: ${detail.slice(0, 700)}`);
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
        nombre: clean(parsed.nombre) || 'Producto por identificar',
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
      logger.error(`[Gemini Product AI] Falló ${model} en ${Date.now() - attemptStarted} ms: ${message}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(lastError instanceof Error ? lastError.message : 'No se pudo identificar el producto. Intenta con una foto más nítida.');
}

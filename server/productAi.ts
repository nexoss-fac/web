import { GoogleGenAI } from '@google/genai';
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

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error('Servicio de IA no disponible: GEMINI_API_KEY no está configurada.');
  if (!client) client = new GoogleGenAI({ apiKey: key });
  return client;
}

function parseImage(input: string) {
  const match = input.match(/^data:([\w.+-]+\/[\w.+-]+);base64,(.+)$/s);
  return match ? { mimeType: match[1], data: match[2] } : { mimeType: 'image/jpeg', data: input };
}

/** Reconocimiento visual de mercancía, productos terminados, insumos y materias primas. */
export async function analyzeProductImage(
  imageBase64: string,
  userHint = '',
  industry = 'comercio general'
): Promise<ProductAnalysisResult> {
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
  const models = ['gemini-2.5-flash', 'gemini-2.0-flash'];
  let lastError: unknown;
  for (const model of models) {
    try {
      const response = await getClient().models.generateContent({
        model,
        contents: { parts: [{ inlineData: { mimeType: mimeType.startsWith('image/') ? mimeType : 'image/jpeg', data } }, { text: prompt }] },
        config: { responseMimeType: 'application/json', temperature: 0.1 },
      });
      const raw = (response.text || '').replace(/```json\s*/i, '').replace(/```\s*$/i, '').trim();
      const parsed = JSON.parse(raw);
      const clean = (v: unknown) => typeof v === 'string' ? v.trim() : '';
      return {
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
    } catch (error) {
      lastError = error;
      logger.warn(`[Gemini Product AI] Falló ${model}:`, error instanceof Error ? error.message : error);
    }
  }
  throw new Error(lastError instanceof Error ? lastError.message : 'No se pudo identificar el producto. Intenta con una foto más nítida.');
}

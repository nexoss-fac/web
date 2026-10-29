import { GoogleGenAI } from '@google/genai';
import { logger } from './logger.ts';

export interface ShoeAnalysisResult {
  success: boolean;
  marca: string;
  modelo: string;
  nombre: string;
  categoria: string;
  tipo:
    | 'Botines Fútbol Campo'
    | 'Fútbol Campo'
    | 'Micro Tacos'
    | 'Futsala'
    | 'Running'
    | 'Béisbol'
    | 'Béisbol Gancho'
    | 'Deportivo'
    | 'Casual'
    | 'Botas'
    | 'Tacones'
    | 'Sandalias'
    | 'Mocasines'
    | 'Infantil'
    | 'Otros'
    | string;
  genero: 'Caballero' | 'Dama' | 'Unisex' | 'Niño' | 'Niña';
  color: string;
  material: string;
  descripcion_comercial: string;
  copy_social: string;
  hashtags: string[];
  precio_sugerido_usd: number;
  caracteristicas_clave: string[];
  tallas_sugeridas: string[];
  modelo_ia_usado?: string;
  detalles_estilo?: string;
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
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

/**
 * Clean base64 string and extract MIME type
 */
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
 * Analyzes a shoe picture using Google Gemini Vision
 */
export async function analyzeShoeImage(
  imageBase64: string,
  userHint?: string
): Promise<ShoeAnalysisResult> {
  const { data, mimeType } = parseBase64Image(imageBase64);

  if (!data || data.length < 50) {
    throw new Error('La imagen proporcionada no contiene datos válidos.');
  }

  const ai = getGenAI();
  if (!ai) {
    throw new Error('Servicio de IA no disponible: GEMINI_API_KEY no está configurada.');
  }

  const modelsToTry = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'];
  let lastError: any = null;
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const prompt = `Eres el mayor experto en calzado, zapatillas urbanas (sneakers) y autenticación visual para el catálogo de "NEXOSS".
Examina atentamente la fotografía adjunta y analiza cada detalle visual del calzado:
1. SILUETA Y MARCA:
   - Identifica con máxima precisión la silueta o modelo exacto. Revisa logotipos, paneles y costuras distintivas:
     * Nike: Swoosh, perforaciones de puntera, paneles de Dunk Low / High, Air Force 1, siluetas Air Jordan (Jordan 1, 3, 4, 11), Cortez, Air Max 90/97/Plus.
     * Adidas: Tres rayas laterales, trifolio Trefoil, puntera en T de Samba/Gazelle, puntera de concha de Superstar, tiras de Forum Low, silueta ancha acolchada de Campus 00s, Stan Smith.
     * Puma: Formstrip lateral curvado, silueta Suede Classic, Palermo con suela de goma, Slipstream, Mayze.
     * New Balance: Letra 'N' lateral, silueta vintage 550, estilo retro running 530, suela segmentada 9060 o 2002R.
     * Converse: Parche circular de estrella o silueta Chuck Taylor All Star / Chuck 70, suela con puntera de diamante.
     * Vans: Raya lateral Jazz Stripe, suela tipo waffle de Old Skool, Sk8-Hi, Authentic, Era o estampado checkerboard.
     * Asics: Franjas entrecruzadas Tiger Stripes, siluetas Gel-Kayano, Gel-NYC.
     * Reebok: Logotipo vectorial y silueta Club C 85 o Classic Leather.
     * Otras marcas o calzado genérico: Si es bota, mocasín, tacón, sandalia o no tiene marca visible reconocida, indica la marca real visible o "Genérica" / "Marca Local" y describe fielmente su silueta.
2. CLASIFICACIÓN DE TIPO DE CALZADO PARA NEXOSS:
   - "Botines Fútbol Campo": Calzado con tacos altos para césped natural con tobillera o cuello alto/calcetín.
   - "Fútbol Campo": Calzado tradicional de fútbol con tacos / toperoles para césped natural.
   - "Micro Tacos": Calzado con suela multitaco turf o pequeños tacos de goma para césped sintético.
   - "Futsala": Calzado para fútbol sala o indoor con suela lisa o de goma caramelo sin tacos.
   - "Running": Calzado deportivo ligero para correr / trotar con amortiguación y suela ranurada.
   - "Béisbol": Zapatos o spikes para béisbol / softball con tacos de TPU.
   - "Béisbol Gancho": Spikes de béisbol con ganchos o tacos metálicos de tracción.
   - "Casual": Zapatillas urbanas de moda (Dunk, Air Force, Samba, Campus, etc.).
   - "Deportivo": Calzado deportivo de uso general o entrenamiento.
3. COLORWAY REAL:
   - Describe con exactitud los colores reales que ves en la imagen (por ejemplo: "Blanco Triple", "Negro y Blanco (Panda)", "Rojo y Blanco", "Gris con suela crema", etc.).
4. MATERIALES VISIBLES:
   - Cuero liso, gamuza / serraje, lona textil, malla transpirable, suela de goma vulcanizada o entresuela de espuma EVA.

${userHint ? `INFORMACIÓN O PISTA ADICIONAL PROPORCIONADA POR EL USUARIO: "${userHint}". Úsala para afinar el modelo exacto si coincide con lo visible.` : ''}

IMPORTANTE: Responde ÚNICAMENTE con un objeto JSON válido (sin formato markdown \`\`\`json, solo las llaves JSON {...}) con esta estructura:
{
  "marca": "Marca exacta identificada (ej: Nike, Adidas, Jordan, Puma, New Balance, Converse, Vans, Asics, Reebok, o Genérica)",
  "modelo": "Nombre exacto del modelo o silueta (ej: Dunk Low, Air Force 1 07, Samba OG, Campus 00s, Forum Low, 550, Suede Classic, Chuck 70, Old Skool, etc.)",
  "nombre": "Nombre comercial completo y atractivo para NEXOSS que combine marca, modelo y color (ej: Nike Dunk Low Black & White Panda)",
  "categoria": "Calzado",
  "tipo": "Botines Fútbol Campo" | "Fútbol Campo" | "Micro Tacos" | "Futsala" | "Running" | "Béisbol" | "Béisbol Gancho" | "Deportivo" | "Casual" | "Botas" | "Tacones" | "Sandalias" | "Mocasines" | "Infantil",
  "genero": "Unisex" | "Caballero" | "Dama" | "Niño" | "Niña",
  "color": "Colorway visible real (ej: Blanco y Negro, Azul Marino con detalles en Blanco, etc.)",
  "material": "Materiales reales visibles (ej: Cuero sintético suave con puntera reforzada y suela de caucho)",
  "precio_sugerido_usd": 45.00,
  "descripcion_comercial": "Descripción comercial atractiva de 1-2 párrafos para la tienda NEXOSS describiendo la silueta real identificada, su confort, versatilidad para el día a día y estilo urbano.",
  "copy_social": "Texto listo para Instagram/WhatsApp con emojis atractivos, llamado a la acción y mención a NEXOSS.",
  "hashtags": ["#Sneakers", "#ModaUrbana", "#MakdShop", "#ZapatosVenezuela"],
  "caracteristicas_clave": ["Característica 1", "Característica 2", "Característica 3"],
  "tallas_sugeridas": ["38", "39", "40", "41", "42", "43", "44"],
  "detalles_estilo": "Consejo breve de combinación con ropa urbana o casual."
}`;

  for (const model of modelsToTry) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        logger.info(`[Gemini Shoe AI] Analizando imagen de calzado con modelo: ${model} (intento ${attempt})...`);
        const imagePart = {
          inlineData: {
            mimeType: mimeType.includes('png') ? 'image/png' : mimeType.includes('webp') ? 'image/webp' : 'image/jpeg',
            data,
          },
        };
        const textPart = {
          text: prompt,
        };

        const response = await ai.models.generateContent({
          model,
          contents: { parts: [imagePart, textPart] },
          config: {
            responseMimeType: 'application/json',
            temperature: 0.15,
          },
        });

        const rawText = response.text || '';
        logger.info(`[Gemini Shoe AI] Respuesta recibida (${rawText.length} caracteres) con modelo ${model}`);

        // Clean markdown code blocks if any
        const cleaned = rawText
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim();

        const parsed = JSON.parse(cleaned);

        const marca = (parsed.marca && parsed.marca !== 'null') ? parsed.marca.trim() : 'Genérica';
        const modelo = (parsed.modelo && parsed.modelo !== 'null') ? parsed.modelo.trim() : 'Silueta Urbana';
        const nombre = (parsed.nombre && parsed.nombre !== 'null') ? parsed.nombre.trim() : `${marca} ${modelo}`.trim();
        const color = parsed.color || 'Multicolor';

        return {
          success: true,
          marca,
          modelo,
          nombre,
          categoria: 'Calzado',
          tipo: validateTipo(parsed.tipo),
          genero: validateGenero(parsed.genero),
          color,
          material: parsed.material || 'Material sintético con suela vulcanizada',
          descripcion_comercial: parsed.descripcion_comercial || `${nombre}. Calzado en tendencia con excelente amortiguación y estilo urbano para el uso diario en NEXOSS.`,
          copy_social: parsed.copy_social || `🔥 ¡Llegaron los nuevos ${nombre}! 👟 Calidad garantizada. ¡Escríbenos al WhatsApp de NEXOSS para apartar tu talla! 📦🚀`,
          hashtags: Array.isArray(parsed.hashtags) && parsed.hashtags.length > 0 
            ? parsed.hashtags 
            : [`#${marca.replace(/\s+/g, '')}`, '#SneakersVenezuela', '#MakdShop', '#ModaUrbana'],
          precio_sugerido_usd: Number(parsed.precio_sugerido_usd) > 0 ? Number(parsed.precio_sugerido_usd) : 45.0,
          caracteristicas_clave: Array.isArray(parsed.caracteristicas_clave) && parsed.caracteristicas_clave.length > 0 
            ? parsed.caracteristicas_clave 
            : ['Suela antideslizante con agarre firme', 'Plantilla anatómica de alta comodidad', 'Diseño icónico urbano'],
          tallas_sugeridas: Array.isArray(parsed.tallas_sugeridas) && parsed.tallas_sugeridas.length > 0 
            ? parsed.tallas_sugeridas 
            : ['38', '39', '40', '41', '42', '43', '44'],
          modelo_ia_usado: model,
          detalles_estilo: parsed.detalles_estilo || 'Combina excelente con jeans rectos, joggers o bermudas deportivas.',
        };
      } catch (err: any) {
        const errMsg = err?.message || String(err);
        logger.warn(`[Gemini Shoe AI] Falló modelo ${model} (intento ${attempt}):`, errMsg);
        lastError = err;

        const isTransientOverload =
          errMsg.includes('503') ||
          errMsg.includes('high demand') ||
          errMsg.includes('UNAVAILABLE') ||
          errMsg.includes('429') ||
          errMsg.includes('RESOURCE_EXHAUSTED');

        if (isTransientOverload && attempt === 1) {
          logger.info(`[Gemini Shoe AI] Esperando 1.2s antes de reintentar por sobrecarga en ${model}...`);
          await sleep(1200);
          continue;
        }
        break;
      }
    }
  }

  const rawErrMsg = lastError?.message || '';
  let friendlyMsg = 'No se pudo reconocer el calzado con IA.';
  if (rawErrMsg.includes('503') || rawErrMsg.includes('high demand') || rawErrMsg.includes('UNAVAILABLE')) {
    friendlyMsg = 'Los servidores de IA están saturados por alta demanda momentánea. Por favor, pulsa "Reintentar" o ingresa los datos manualmente.';
  } else if (rawErrMsg.includes('429') || rawErrMsg.includes('RESOURCE_EXHAUSTED')) {
    friendlyMsg = 'Límite de solicitudes momentáneo. Espera unos segundos y pulsa "Reintentar".';
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

  logger.error('[Gemini Shoe AI] No se pudo analizar la imagen:', friendlyMsg);
  throw new Error(friendlyMsg);
}

function validateTipo(val: string): any {
  const allowed = [
    'Botines Fútbol Campo',
    'Fútbol Campo',
    'Micro Tacos',
    'Futsala',
    'Running',
    'Béisbol',
    'Béisbol Gancho',
    'Casual',
    'Deportivo',
    'Botas',
    'Tacones',
    'Sandalias',
    'Mocasines',
    'Infantil',
    'Otros',
  ];
  if (allowed.includes(val)) return val;
  const lower = (val || '').toLowerCase();
  if (lower.includes('botin') && (lower.includes('futbol') || lower.includes('campo'))) return 'Botines Fútbol Campo';
  if (lower.includes('micro') || lower.includes('taco')) return 'Micro Tacos';
  if (lower.includes('futsal') || lower.includes('sala')) return 'Futsala';
  if (lower.includes('gancho')) return 'Béisbol Gancho';
  if (lower.includes('beisbol') || lower.includes('baseball')) return 'Béisbol';
  if (lower.includes('futbol') || lower.includes('campo')) return 'Fútbol Campo';
  if (lower.includes('run')) return 'Running';
  if (lower.includes('casual')) return 'Casual';
  return 'Fútbol Campo';
}

function validateGenero(val: string): 'Caballero' | 'Dama' | 'Unisex' | 'Niño' | 'Niña' {
  const allowed = ['Caballero', 'Dama', 'Unisex', 'Niño', 'Niña'];
  return allowed.includes(val) ? (val as any) : 'Unisex';
}

/**
 * Uses Gemini image editing to remove background and place product on pure white studio background
 */
export async function removeBackgroundWithGemini(imageBase64: string): Promise<string | null> {
  const ai = getGenAI();
  if (!ai) return null;

  const { data, mimeType } = parseBase64Image(imageBase64);
  if (!data || data.length < 50) return null;

  try {
    logger.info('[Gemini Background Removal] Intentando remover fondo con gemini-3.1-flash-lite-image...');
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite-image',
      contents: {
        parts: [
          {
            inlineData: {
              data,
              mimeType: mimeType.includes('png') ? 'image/png' : 'image/jpeg',
            },
          },
          {
            text: 'Isolate the shoe/sneaker subject completely from its background. Place the exact same shoe on a clean, solid, pure studio white background (#FFFFFF) with a soft, subtle, natural contact shadow beneath the sole. Keep all colors, logos, laces, details and textures of the shoe completely authentic and unchanged.',
          },
        ],
      },
      config: {
        imageConfig: {
          aspectRatio: '1:1',
        },
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData && part.inlineData.data) {
        const mime = part.inlineData.mimeType || 'image/png';
        logger.info('[Gemini Background Removal] ¡Imagen procesada con éxito por Gemini!');
        return `data:${mime};base64,${part.inlineData.data}`;
      }
    }
  } catch (err: any) {
    logger.warn('[Gemini Background Removal] Falló edición de imagen con Gemini:', err?.message || err);
  }
  return null;
}


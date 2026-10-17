export interface ShoeAiResult {
  success: boolean;
  marca: string;
  modelo: string;
  nombre: string;
  categoria: string;
  tipo: 'Botines Fútbol Campo' | 'Fútbol Campo' | 'Micro Tacos' | 'Futsala' | 'Running' | 'Béisbol' | 'Béisbol Gancho' | 'Deportivo' | 'Casual' | 'Botas' | 'Tacones' | 'Sandalias' | 'Mocasines' | 'Infantil' | 'Otros' | string;
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
  marcaModelo?: string;
  estiloCategoria?: string;
  colores?: string;
  materiales?: string;
  tituloComercial?: string;
  descripcionTienda?: string;
}

/**
 * Compresses an image data URL to a manageable size (< 1200px max dimension)
 * for fast, reliable Gemini multimodal recognition.
 */
export async function optimizeImageForAi(dataUrl: string, maxDim = 1000, quality = 0.85): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      let width = img.naturalWidth || img.width;
      let height = img.naturalHeight || img.height;

      if (width <= maxDim && height <= maxDim) {
        resolve(dataUrl);
        return;
      }

      if (width > height) {
        if (width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        }
      } else {
        if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/**
 * Call server-side Gemini AI to analyze a shoe picture
 */
export async function analyzeShoeWithAi(
  imageBase64: string,
  userHint?: string
): Promise<ShoeAiResult> {
  // Optimize image size first for snappy API response (< 1000px, quality 0.85)
  const optimizedImage = await optimizeImageForAi(imageBase64);

  // Use clean relative endpoints without auth query parameters.
  // In reverse proxies, passing auth query params on POST requests causes 302 redirects to static error pages (HTTP 405).
  const endpoints = ['/api/ai/analyze-shoe', '/api/analyze-shoe', '/api/shoe-ai', '/api/ai/shoe'];
  let lastErrorMsg = '';

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          imageBase64: optimizedImage,
          userHint: userHint?.trim() || undefined,
        }),
      });

      if (!response.ok) {
        let errorDetail = `Error del servidor (${response.status})`;
        try {
          const errData = await response.json();
          if (errData?.error) {
            errorDetail = errData.error;
          }
        } catch {
          // Response was not JSON
        }
        lastErrorMsg = errorDetail;
        console.warn(`[ShoeAiService] ${endpoint} returned ${response.status}:`, errorDetail);
        continue;
      }

      const data = await response.json();
      if (data && (data.marca || data.nombre)) {
        return data as ShoeAiResult;
      } else if (data && data.error) {
        lastErrorMsg = data.error;
      }
    } catch (err: any) {
      lastErrorMsg = err?.message || String(err);
      console.warn(`[ShoeAiService] Network error on ${endpoint}:`, lastErrorMsg);
    }
  }

  // If both endpoints failed, report genuine actionable error instead of returning fake generic sneakers
  throw new Error(
    lastErrorMsg ||
      'No se pudo conectar con el servicio de IA. Verifica tu conexión e intenta enfocar el zapato con buena iluminación.'
  );
}

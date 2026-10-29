import { GoogleGenAI } from '@google/genai';

export interface ScannedFiscalDocument {
  documentType: string; title: string; category: string; issuer: string;
  documentNumber: string; ownerName: string; taxId: string; issueDate: string;
  expiresAt: string; area: string; suggestedRequirement: string;
  confidence: 'alta' | 'media' | 'baja'; notes: string;
}

function parseDocument(input: string) {
  const match = input.match(/^data:(image\/[a-zA-Z0-9.+-]+|application\/pdf);base64,(.+)$/);
  if (match) return { mimeType: match[1].toLowerCase(), data: match[2] };
  return { mimeType: 'image/jpeg', data: input };
}

export async function scanFiscalDocument(imageBase64: string): Promise<ScannedFiscalDocument> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('El escaneo inteligente no está configurado: falta GEMINI_API_KEY en el servidor.');
  const parsedDocument = parseDocument(imageBase64);
  if (!parsedDocument.data || parsedDocument.data.length < 100) throw new Error('El documento no contiene datos suficientes.');
  if (!/^image\/(jpeg|png|webp)$/i.test(parsedDocument.mimeType) && parsedDocument.mimeType !== 'application/pdf') {
    throw new Error('Adjunta un PDF o una imagen JPEG, PNG o WebP.');
  }

  const ai = new GoogleGenAI({ apiKey });
  const prompt = [
    'Analiza este documento fiscal, legal, laboral, municipal o mercantil de Venezuela. Puede ser un PDF multipágina o una imagen.',
    'Extrae solo información claramente visible. No inventes datos: usa cadenas vacías si no se pueden leer.',
    'Clasifica el documento y sugiere el lugar lógico para archivarlo. Devuelve ÚNICAMENTE JSON válido con esta forma:',
    '{"documentType":"RIF|Registro mercantil|Solvencia|Permiso nacional|Declaración|Comprobante de pago|Otro","title":"nombre descriptivo, incluyendo número si es legible","category":"una de esas categorías","issuer":"organismo o emisor","documentNumber":"número de documento/control/registro","ownerName":"nombre o razón social titular","taxId":"RIF o cédula visible","issueDate":"YYYY-MM-DD o cadena vacía","expiresAt":"YYYY-MM-DD o cadena vacía","area":"Tributos nacionales|Municipal (SIGAT / Alcaldía)|Bomberos y seguridad|Laboral y parafiscal|Legal y mercantil|Sanidad y manipulación de alimentos|cadena vacía","suggestedRequirement":"obligación relacionada si se identifica","confidence":"alta|media|baja","notes":"otros datos legibles importantes"}',
    'Distingue fecha de emisión de vencimiento; si no indica vencimiento, expiresAt vacío. No afirmar validez o autenticidad. No adivinar titular ni número.',
  ].join('\n');
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: { parts: [{ inlineData: { mimeType: parsedDocument.mimeType, data: parsedDocument.data } }, { text: prompt }] },
    config: { responseMimeType: 'application/json', temperature: 0.1 },
  });
  const raw = (response.text || '').replace(/^\`\`\`json\s*/i, '').replace(/^\`\`\`\s*/i, '').replace(/\s*\`\`\`$/i, '').trim();
  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(raw); } catch { throw new Error('No se pudo interpretar la respuesta del escáner. Intenta con un documento más legible o una imagen más nítida.'); }
  const allowedCategories = ['RIF', 'Registro mercantil', 'Solvencia', 'Permiso nacional', 'Declaración', 'Comprobante de pago', 'Otro'];
  const allowedAreas = ['Tributos nacionales', 'Municipal (SIGAT / Alcaldía)', 'Bomberos y seguridad', 'Laboral y parafiscal', 'Legal y mercantil', 'Sanidad y manipulación de alimentos'];
  const value = (key: string) => typeof parsed[key] === 'string' ? String(parsed[key]).trim().slice(0, 500) : '';
  const date = (key: string) => /^\d{4}-\d{2}-\d{2}$/.test(value(key)) ? value(key) : '';
  const category = value('category') || value('documentType');
  const confidence = value('confidence');
  return {
    documentType: value('documentType') || 'Otro', title: value('title') || value('documentType') || 'Documento identificado',
    category: allowedCategories.includes(category) ? category : 'Otro', issuer: value('issuer'),
    documentNumber: value('documentNumber'), ownerName: value('ownerName'), taxId: value('taxId'),
    issueDate: date('issueDate'), expiresAt: date('expiresAt'),
    area: allowedAreas.includes(value('area')) ? value('area') : '',
    suggestedRequirement: value('suggestedRequirement'),
    confidence: confidence === 'alta' || confidence === 'media' ? confidence : 'baja', notes: value('notes'),
  };
}

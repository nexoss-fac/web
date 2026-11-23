import { GoogleGenAI } from '@google/genai';

export type NexossAiMessage = { role: 'user' | 'assistant'; content: string; imageDataUrl?: string };
export type NexossAiResult = { text: string; provider: 'gemini' | 'ollama'; model: string };

const MAX_HISTORY = 12;
const MAX_MESSAGE = 4000;
const MAX_IMAGE_DATA_URL = 5 * 1024 * 1024;
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function configuredProvider(): 'gemini' | 'ollama' | 'auto' {
  const value = (process.env.NEXOSS_AI_PROVIDER || 'auto').trim().toLowerCase();
  return value === 'gemini' || value === 'ollama' ? value : 'auto';
}

function chooseProvider(): 'gemini' | 'ollama' {
  const selected = configuredProvider();
  if (selected === 'gemini') {
    if (!process.env.GEMINI_API_KEY?.trim()) throw new Error('El proveedor Gemini está seleccionado, pero falta GEMINI_API_KEY.');
    return 'gemini';
  }
  if (selected === 'ollama') {
    if (!process.env.OLLAMA_BASE_URL?.trim()) throw new Error('Ollama está seleccionado, pero falta OLLAMA_BASE_URL.');
    return 'ollama';
  }
  if (process.env.GEMINI_API_KEY?.trim()) return 'gemini';
  if (process.env.OLLAMA_BASE_URL?.trim()) return 'ollama';
  throw new Error('NEXOSS AI no está configurado. Define GEMINI_API_KEY o OLLAMA_BASE_URL y el modelo correspondiente.');
}

function parseImageDataUrl(value: string) {
  if (value.length > MAX_IMAGE_DATA_URL) throw new Error('La imagen supera el límite de 5 MB.');
  const match = value.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match || !IMAGE_MIME_TYPES.has(match[1])) throw new Error('Formato de imagen no permitido. Usa JPG, PNG o WebP.');
  return { mimeType: match[1], data: match[2] };
}

function systemPrompt(companyName: string, role: string, industry: string): string {
  return [
    'Eres NEXOSS AI, asistente operativo de una plataforma de gestión empresarial multiempresa.',
    'Responde en español claro y conciso.',
    'Puedes analizar imágenes adjuntas para describir productos y preparar borradores de fichas. Distingue hechos visibles de inferencias y marca como desconocido todo dato no verificable.',
    'No inventes precios, costos, códigos, datos fiscales, cantidades, inventario ni información de la empresa. Nunca deduzcas un precio comercial solo por la fotografía.',
    'No tienes acceso directo a registros comerciales ni herramientas de escritura. No afirmes que has creado productos, modificado inventario, emitido facturas, cobrado ni cambiado datos.',
    'Si te piden ejecutar una operación, prepara los datos y explica que requiere revisión y confirmación en el módulo correspondiente.',
    'No solicites ni reveles contraseñas, tokens, claves API ni secretos.',
    'Respeta siempre el aislamiento de la empresa y los permisos del usuario. No intentes acceder a otra empresa.',
    `Empresa activa: ${companyName || 'No identificada'}.`,
    `Sector: ${industry || 'No especificado'}.`,
    `Rol del usuario: ${role || 'miembro'}.`,
  ].join('\n');
}

export async function askNexossAi(input: {
  companyName: string;
  role: string;
  industry: string;
  messages: NexossAiMessage[];
}): Promise<NexossAiResult> {
  const provider = chooseProvider();
  const messages = input.messages.slice(-MAX_HISTORY).map((message) => ({
    role: message.role,
    content: String(message.content || '').trim().slice(0, MAX_MESSAGE),
    ...(message.imageDataUrl ? { image: parseImageDataUrl(message.imageDataUrl) } : {}),
  })).filter((message) => message.content || message.image);
  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    throw new Error('Escribe un mensaje para iniciar la conversación.');
  }
  const system = systemPrompt(input.companyName, input.role, input.industry);

  if (provider === 'gemini') {
    const model = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY!.trim() });
    const contents = messages.map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [
        ...(message.content ? [{ text: message.content }] : []),
        ...(message.image ? [{ inlineData: { mimeType: message.image.mimeType, data: message.image.data } }] : []),
      ],
    }));
    const response = await ai.models.generateContent({
      model,
      contents,
      config: { systemInstruction: system, temperature: 0.3, maxOutputTokens: 1400 },
    });
    const text = response.text?.trim();
    if (!text) throw new Error('El proveedor de IA no devolvió una respuesta.');
    return { text, provider, model };
  }

  const baseUrl = process.env.OLLAMA_BASE_URL!.trim().replace(/\/+$/, '');
  const model = process.env.OLLAMA_MODEL?.trim() || 'qwen2.5:7b';
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(60000),
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        { role: 'system', content: system },
        ...messages.map((message) => ({
          role: message.role,
          content: message.content,
          ...(message.image ? { images: [message.image.data] } : {}),
        })),
      ],
    }),
  });
  if (!response.ok) throw new Error(`Ollama respondió con HTTP ${response.status}. Verifica el servicio y el modelo configurado.`);
  const payload = await response.json() as { message?: { content?: string } };
  const text = payload.message?.content?.trim();
  if (!text) throw new Error('Ollama no devolvió una respuesta.');
  return { text, provider, model };
}

export function getNexossAiStatus() {
  const selected = configuredProvider();
  const geminiReady = Boolean(process.env.GEMINI_API_KEY?.trim());
  const ollamaReady = Boolean(process.env.OLLAMA_BASE_URL?.trim());
  const active = selected === 'auto' ? (geminiReady ? 'gemini' : ollamaReady ? 'ollama' : null) : selected;
  const ready = active === 'gemini' ? geminiReady : active === 'ollama' ? ollamaReady : false;
  return {
    ready,
    provider: ready ? active : null,
    mode: selected,
    model: active === 'gemini'
      ? process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash'
      : active === 'ollama' ? process.env.OLLAMA_MODEL?.trim() || 'qwen2.5:7b' : null,
    availableProviders: [
      ...(geminiReady ? ['gemini'] : []),
      ...(ollamaReady ? ['ollama'] : []),
    ],
    vision: ready,
  };
}

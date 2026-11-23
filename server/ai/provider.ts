import { GoogleGenAI } from '@google/genai';

export type NexossAiMessage = { role: 'user' | 'assistant'; content: string };
export type NexossAiResult = { text: string; provider: 'gemini' | 'ollama'; model: string };

const MAX_HISTORY = 12;
const MAX_MESSAGE = 4000;

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

function systemPrompt(companyName: string, role: string): string {
  return [
    'Eres NEXOSS AI, asistente operativo de una plataforma de gestión empresarial multiempresa.',
    'Responde en español claro y conciso.',
    'En esta primera versión solo puedes conversar, orientar y preparar borradores. No afirmes que has creado productos, modificado inventario, emitido facturas, cobrado ni cambiado datos: no tienes herramientas de escritura habilitadas.',
    'No inventes precios, costos, códigos, datos fiscales ni información de la empresa. Distingue los datos proporcionados por el usuario de las sugerencias.',
    'Si te piden ejecutar una operación, prepara los datos y explica que requiere revisión y confirmación en el módulo correspondiente.',
    'No solicites ni reveles contraseñas, tokens, claves API ni secretos.',
    'Respeta siempre el aislamiento de la empresa y los permisos del usuario.',
    `Empresa activa: ${companyName || 'No identificada'}.`,
    `Rol del usuario: ${role || 'miembro'}.`,
  ].join('\n');
}

export async function askNexossAi(input: {
  companyName: string;
  role: string;
  messages: NexossAiMessage[];
}): Promise<NexossAiResult> {
  const provider = chooseProvider();
  const messages = input.messages.slice(-MAX_HISTORY).map((message) => ({
    role: message.role,
    content: String(message.content || '').trim().slice(0, MAX_MESSAGE),
  })).filter((message) => message.content);
  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    throw new Error('Escribe un mensaje para iniciar la conversación.');
  }
  const system = systemPrompt(input.companyName, input.role);

  if (provider === 'gemini') {
    const model = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY!.trim() });
    const contents = messages.map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    }));
    const response = await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: system }] }, ...contents],
      config: { temperature: 0.3, maxOutputTokens: 1200 },
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
        ...messages.map((message) => ({ role: message.role, content: message.content })),
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
  };
}

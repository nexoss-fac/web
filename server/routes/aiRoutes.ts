import type { Express, Request, RequestHandler, Response } from 'express';
import { askNexossAi, getNexossAiStatus, type NexossAiMessage } from '../ai/provider.ts';
import { tenantStorageContext } from '../multiempresa/companyAccess.ts';
import { logger } from '../logger.ts';

const MAX_IMAGE_DATA_URL = 5 * 1024 * 1024;

export function registerNexossAiRoutes(app: Express, memberOnly: RequestHandler): void {
  app.get('/api/ai/status', memberOnly, (_req, res) => {
    return res.json(getNexossAiStatus());
  });

  app.post('/api/ai/chat', memberOnly, async (req: Request, res: Response) => {
    const tenant = tenantStorageContext.getStore();
    if (!tenant?.companyId || !tenant.uid) {
      return res.status(403).json({ error: 'Selecciona una empresa antes de conversar con NEXOSS AI.' });
    }
    const rawMessages = req.body?.messages;
    if (!Array.isArray(rawMessages) || rawMessages.length > 12) {
      return res.status(400).json({ error: 'La conversación no tiene un formato válido.' });
    }
    const messages: NexossAiMessage[] = rawMessages.map((item: any) => ({
      role: item?.role === 'assistant' ? 'assistant' : 'user',
      content: typeof item?.content === 'string' ? item.content : '',
      ...(typeof item?.imageDataUrl === 'string' ? { imageDataUrl: item.imageDataUrl } : {}),
    }));
    if (messages.some((item) => item.content.length > 4000)) {
      return res.status(413).json({ error: 'Cada mensaje admite un máximo de 4.000 caracteres.' });
    }
    if (messages.some((item) => (item.imageDataUrl?.length || 0) > MAX_IMAGE_DATA_URL)) {
      return res.status(413).json({ error: 'Cada imagen admite un máximo de 5 MB.' });
    }
    if (messages.filter((item) => item.imageDataUrl).length > 2) {
      return res.status(400).json({ error: 'Adjunta como máximo 2 imágenes por conversación.' });
    }
    try {
      const result = await askNexossAi({
        companyName: 'Empresa activa autorizada',
        role: tenant.role,
        industry: tenant.industryTemplate,
        messages,
      });
      return res.json({ success: true, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo completar la consulta de IA.';
      logger.warn('[NEXOSS AI] No se pudo responder:', { companyId: tenant.companyId, message });
      const unavailable = /no está configurado|falta .*KEY|falta OLLAMA|HTTP 5\d\d|fetch failed|timeout/i.test(message);
      return res.status(unavailable ? 503 : 400).json({ success: false, error: message });
    }
  });
}

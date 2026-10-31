import type { Express, Request, Response, RequestHandler } from 'express';
import { analyzePurchaseInvoice } from '../purchaseInvoiceAi.ts';
import { commitPurchaseInvoice } from '../purchases/commitPurchaseInvoice.ts';
import { tenantStorageContext } from '../multiempresa/companyAccess.ts';
import { logger } from '../logger.ts';

export function registerPurchaseInvoiceRoutes(app: Express, adminOnly: RequestHandler): void {
  app.post('/api/purchases/scan-invoice', adminOnly, async (req: Request, res: Response) => {
    try {
      const { documentBase64 } = req.body || {};
      if (typeof documentBase64 !== 'string' || documentBase64.length < 50) {
        return res.status(400).json({ success: false, error: 'Adjunta una fotografía o PDF de la factura.' });
      }
      const tenant = tenantStorageContext.getStore();
      if (!tenant?.companyId) {
        return res.status(403).json({ success: false, error: 'No hay una empresa activa autorizada para esta operación.' });
      }
      const draft = await analyzePurchaseInvoice(documentBase64, tenant.industryTemplate || 'comercio general');
      return res.json({ success: true, draft, persisted: false, requiresReview: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('[Purchase invoice scan] No se pudo analizar el documento:', message);
      const retryable = /503|high demand|UNAVAILABLE|429|RESOURCE_EXHAUSTED|fetch failed|ECONNRESET|ETIMEDOUT|timeout|socket|network/i.test(message);
      if (retryable) res.setHeader('Retry-After', '3');
      return res.status(retryable ? 503 : 400).json({
        success: false,
        error: retryable ? 'El servicio de IA está temporalmente ocupado. Conserva el documento y vuelve a intentarlo.' : message,
        retryable,
      });
    }
  });

  app.post('/api/purchases/confirm', adminOnly, async (req: Request, res: Response) => {
    try {
      const tenant = tenantStorageContext.getStore();
      if (!tenant?.companyId || !tenant.uid) {
        return res.status(403).json({ success: false, error: 'No hay una empresa activa autorizada para esta operación.' });
      }
      const { draft, mappings, exchangeRate } = req.body || {};
      if (!draft || !Array.isArray(mappings)) {
        return res.status(400).json({ success: false, error: 'Faltan la factura revisada y sus relaciones con el inventario.' });
      }
      const result = await commitPurchaseInvoice({
        draft,
        mappings,
        exchangeRate: Number(exchangeRate),
        userId: tenant.uid,
      });
      return res.status(201).json({ success: true, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('[Purchase invoice confirm] No se pudo confirmar la compra:', message);
      const duplicate = /ya fue registrada/.test(message);
      const conflict = /inventario cambió durante/.test(message);
      return res.status(duplicate ? 409 : conflict ? 409 : 400).json({
        success: false,
        error: message || 'No se pudo confirmar la factura de compra.',
        duplicate,
      });
    }
  });
}

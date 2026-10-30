import type { Express, Request, Response } from 'express';
import { analyzePurchaseInvoice } from '../purchaseInvoiceAi.ts';
import { tenantStorageContext } from '../multiempresa/companyAccess.ts';
import { logger } from '../logger.ts';

/** Endpoint de solo lectura: extrae una factura y devuelve un borrador; no crea gastos ni mueve stock. */
export function registerPurchaseInvoiceRoutes(app: Express): void {
  app.post('/api/purchases/scan-invoice', async (req: Request, res: Response) => {
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
}

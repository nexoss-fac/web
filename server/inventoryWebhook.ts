import { getNeonSql, normalizeProducts } from './db.js';
import { logger } from './logger.ts';

// URL del webhook de sincronización de inventario con la página de venta (estudiogoogleai)
const WEBHOOK_URL =
  '';

// El appletId identifica a esta tienda ante el servicio de sincronización.
// Se puede sobreescribir con una variable de entorno sin tocar el código.
const APPLET_ID = 'nexoss-local-demo';

interface WebhookProduct {
  title: string;
  stock: number;
  precio: number;
  tallas: number[];
}

// Agrupa las filas de shoe_products (una fila por talla) en un solo
// producto por modelo/color, tal como lo espera el webhook.
function groupProductsForWebhook(rows: any[]): WebhookProduct[] {
  const groups = new Map<string, WebhookProduct>();

  for (const p of rows) {
    const title = [p.nombre, p.marca, p.color].filter(Boolean).join(' - ') || p.nombre || p.sku;
    const talla = Number(p.talla);
    const stock = Number(p.stock) || 0;

    if (!groups.has(title)) {
      groups.set(title, { title, stock: 0, precio: Number(p.precio) || 0, tallas: [] });
    }
    const g = groups.get(title)!;
    g.stock += stock;
    if (!Number.isNaN(talla) && !g.tallas.includes(talla)) {
      g.tallas.push(talla);
    }
  }

  for (const g of groups.values()) {
    g.tallas.sort((a, b) => a - b);
  }

  return Array.from(groups.values());
}

// Envía el catálogo completo (o un subconjunto) al webhook. Nunca lanza:
// registra el error en consola para no romper la petición original del admin.
export async function notifyInventoryWebhook(rows?: any[]): Promise<void> {
  if (!WEBHOOK_URL) return;
  try {
    let products = rows;

    // Si no se pasan filas explícitas, se toma el estado actual completo de la BD.
    if (!products) {
      const sql = getNeonSql();
      if (!sql) return;
      const dbRows = await sql`SELECT * FROM shoe_products ORDER BY nombre ASC`;
      products = normalizeProducts(dbRows as any[]);
    }

    const payload = {
      appletId: APPLET_ID,
      products: groupProductsForWebhook(products),
    };

    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      logger.error('inventoryWebhook: respuesta no OK', res.status, await res.text());
    }
  } catch (err) {
    logger.error('inventoryWebhook: error al notificar', err);
  }
}

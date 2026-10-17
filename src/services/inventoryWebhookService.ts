import { ShoeProduct } from '../types';

export const DEFAULT_APPLET_ID = 'nexoss-local-demo';
export const DEFAULT_WEBHOOK_URL = '';

const STORAGE_SETTINGS_KEY = 'nexoss_inventory_webhook_settings';
const STORAGE_LOG_KEY = 'nexoss_inventory_webhook_last_log';

export interface WebhookProductItem {
  title: string;
  stock: number;
  precio: number;
  tallas: (number | string)[];
}

export interface WebhookPayload {
  appletId: string;
  products: WebhookProductItem[];
}

export interface WebhookSettings {
  url: string;
  appletId: string;
  enabled: boolean;
}

export interface WebhookSyncResult {
  success: boolean;
  timestamp: string;
  productsCount: number;
  statusCode?: number;
  message?: string;
  error?: string;
  payload?: WebhookPayload;
}

/**
 * Loads webhook configuration from localStorage or defaults
 */
export function getWebhookSettings(): WebhookSettings {
  try {
    const raw = localStorage.getItem(STORAGE_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        url: parsed.url || DEFAULT_WEBHOOK_URL,
        appletId: parsed.appletId || DEFAULT_APPLET_ID,
        enabled: parsed.enabled !== undefined ? Boolean(parsed.enabled) : false,
      };
    }
  } catch (e) {
    console.error('Error reading webhook settings:', e);
  }
  return {
    url: DEFAULT_WEBHOOK_URL,
    appletId: DEFAULT_APPLET_ID,
    enabled: false,
  };
}

/**
 * Saves webhook configuration to localStorage
 */
export function saveWebhookSettings(settings: Partial<WebhookSettings>): WebhookSettings {
  const current = getWebhookSettings();
  const next: WebhookSettings = {
    ...current,
    ...settings,
  };
  try {
    localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(next));
  } catch (e) {
    console.error('Error saving webhook settings:', e);
  }
  return next;
}

/**
 * Retrieves the last execution log
 */
export function getLastWebhookLog(): WebhookSyncResult | null {
  try {
    const raw = localStorage.getItem(STORAGE_LOG_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return null;
}

/**
 * Saves the last execution log
 */
export function saveLastWebhookLog(log: WebhookSyncResult): void {
  try {
    localStorage.setItem(STORAGE_LOG_KEY, JSON.stringify(log));
  } catch (e) {}
}

/**
 * Transforms an array of ShoeProduct items into the exact payload requested:
 * Grouping products by title, summing stocks, preserving prices, and listing tallas
 */
export function formatProductsForWebhook(products: ShoeProduct[]): WebhookProductItem[] {
  const activeProducts = (products || []).filter((p) => p && p.activo !== false);
  const groupMap = new Map<
    string,
    {
      title: string;
      stock: number;
      precio: number;
      tallasSet: Set<number | string>;
    }
  >();

  for (const p of activeProducts) {
    const title = (p.nombre || 'Calzado').trim();
    const key = title.toLowerCase();

    // Extract all sizes (supports "39, 40, 41" or single "39")
    const rawSizes: (string | number)[] = [];
    if (Array.isArray((p as any).tallas)) {
      rawSizes.push(...(p as any).tallas);
    } else if (typeof p.talla === 'string') {
      p.talla.split(',').forEach((s) => rawSizes.push(s.trim()));
    } else if (p.talla != null) {
      rawSizes.push(p.talla);
    }

    const parsedSizes = rawSizes
      .map((s) => {
        const str = String(s).trim();
        const num = Number(str);
        return !isNaN(num) && str !== '' ? num : str;
      })
      .filter((s) => s !== '');

    const stockNum = Number(p.stock) || 0;
    const priceNum = Number(p.precio) || 0;

    if (!groupMap.has(key)) {
      groupMap.set(key, {
        title,
        stock: stockNum,
        precio: priceNum,
        tallasSet: new Set(parsedSizes),
      });
    } else {
      const existing = groupMap.get(key)!;
      existing.stock += stockNum;
      if (priceNum > 0) existing.precio = priceNum;
      parsedSizes.forEach((s) => existing.tallasSet.add(s));
    }
  }

  return Array.from(groupMap.values()).map((g) => {
    const tallas = Array.from(g.tallasSet).sort((a, b) => {
      const numA = Number(a);
      const numB = Number(b);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return String(a).localeCompare(String(b));
    });

    return {
      title: g.title,
      stock: g.stock,
      precio: g.precio,
      tallas,
    };
  });
}

/**
 * Builds the complete WebhookPayload object
 */
export function buildWebhookPayload(
  products: ShoeProduct[],
  appletId = DEFAULT_APPLET_ID
): WebhookPayload {
  return {
    appletId,
    products: formatProductsForWebhook(products),
  };
}

/**
 * Dispatches the webhook to the configured destination URL:
 * 1. Executes via our server backend route `/api/inventory/webhook/trigger`
 * 2. Also attempts direct browser dispatch for low latency
 */
export async function sendInventoryWebhook(
  products: ShoeProduct[],
  options?: {
    force?: boolean;
    url?: string;
    appletId?: string;
  }
): Promise<WebhookSyncResult> {
  if (import.meta.env.VITE_NEXOSS_LOCAL_ONLY === 'true') {
    return {
      success: false,
      timestamp: new Date().toISOString(),
      productsCount: 0,
      message: 'Las integraciones externas están desactivadas en el modo local aislado.',
    };
  }
  const settings = getWebhookSettings();
  if (!settings.enabled && !options?.force) {
    return {
      success: false,
      timestamp: new Date().toISOString(),
      productsCount: 0,
      message: 'El webhook de inventario está desactivado en la configuración.',
    };
  }

  const targetUrl = options?.url || settings.url || DEFAULT_WEBHOOK_URL;
  const appletId = options?.appletId || settings.appletId || DEFAULT_APPLET_ID;
  if (!targetUrl || !settings.enabled) {
    return {
      success: false,
      timestamp: new Date().toISOString(),
      productsCount: 0,
      message: 'Las integraciones externas están desactivadas en este proyecto local.',
    };
  }
  const payload = buildWebhookPayload(products, appletId);

  const timestamp = new Date().toISOString();

  // Try server proxy first to bypass browser CORS / preflight
  try {
    const serverResp = await fetch('/api/inventory/webhook/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: targetUrl,
        appletId,
        products,
      }),
    });

    const data = await serverResp.json().catch(() => ({}));
    if (serverResp.ok && data.success) {
      const result: WebhookSyncResult = {
        success: true,
        timestamp,
        productsCount: payload.products.length,
        statusCode: data.statusCode || 200,
        message: `Sincronización webhook exitosa (${payload.products.length} modelos agrupados).`,
        payload,
      };
      saveLastWebhookLog(result);
      return result;
    }
  } catch (err) {
    console.warn('Backend webhook proxy notice:', err);
  }

  // Fallback: direct browser fetch
  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result: WebhookSyncResult = {
      success: res.ok,
      timestamp,
      productsCount: payload.products.length,
      statusCode: res.status,
      message: res.ok
        ? `Sincronización enviada con éxito (${payload.products.length} modelos de calzado).`
        : `Respuesta HTTP ${res.status} desde el webhook.`,
      payload,
    };
    saveLastWebhookLog(result);
    return result;
  } catch (err: any) {
    const result: WebhookSyncResult = {
      success: false,
      timestamp,
      productsCount: payload.products.length,
      error: err?.message || 'Error de conexión con el webhook externo',
      message: 'No se pudo conectar directamente con el webhook',
      payload,
    };
    saveLastWebhookLog(result);
    return result;
  }
}

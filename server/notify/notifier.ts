/**
 * Avisos al teléfono cuando se registra una venta o un gasto.
 * Es saliente: el servidor llama a Telegram o a ntfy por HTTPS, así que funciona aunque NEXOSS
 * corra solo en tu computadora (no hace falta que el teléfono pueda abrir la aplicación).
 * Un fallo al avisar nunca debe impedir que se guarde la venta o el gasto.
 */
export type NoticeKind = 'sale' | 'expense';

export interface Notice {
  kind: NoticeKind;
  title: string;
  body: string;
}

export interface NotifyConfig {
  telegram?: { botToken: string; chatId: string };
  ntfy?: { server: string; topic: string; token?: string };
  events: NoticeKind[];
}

export interface NotifyResult {
  channel: 'telegram' | 'ntfy';
  sent: boolean;
  error?: string;
}

type Env = Record<string, string | undefined>;

export function readNotifyConfig(env: Env = process.env): NotifyConfig {
  const botToken = (env.NOTIFY_TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = (env.NOTIFY_TELEGRAM_CHAT_ID || '').trim();
  const topic = (env.NOTIFY_NTFY_TOPIC || '').trim();
  const requested = (env.NOTIFY_EVENTS || 'sale,expense').split(',').map((item) => item.trim().toLowerCase());
  const events = (['sale', 'expense'] as const).filter((kind) => requested.includes(kind));
  return {
    ...(botToken && chatId ? { telegram: { botToken, chatId } } : {}),
    ...(topic ? { ntfy: { server: (env.NOTIFY_NTFY_SERVER || 'https://ntfy.sh').trim().replace(/\/+$/, ''), topic, ...(env.NOTIFY_NTFY_TOKEN ? { token: env.NOTIFY_NTFY_TOKEN.trim() } : {}) } } : {}),
    events,
  };
}

export const hasNotifyChannel = (config: NotifyConfig) => Boolean(config.telegram || config.ntfy);

const safeMessage = (error: unknown) => (error instanceof Error ? error.message : 'error desconocido').slice(0, 200);

export async function sendNotice(notice: Notice, config: NotifyConfig = readNotifyConfig(), doFetch: typeof fetch = fetch): Promise<NotifyResult[]> {
  if (!config.events.includes(notice.kind)) return [];
  const results: NotifyResult[] = [];

  if (config.telegram) {
    try {
      const response = await doFetch(`https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: config.telegram.chatId, text: `${notice.title}\n${notice.body}`, disable_web_page_preview: true }),
        signal: AbortSignal.timeout(8000),
      });
      results.push({ channel: 'telegram', sent: response.ok, ...(response.ok ? {} : { error: `Telegram respondió ${response.status}` }) });
    } catch (error) {
      // El mensaje de error de red puede incluir la URL con el token: no se devuelve tal cual.
      results.push({ channel: 'telegram', sent: false, error: safeMessage(error).replace(config.telegram.botToken, '***') });
    }
  }

  if (config.ntfy) {
    try {
      const response = await doFetch(config.ntfy.server, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(config.ntfy.token ? { Authorization: `Bearer ${config.ntfy.token}` } : {}) },
        body: JSON.stringify({ topic: config.ntfy.topic, title: notice.title, message: notice.body, tags: [notice.kind === 'sale' ? 'moneybag' : 'receipt'], priority: 3 }),
        signal: AbortSignal.timeout(8000),
      });
      results.push({ channel: 'ntfy', sent: response.ok, ...(response.ok ? {} : { error: `ntfy respondió ${response.status}` }) });
    } catch (error) {
      results.push({ channel: 'ntfy', sent: false, error: safeMessage(error) });
    }
  }
  return results;
}

const usd = (value: unknown) => `$${(Number(value) || 0).toFixed(2)}`;
const bs = (value: unknown) => `Bs ${(Number(value) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const clip = (value: unknown, max = 80) => String(value ?? '').trim().slice(0, max);

/** Solo datos útiles para el dueño: no incluye RIF, teléfono ni correo del cliente. */
export function buildSaleNotice(sale: Record<string, any>, company = ''): Notice {
  const client = [sale.cliente_nombre, sale.cliente_apellido].map((part) => clip(part, 40)).filter(Boolean).join(' ');
  const accounts = Array.isArray(sale.pagos) ? [...new Set(sale.pagos.map((pago: any) => clip(pago?.cuenta, 30)).filter(Boolean))] : [];
  const items = Array.isArray(sale.items) ? sale.items.reduce((sum: number, item: any) => sum + (Number(item?.cantidad) || 0), 0) : 0;
  const lines = [
    `Factura ${clip(sale.numero_factura, 30) || 's/n'}${client ? ` · ${client}` : ''}`,
    `Total: ${usd(sale.total_usd)} (${bs(sale.total_bs)})`,
    items ? `Artículos: ${items}` : '',
    accounts.length ? `Cobro: ${accounts.join(', ')}` : '',
    sale.usuario ? `Registró: ${clip(sale.usuario, 40)}` : '',
  ].filter(Boolean);
  return { kind: 'sale', title: `Venta registrada${company ? ` · ${clip(company, 40)}` : ''}`, body: lines.join('\n') };
}

export function buildExpenseNotice(expense: Record<string, any>, company = ''): Notice {
  const lines = [
    `${clip(expense.categoria, 50) || 'Gasto'}: ${usd(expense.monto_usd)} (${bs(expense.monto_bs)})`,
    expense.descripcion ? clip(expense.descripcion, 100) : '',
    expense.beneficiario ? `Beneficiario: ${clip(expense.beneficiario, 60)}` : '',
    expense.cuenta_origen ? `Pagado con: ${clip(expense.cuenta_origen, 40)}` : '',
    expense.registrado_por ? `Registró: ${clip(expense.registrado_por, 40)}` : '',
  ].filter(Boolean);
  return { kind: 'expense', title: `Gasto registrado${company ? ` · ${clip(company, 40)}` : ''}`, body: lines.join('\n') };
}

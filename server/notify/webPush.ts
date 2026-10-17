import type { NeonQueryFunction } from '@neondatabase/serverless';
import { logger } from '../logger.ts';

type Sql = NeonQueryFunction<false, false>;
type PushSubscriptionRecord = { id: string; uid: string; subscription: { endpoint: string; keys: { p256dh: string; auth: string } } };

function publicKey() { return (process.env.WEB_PUSH_VAPID_PUBLIC_KEY || '').trim(); }
function privateKey() { return (process.env.WEB_PUSH_VAPID_PRIVATE_KEY || '').trim(); }
function subject() { return (process.env.WEB_PUSH_VAPID_SUBJECT || '').trim(); }

export function isWebPushConfigured() {
  return Boolean(publicKey() && privateKey() && subject());
}

async function getWebPush() {
  const mod = await import('web-push');
  const webPush: any = (mod as any).default || mod;
  if (!isWebPushConfigured()) throw new Error('Web Push no está configurado en el servidor.');
  webPush.setVapidDetails(subject(), publicKey(), privateKey());
  return webPush;
}

async function ensureTable(sql: Sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS nexoss_web_push_subscriptions (
      id TEXT PRIMARY KEY,
      uid TEXT NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      subscription JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

export async function saveWebPushSubscription(sql: Sql, uid: string, subscription: any) {
  if (!uid || !subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    throw new Error('La suscripción push no tiene un formato válido.');
  }
  await ensureTable(sql);
  await sql`
    INSERT INTO nexoss_web_push_subscriptions (id, uid, endpoint, subscription)
    VALUES (${crypto.randomUUID()}, ${uid}, ${subscription.endpoint}, ${JSON.stringify(subscription)}::jsonb)
    ON CONFLICT (endpoint) DO UPDATE SET
      uid = EXCLUDED.uid,
      subscription = EXCLUDED.subscription,
      updated_at = NOW()
  `;
}

export async function removeWebPushSubscription(sql: Sql, uid: string, endpoint: string) {
  await ensureTable(sql);
  await sql`DELETE FROM nexoss_web_push_subscriptions WHERE uid = ${uid} AND endpoint = ${endpoint}`;
}

export async function sendWebPushToCompanyAdmins(sql: Sql, payload: { title: string; body: string; url?: string }) {
  if (!isWebPushConfigured()) return;
  await ensureTable(sql);
  const rows = await sql`SELECT id, uid, subscription FROM nexoss_web_push_subscriptions`;
  if (!rows.length) return;
  const webPush = await getWebPush();
  const message = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || '/?tab=admin',
    tag: 'nexoss-business-alert',
  });
  await Promise.all((rows as any[]).map(async (row) => {
    try {
      await webPush.sendNotification(row.subscription, message, { TTL: 60 * 60 });
    } catch (error: any) {
      const status = Number(error?.statusCode);
      if (status === 404 || status === 410) {
        await sql`DELETE FROM nexoss_web_push_subscriptions WHERE id = ${row.id}`;
      } else {
        logger.warn('[Web Push] No se pudo entregar una notificación:', status || 'error');
      }
    }
  }));
}

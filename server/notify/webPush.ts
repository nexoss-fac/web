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
      role TEXT NOT NULL DEFAULT 'admin',
      endpoint TEXT NOT NULL UNIQUE,
      subscription JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`ALTER TABLE nexoss_web_push_subscriptions ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'admin'`;
}

export async function saveWebPushSubscription(sql: Sql, uid: string, subscription: any, role = 'admin') {
  if (!uid || !subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    throw new Error('La suscripción push no tiene un formato válido.');
  }
  await ensureTable(sql);
  await sql`
    INSERT INTO nexoss_web_push_subscriptions (id, uid, role, endpoint, subscription)
    VALUES (${crypto.randomUUID()}, ${uid}, ${role}, ${subscription.endpoint}, ${JSON.stringify(subscription)}::jsonb)
    ON CONFLICT (endpoint) DO UPDATE SET
      uid = EXCLUDED.uid,
      role = EXCLUDED.role,
      subscription = EXCLUDED.subscription,
      updated_at = NOW()
  `;
}

export async function removeWebPushSubscription(sql: Sql, uid: string, endpoint: string) {
  await ensureTable(sql);
  await sql`DELETE FROM nexoss_web_push_subscriptions WHERE uid = ${uid} AND endpoint = ${endpoint}`;
}

export async function hasWebPushSubscription(sql: Sql, uid: string) {
  await ensureTable(sql);
  const rows = await sql`SELECT 1 AS active FROM nexoss_web_push_subscriptions WHERE uid = ${uid} LIMIT 1`;
  return rows.length > 0;
}

export async function sendWebPushTest(sql: Sql, uid: string) {
  if (!isWebPushConfigured()) throw new Error('Web Push no está configurado en el servidor.');
  await ensureTable(sql);
  const rows = await sql`SELECT id, subscription FROM nexoss_web_push_subscriptions WHERE uid = ${uid}`;
  if (!rows.length) return false;
  const webPush = await getWebPush();
  const message = JSON.stringify({ title: 'NEXOSS · Notificación de prueba', body: 'Este dispositivo está conectado y puede recibir avisos de ventas y gastos.', url: '/?tab=admin', tag: 'nexoss-notification-test' });
  await Promise.all((rows as any[]).map(async (row) => {
    try {
      await webPush.sendNotification(row.subscription, message, { TTL: 60 * 60 });
    } catch (error: any) {
      const status = Number(error?.statusCode);
      if (status === 404 || status === 410) {
        await sql`DELETE FROM nexoss_web_push_subscriptions WHERE id = ${row.id}`;
      }
      throw error;
    }
  }));
  return true;
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


export async function sendWebPushToUsers(sql: Sql, uids: string[], payload: { title: string; body: string; url?: string; tag?: string }) {
  const uniqueUids = [...new Set(uids.filter((uid) => typeof uid === 'string' && uid.length > 0))];
  if (!isWebPushConfigured() || !uniqueUids.length) return 0;
  await ensureTable(sql);
  const rows = await sql`SELECT id, subscription FROM nexoss_web_push_subscriptions WHERE uid = ANY(${uniqueUids}::text[])`;
  if (!rows.length) return 0;
  const webPush = await getWebPush();
  const message = JSON.stringify({ title: payload.title, body: payload.body, url: payload.url || '/?tab=admin', tag: payload.tag || 'nexoss-collections-alert' });
  let sent = 0;
  await Promise.all((rows as any[]).map(async (row) => {
    try {
      await webPush.sendNotification(row.subscription, message, { TTL: 60 * 60 });
      sent += 1;
    } catch (error: any) {
      const status = Number(error?.statusCode);
      if (status === 404 || status === 410) await sql`DELETE FROM nexoss_web_push_subscriptions WHERE id = ${row.id}`;
      else logger.warn('[Web Push] No se pudo entregar una notificación dirigida:', status || 'error');
    }
  }));
  return sent;
}

export async function sendWebPushToRoles(sql: Sql, roles: string[], payload: { title: string; body: string; url?: string; tag?: string }) {
  const uniqueRoles = [...new Set(roles.filter((role) => typeof role === 'string' && role.length > 0))];
  if (!isWebPushConfigured() || !uniqueRoles.length) return 0;
  await ensureTable(sql);
  const rows = await sql`SELECT id, subscription FROM nexoss_web_push_subscriptions WHERE role = ANY(${uniqueRoles}::text[])`;
  if (!rows.length) return 0;
  const webPush = await getWebPush();
  const message = JSON.stringify({ title: payload.title, body: payload.body, url: payload.url || '/?tab=admin', tag: payload.tag || 'nexoss-collections-alert' });
  let sent = 0;
  await Promise.all((rows as any[]).map(async (row) => {
    try {
      await webPush.sendNotification(row.subscription, message, { TTL: 60 * 60 });
      sent += 1;
    } catch (error: any) {
      const status = Number(error?.statusCode);
      if (status === 404 || status === 410) await sql`DELETE FROM nexoss_web_push_subscriptions WHERE id = ${row.id}`;
      else logger.warn('[Web Push] No se pudo entregar una notificación por rol:', status || 'error');
    }
  }));
  return sent;
}

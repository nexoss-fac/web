/**
 * Verificación de pagos móviles BDV.
 * Las credenciales y el endpoint viven exclusivamente en el servidor (Render).
 * Nunca se acepta una aprobación simulada ni se transforma un error de red en aprobación.
 */
import { createHash } from 'node:crypto';
import { getNeonSql } from './db.ts';
import { logger } from './logger.ts';
import { tenantStorageContext } from './multiempresa/companyAccess.ts';

export interface BdvVerificationRequest {
  referencia: string; telefono_origen: string; cedula_cliente: string; banco_origen: string;
  monto_bs: number; monto_usd?: number; fecha?: string;
}
export interface BdvVerificationResult {
  aprobado: boolean; codigo_aprobacion: string; referencia: string; monto_bs: number;
  monto_usd_estimado?: number; telefono_origen: string; cedula_cliente: string; banco_origen: string;
  cuenta_receptora: string; fecha_transaccion: string; modo: 'PRODUCCION' | 'PENDIENTE';
  mensaje: string; detalles_tecnicos?: Record<string, unknown>;
}
const localVerificationLogs = new Map<string, BdvVerificationResult[]>();
const inFlight = new Map<string, Promise<BdvVerificationResult>>();
function currentCompanyLog(): BdvVerificationResult[] | null {
  const companyId = tenantStorageContext.getStore()?.companyId;
  if (!companyId) return null;
  let log = localVerificationLogs.get(companyId);
  if (!log) { log = []; localVerificationLogs.set(companyId, log); }
  return log;
}
function env(...names: string[]): string {
  for (const name of names) { const value = process.env[name]?.trim(); if (value) return value; }
  return '';
}
function safeUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') throw new Error('El endpoint BDV debe usar HTTPS.');
  return url.toString().replace(/\/$/, '');
}
export function getBdvApiConfig() {
  const apiUrl = env('BDV_API_URL', 'BDV_BASE_URL');
  const clientId = env('BDV_CLIENT_ID');
  const clientSecret = env('BDV_CLIENT_SECRET');
  const configured = Boolean(apiUrl && clientId && clientSecret);
  return {
    isConfigured: configured, mode: configured ? 'PRODUCCION' : 'PENDIENTE_CONFIGURACION',
    banco: 'Banco de Venezuela S.A. (0102)', comercioRif: env('BDV_COMERCIO_RIF'),
    comercioTelefono: env('BDV_COMERCIO_TELEFONO'), cuentaReceptora: env('BDV_CUENTA_RECEPTORA', 'BDV_CUENTA_DESTINO'),
    apiUrl: apiUrl ? '[configurado]' : '', appIdConfigured: Boolean(env('BDV_APP_ID')),
  };
}
function firstString(obj: any, keys: string[]): string {
  for (const key of keys) if (typeof obj?.[key] === 'string' && obj[key].trim()) return obj[key].trim();
  return '';
}
function firstNumber(obj: any, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = obj?.[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return undefined;
}
function makeResult(data: BdvVerificationRequest, ref: string, amount: number, approved: boolean, code: string, message: string, mode: 'PRODUCCION' | 'PENDIENTE', details?: Record<string, unknown>): BdvVerificationResult {
  return {
    aprobado: approved, codigo_aprobacion: code, referencia: ref, monto_bs: amount,
    monto_usd_estimado: data.monto_usd, telefono_origen: data.telefono_origen,
    cedula_cliente: data.cedula_cliente, banco_origen: data.banco_origen || 'Banco de Venezuela (0102)',
    cuenta_receptora: env('BDV_CUENTA_RECEPTORA', 'BDV_CUENTA_DESTINO'),
    fecha_transaccion: new Date().toISOString(), modo, mensaje: message,
    ...(details ? { detalles_tecnicos: details } : {}),
  };
}
export async function verifyBdvPayment(data: BdvVerificationRequest): Promise<BdvVerificationResult> {
  const tenantId = tenantStorageContext.getStore()?.companyId;
  if (!tenantId) throw new Error('No existe un contexto de empresa autorizado para verificar el pago.');
  const ref = String(data.referencia || '').trim();
  const phone = String(data.telefono_origen || '').replace(/\D/g, '');
  const id = String(data.cedula_cliente || '').trim();
  const amount = Number(data.monto_bs);
  if (!/^\d{4,20}$/.test(ref)) throw new Error('La referencia debe contener entre 4 y 20 dígitos.');
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('El monto en Bolívares debe ser mayor a 0.');
  if (phone.length < 10) throw new Error('Indica el teléfono de origen válido del Pago Móvil.');
  if (!id) throw new Error('Indica la cédula o RIF del pagador.');

  const apiUrlRaw = env('BDV_API_URL', 'BDV_BASE_URL');
  const config = getBdvApiConfig();
  // Do not call the bank again for a reference already credited in this tenant.
  const sql = getNeonSql();
  if (sql) {
    const previous = await sql`SELECT id FROM bdv_verifications WHERE referencia = ${ref} AND estado = 'APROBADO' LIMIT 1`;
    if (previous.length) {
      return makeResult(data, ref, amount, false, 'BDV_REFERENCIA_DUPLICADA',
        'Esta referencia ya fue acreditada anteriormente en esta empresa. No se registró un segundo pago.',
        'PENDIENTE');
    }
  }
  if (!config.isConfigured || !apiUrlRaw) {
    const pending = makeResult(data, ref, amount, false, 'BDV_NO_CONFIGURADO',
      'La API de conciliación BDV no está completamente configurada. El pago queda pendiente; no se confirmó.', 'PENDIENTE');
    await saveVerificationLog(pending); return pending;
  }
  const key = createHash('sha256').update(`${tenantId}:${ref}`).digest('hex');
  const duplicate = inFlight.get(key);
  if (duplicate) return duplicate;

  const operation = (async () => {
    const endpoint = safeUrl(apiUrlRaw);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json', Accept: 'application/json',
        'X-Client-Id': env('BDV_CLIENT_ID'), 'X-Client-Secret': env('BDV_CLIENT_SECRET'),
      };
      const appId = env('BDV_APP_ID');
      if (appId) headers['X-App-Id'] = appId;
      const method = env('BDV_API_METHOD').toUpperCase() === 'GET' ? 'GET' : 'POST';
      const response = await fetch(endpoint, {
        method, headers,
        ...(method === 'GET' ? {} : { body: JSON.stringify({
          referencia: ref, telefono: phone, cedula: id, banco: data.banco_origen,
          monto: amount, cuenta_destino: env('BDV_CUENTA_RECEPTORA', 'BDV_CUENTA_DESTINO'),
          fecha: data.fecha || undefined,
        }) }),
        signal: controller.signal, cache: 'no-store',
      });
      const raw = await response.text();
      let payload: any;
      try { payload = raw ? JSON.parse(raw) : null; } catch { payload = null; }
      if (!response.ok || !payload || typeof payload !== 'object') {
        const pending = makeResult(data, ref, amount, false, 'BDV_NO_VERIFICADO',
          'El banco no devolvió una confirmación válida. El pago permanece pendiente.', 'PENDIENTE',
          { http_status: response.status });
        await saveVerificationLog(pending); return pending;
      }
      const status = firstString(payload, ['status','estado','estatus','payment_status']).toUpperCase();
      const explicitlyApproved = payload.aprobado === true ||
        ['APROBADO','PAGADO','ACREDITADO','CONFIRMADO','SUCCESS','COMPLETED'].includes(status);
      const bankRef = firstString(payload, ['referencia','reference','payment_reference','numero_referencia']);
      const bankAmount = firstNumber(payload, ['monto','monto_bs','amount','amount_bs','paid_amount']);
      const bankPhone = firstString(payload, ['telefono','telefono_origen','phone','origin_phone']).replace(/\D/g, '');
      const refMatches = bankRef === ref;
      const amountMatches = bankAmount !== undefined && Math.abs(bankAmount - amount) < 0.01;
      const phoneMatches = !bankPhone || bankPhone === phone;
      const approved = explicitlyApproved && refMatches && amountMatches && phoneMatches;
      const result = makeResult(data, ref, amount, approved,
        approved ? firstString(payload, ['codigo_aprobacion','approval_code','authorization_code','id']) || 'BDV_CONFIRMADO' : 'BDV_DATOS_NO_COINCIDEN',
        approved ? firstString(payload, ['mensaje','message','descripcion']) || 'Pago confirmado por el Banco de Venezuela.' :
          'La respuesta bancaria no confirma una operación coincidente en referencia y monto. El pago queda pendiente.',
        approved ? 'PRODUCCION' : 'PENDIENTE',
        { http_status: response.status, referenceMatched: refMatches, amountMatched: amountMatches, phoneMatched: phoneMatches, bankStatus: status });
      const date = firstString(payload, ['fecha','fecha_transaccion','transaction_date','date']);
      if (approved && date && Number.isFinite(Date.parse(date))) result.fecha_transaccion = new Date(date).toISOString();
      await saveVerificationLog(result); return result;
    } catch (error) {
      logger.warn('[BDV] Consulta bancaria fallida; el pago no se confirma.', error instanceof Error ? error.message : 'error');
      const pending = makeResult(data, ref, amount, false, 'BDV_CONSULTA_FALLIDA',
        'No fue posible confirmar la operación con el banco. El pago permanece pendiente para reintentar.', 'PENDIENTE');
      await saveVerificationLog(pending); return pending;
    } finally { clearTimeout(timeout); }
  })();
  inFlight.set(key, operation);
  try { return await operation; } finally { inFlight.delete(key); }
}
async function saveVerificationLog(item: BdvVerificationResult) {
  const log = currentCompanyLog();
  if (!log) throw new Error('No existe un contexto de empresa autorizado para registrar la verificación.');
  log.unshift(item); if (log.length > 50) log.pop();
  const sql = getNeonSql();
  if (!sql) return;
  try {
    const id = `bdv-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    await sql`
      INSERT INTO bdv_verifications (
        id, referencia, telefono_origen, cedula_cliente, banco_origen,
        monto_bs, monto_usd_estimado, codigo_aprobacion, estado, mensaje, datos_bdv
      ) VALUES (
        ${id}, ${item.referencia}, ${item.telefono_origen}, ${item.cedula_cliente}, ${item.banco_origen},
        ${item.monto_bs}, ${item.monto_usd_estimado || null}, ${item.codigo_aprobacion},
        ${item.aprobado ? 'APROBADO' : 'PENDIENTE'}, ${item.mensaje}, ${JSON.stringify(item)}
      )
    `;
  } catch (error) { logger.error('No se pudo persistir verificación BDV en Neon:', error); }
}
export function getRecentVerifications(): BdvVerificationResult[] { return [...(currentCompanyLog() ?? [])]; }

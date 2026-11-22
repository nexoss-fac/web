/**
 * Verificación de pagos móviles BDV.
 * Las credenciales viven exclusivamente en Render. El contrato del API debe
 * confirmarse con la documentación oficial antes de enviar solicitudes.
 * Hasta entonces, ninguna referencia se marca como pagada.
 */
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
export function getBdvApiConfig() {
  const apiUrl = env('BDV_API_URL', 'BDV_BASE_URL');
  const configured = Boolean(apiUrl && env('BDV_CLIENT_ID') && env('BDV_CLIENT_SECRET'));
  return {
    isConfigured: configured, mode: configured ? 'CONTRATO_PENDIENTE' : 'PENDIENTE_CONFIGURACION',
    banco: 'Banco de Venezuela S.A. (0102)', comercioRif: env('BDV_COMERCIO_RIF'),
    comercioTelefono: env('BDV_COMERCIO_TELEFONO'),
    cuentaReceptora: env('BDV_CUENTA_RECEPTORA', 'BDV_CUENTA_DESTINO'),
    apiUrl: apiUrl ? '[configurado]' : '', appIdConfigured: Boolean(env('BDV_APP_ID')),
  };
}
function makeResult(data: BdvVerificationRequest, ref: string, amount: number, code: string, message: string): BdvVerificationResult {
  return {
    aprobado: false, codigo_aprobacion: code, referencia: ref, monto_bs: amount,
    monto_usd_estimado: data.monto_usd, telefono_origen: data.telefono_origen,
    cedula_cliente: data.cedula_cliente, banco_origen: data.banco_origen || 'Banco de Venezuela (0102)',
    cuenta_receptora: env('BDV_CUENTA_RECEPTORA', 'BDV_CUENTA_DESTINO'),
    fecha_transaccion: new Date().toISOString(), modo: 'PENDIENTE', mensaje: message,
  };
}
export async function verifyBdvPayment(data: BdvVerificationRequest): Promise<BdvVerificationResult> {
  if (!tenantStorageContext.getStore()?.companyId) {
    throw new Error('No existe un contexto de empresa autorizado para verificar el pago.');
  }
  const ref = String(data.referencia || '').trim();
  const phone = String(data.telefono_origen || '').replace(/\D/g, '');
  const id = String(data.cedula_cliente || '').trim();
  const amount = Number(data.monto_bs);
  if (!/^\d{4,20}$/.test(ref)) throw new Error('La referencia debe contener entre 4 y 20 dígitos.');
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('El monto en Bolívares debe ser mayor a 0.');
  if (phone.length < 10) throw new Error('Indica el teléfono de origen válido del Pago Móvil.');
  if (!id) throw new Error('Indica la cédula o RIF del pagador.');

  const sql = getNeonSql();
  if (sql) {
    const previous = await sql`SELECT id FROM bdv_verifications WHERE referencia = ${ref} AND estado = 'APROBADO' LIMIT 1`;
    if (previous.length) {
      const duplicate = makeResult(data, ref, amount, 'BDV_REFERENCIA_DUPLICADA',
        'Esta referencia ya fue acreditada anteriormente en esta empresa. No se registró un segundo pago.');
      await saveVerificationLog(duplicate);
      return duplicate;
    }
  }
  const config = getBdvApiConfig();
  const pending = makeResult(data, ref, amount,
    config.isConfigured ? 'BDV_CONTRATO_PENDIENTE' : 'BDV_NO_CONFIGURADO',
    config.isConfigured
      ? 'Las credenciales del BDV están detectadas en el servidor, pero falta validar el endpoint y el formato oficial de conciliación. El pago permanece pendiente; no se confirmó.'
      : 'La configuración de conciliación BDV está incompleta. El pago permanece pendiente; no se confirmó.');
  await saveVerificationLog(pending);
  return pending;
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
        'PENDIENTE', ${item.mensaje}, ${JSON.stringify(item)}
      )
    `;
  } catch (error) { logger.error('No se pudo persistir verificación BDV en Neon:', error); }
}
export function getRecentVerifications(): BdvVerificationResult[] { return [...(currentCompanyLog() ?? [])]; }

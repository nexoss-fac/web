/**
 * Banco de Venezuela - API oficial de Conciliación de Movimientos.
 * Contrato MDU-006 (enero 2024): POST /getMovement, X-API-Key y JSON.
 * La clave nunca se devuelve al navegador ni se registra en logs.
 */
import { getNeonSql } from './db.ts';
import { logger } from './logger.ts';
import { tenantStorageContext } from './multiempresa/companyAccess.ts';

const BDV_ENDPOINT = 'https://bdvconciliacion.banvenez.com:443/getMovement';
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
  const apiKeyConfigured = Boolean(env('BDV_API_KEY'));
  const destinationPhone = env('BDV_TELEFONO_DESTINO', 'BDV_COMERCIO_TELEFONO');
  return {
    isConfigured: apiKeyConfigured && Boolean(destinationPhone),
    mode: apiKeyConfigured && destinationPhone ? 'CONFIGURADO' : 'PENDIENTE_CONFIGURACION',
    banco: 'Banco de Venezuela S.A. (0102)',
    comercioRif: env('BDV_COMERCIO_RIF'),
    comercioTelefono: destinationPhone,
    cuentaReceptora: env('BDV_CUENTA_RECEPTORA', 'BDV_CUENTA_DESTINO'),
    apiUrl: BDV_ENDPOINT,
    apiKeyConfigured,
  };
}
function makeResult(data: BdvVerificationRequest, ref: string, amount: number, code: string, message: string, approved = false, details?: Record<string, unknown>): BdvVerificationResult {
  return {
    aprobado: approved, codigo_aprobacion: code, referencia: ref, monto_bs: amount,
    monto_usd_estimado: data.monto_usd, telefono_origen: data.telefono_origen,
    cedula_cliente: data.cedula_cliente, banco_origen: data.banco_origen || '',
    cuenta_receptora: env('BDV_CUENTA_RECEPTORA', 'BDV_CUENTA_DESTINO'),
    fecha_transaccion: new Date().toISOString(), modo: approved ? 'PRODUCCION' : 'PENDIENTE',
    mensaje, ...(details ? { detalles_tecnicos: details } : {}),
  };
}
export async function verifyBdvPayment(data: BdvVerificationRequest): Promise<BdvVerificationResult> {
  const tenantId = tenantStorageContext.getStore()?.companyId;
  if (!tenantId) throw new Error('No existe un contexto de empresa autorizado para verificar el pago.');
  const ref = String(data.referencia || '').trim();
  const phone = String(data.telefono_origen || '').replace(/\D/g, '');
  const id = String(data.cedula_cliente || '').trim().toUpperCase();
  const bank = String(data.banco_origen || '').replace(/\D/g, '');
  const amount = Number(data.monto_bs);
  const paymentDate = String(data.fecha || '').trim();
  if (!/^\d{4,20}$/.test(ref)) throw new Error('La referencia debe contener entre 4 y 20 dígitos.');
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('El monto en Bolívares debe ser mayor a 0.');
  if (phone.length < 10) throw new Error('Indica el teléfono de origen válido del Pago Móvil.');
  if (!id) throw new Error('Indica la cédula o RIF del pagador.');
  if (!/^\d{4}$/.test(bank)) throw new Error('Selecciona el código de cuatro dígitos del banco emisor.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate) || !Number.isFinite(Date.parse(paymentDate))) {
    throw new Error('Indica la fecha del Pago Móvil en formato AAAA-MM-DD.');
  }

  const config = getBdvApiConfig();
  const apiKey = env('BDV_API_KEY');
  const destinationPhone = String(config.comercioTelefono || '').replace(/\D/g, '');
  if (!apiKey || destinationPhone.length < 10) {
    const pending = makeResult(data, ref, amount, 'BDV_CONFIGURACION_INCOMPLETA',
      'Falta configurar en Render BDV_API_KEY y BDV_TELEFONO_DESTINO. El pago no fue confirmado.');
    await saveVerificationLog(pending);
    return pending;
  }

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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(BDV_ENDPOINT, {
      method: 'POST',
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        cedulaPagador: id,
        telefonoPagador: phone,
        telefonoDestino: destinationPhone,
        referencia: ref,
        fechaPago: paymentDate,
        importe: amount.toFixed(2),
        bancoOrigen: bank,
      }),
      signal: controller.signal,
      cache: 'no-store',
    });
    const raw = await response.text();
    let payload: any;
    try { payload = raw ? JSON.parse(raw) : null; } catch { payload = null; }
    if (!response.ok || !payload || typeof payload !== 'object') {
      const pending = makeResult(data, ref, amount, 'BDV_RESPUESTA_INVALIDA',
        'El servicio BDV no devolvió una respuesta válida. El pago permanece pendiente.',
        false, { httpStatus: response.status });
      await saveVerificationLog(pending);
      return pending;
    }

    // El manual indica que cualquier código distinto de 1000 es error.
    const code = Number(payload.code);
    const movementStatus = String(payload.data?.status ?? '');
    const bankAmount = Number(String(payload.data?.amount ?? '').replace(',', '.'));
    const amountMatches = Number.isFinite(bankAmount) && Math.abs(bankAmount - amount) < 0.01;
    const approved = code === 1000 && movementStatus === '1000' && amountMatches;
    const bankMessage = typeof payload.message === 'string' ? payload.message : '';
    const reason = typeof payload.data?.reason === 'string' ? payload.data.reason : '';
    const result = makeResult(
      data, ref, amount,
      approved ? '1000' : `BDV_${Number.isFinite(code) ? code : 'ERROR'}`,
      approved
        ? (reason || bankMessage || 'Transacción conciliada correctamente por el Banco de Venezuela.')
        : (bankMessage || reason || 'El Banco de Venezuela no confirmó el pago.'),
      approved,
      { bankCode: Number.isFinite(code) ? code : null, bankStatus: movementStatus || null, bankAmount: Number.isFinite(bankAmount) ? bankAmount : null, amountMatches, httpStatus: response.status },
    );
    await saveVerificationLog(result);
    return result;
  } catch (error) {
    logger.warn('[BDV] Falló la consulta de conciliación; el pago queda pendiente.', error instanceof Error ? error.message : 'error');
    const pending = makeResult(data, ref, amount, 'BDV_CONSULTA_FALLIDA',
      'No fue posible consultar al Banco de Venezuela. El pago permanece pendiente para reintentar.');
    await saveVerificationLog(pending);
    return pending;
  } finally {
    clearTimeout(timeout);
  }
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

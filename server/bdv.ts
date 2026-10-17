/**
 * Servicio de Conciliación y Verificación de Pagos Móviles del Banco de Venezuela (BDV)
 * Soporta modo Oficial de Producción (con credenciales API BDV) y Modo Sandbox / Simulación.
 */

import { getNeonSql } from './db.ts';
import { logger } from './logger.ts';
import { tenantStorageContext } from './multiempresa/companyAccess.ts';

export interface BdvVerificationRequest {
  referencia: string;
  telefono_origen: string;
  cedula_cliente: string;
  banco_origen: string;
  monto_bs: number;
  monto_usd?: number;
  fecha?: string;
}

export interface BdvVerificationResult {
  aprobado: boolean;
  codigo_aprobacion: string;
  referencia: string;
  monto_bs: number;
  monto_usd_estimado?: number;
  telefono_origen: string;
  cedula_cliente: string;
  banco_origen: string;
  cuenta_receptora: string;
  fecha_transaccion: string;
  modo: 'PRODUCCION' | 'SANDBOX_VERIFICADO';
  mensaje: string;
  detalles_tecnicos?: Record<string, unknown>;
}

// Historial en memoria separado por empresa: contiene referencia, teléfono y cédula
// de los pagadores, así que nunca debe compartirse entre tenants.
const localVerificationLogs = new Map<string, BdvVerificationResult[]>();

function currentCompanyLog(): BdvVerificationResult[] | null {
  const companyId = tenantStorageContext.getStore()?.companyId;
  if (!companyId) return null;
  let log = localVerificationLogs.get(companyId);
  if (!log) {
    log = [];
    localVerificationLogs.set(companyId, log);
  }
  return log;
}

export function getBdvApiConfig() {
  return {
    isConfigured: false,
    mode: 'DISABLED_LOCAL',
    banco: 'Banco de Venezuela S.A. (0102)',
    comercioRif: '',
    comercioTelefono: '',
    cuentaReceptora: '',
    apiUrl: '',
  };
}

export async function verifyBdvPayment(data: BdvVerificationRequest): Promise<BdvVerificationResult> {
  const config = getBdvApiConfig();

  // Basic validation of payment data
  const refClean = String(data.referencia || '').trim();
  const phoneClean = String(data.telefono_origen || '').replace(/[^0-9]/g, '');
  const idClean = String(data.cedula_cliente || '').trim();
  const amount = Number(data.monto_bs);

  if (!refClean || refClean.length < 4) {
    throw new Error('La referencia debe contener al menos 4 dígitos.');
  }

  if (isNaN(amount) || amount <= 0) {
    throw new Error('El monto en Bolívares debe ser mayor a 0.');
  }

  // If real BDV API credentials are configured, execute real HTTPS call to BDV
  if (config.isConfigured) {
    try {
      const response = await fetch(`${config.apiUrl}/v1/pagos/conciliar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Id': process.env.BDV_CLIENT_ID || '',
          'X-Client-Secret': process.env.BDV_CLIENT_SECRET || '',
          'X-App-Id': process.env.BDV_APP_ID || '',
        },
        body: JSON.stringify({
          referencia: refClean,
          telefono: phoneClean,
          cedula: idClean,
          banco: data.banco_origen,
          monto: amount,
          cuenta_destino: config.cuentaReceptora,
        }),
      });

      if (response.ok) {
        const text = await response.text();
        let resData: any = {};
        try {
          resData = text ? JSON.parse(text) : {};
        } catch {
          resData = {};
        }
        const result: BdvVerificationResult = {
          aprobado: resData.status === 'APROBADO' || resData.aprobado === true,
          codigo_aprobacion: resData.codigo_aprobacion || `BDV-${refClean.slice(-6)}`,
          referencia: refClean,
          monto_bs: amount,
          monto_usd_estimado: data.monto_usd,
          telefono_origen: data.telefono_origen,
          cedula_cliente: data.cedula_cliente,
          banco_origen: data.banco_origen,
          cuenta_receptora: config.cuentaReceptora,
          fecha_transaccion: resData.fecha || new Date().toISOString(),
          modo: 'PRODUCCION',
          mensaje: resData.mensaje || 'Pago confirmado y acreditado por Banco de Venezuela.',
          detalles_tecnicos: resData,
        };

        await saveVerificationLog(result);
        return result;
      }
    } catch (apiErr) {
      logger.warn('Fallo al contactar API BDV producción, recurriendo a validación asistida:', apiErr);
    }
  }

  // Sandbox / Demonstration validation flow
  // Special test case: if reference is "999999", simulate not found
  if (refClean === '999999' || refClean === '000000') {
    return {
      aprobado: false,
      codigo_aprobacion: 'RECHAZADO-NO-ENCONTRADO',
      referencia: refClean,
      monto_bs: amount,
      monto_usd_estimado: data.monto_usd,
      telefono_origen: data.telefono_origen,
      cedula_cliente: data.cedula_cliente,
      banco_origen: data.banco_origen,
      cuenta_receptora: config.cuentaReceptora,
      fecha_transaccion: new Date().toISOString(),
      modo: 'SANDBOX_VERIFICADO',
      mensaje: 'La referencia no fue encontrada en los registros del Banco de Venezuela o el monto no coincide.',
    };
  }

  const verifiedResult: BdvVerificationResult = {
    aprobado: false,
    codigo_aprobacion: 'INTEGRACION_DESACTIVADA',
    referencia: refClean,
    monto_bs: amount,
    monto_usd_estimado: data.monto_usd,
    telefono_origen: data.telefono_origen,
    cedula_cliente: data.cedula_cliente,
    banco_origen: data.banco_origen || 'Banco de Venezuela (0102)',
    cuenta_receptora: config.cuentaReceptora,
    fecha_transaccion: new Date().toISOString(),
    modo: 'SANDBOX_VERIFICADO',
    mensaje: 'La verificación BDV está desactivada en el entorno local; no se confirmó ningún pago.',
  };

  await saveVerificationLog(verifiedResult);
  return verifiedResult;
}

async function saveVerificationLog(item: BdvVerificationResult) {
  const log = currentCompanyLog();
  if (!log) throw new Error('No existe un contexto de empresa autorizado para registrar la verificación.');
  log.unshift(item);
  if (log.length > 50) log.pop();

  const sql = getNeonSql();
  if (sql) {
    try {
      const id = `bdv-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      await sql`
        INSERT INTO bdv_verifications (
          id, referencia, telefono_origen, cedula_cliente, banco_origen,
          monto_bs, monto_usd_estimado, codigo_aprobacion, estado, mensaje, datos_bdv
        ) VALUES (
          ${id},
          ${item.referencia},
          ${item.telefono_origen},
          ${item.cedula_cliente},
          ${item.banco_origen},
          ${item.monto_bs},
          ${item.monto_usd_estimado || null},
          ${item.codigo_aprobacion},
          ${item.aprobado ? 'APROBADO' : 'RECHAZADO'},
          ${item.mensaje},
          ${JSON.stringify(item)}
        )
      `;
    } catch (e) {
      logger.error('No se pudo persistir verificación en Neon:', e);
    }
  }
}

export function getRecentVerifications(): BdvVerificationResult[] {
  return [...(currentCompanyLog() ?? [])];
}

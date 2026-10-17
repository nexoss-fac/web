import { 
  BdvVerificationData, 
  BdvVerificationResponse, 
  NeonDbStatus, 
  ShoeProduct, 
  Sale,
  Expense,
  BankMovement,
  NeonTableInfo,
  DailyCashClosure
} from '../types';

/**
 * Safely extract JSON from a Fetch Response without throwing
 * "Unexpected end of JSON input" if the response body is empty or non-JSON.
 */
async function safeJson<T = any>(res: Response, fallbackValue: T): Promise<T> {
  try {
    const text = await res.text();
    if (!text || !text.trim()) {
      return fallbackValue;
    }
    return JSON.parse(text) as T;
  } catch {
    return fallbackValue;
  }
}

export async function checkNeonDbStatus(): Promise<NeonDbStatus> {
  try {
    const res = await fetch('/api/db/status');
    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}`);
    }
    return await safeJson<NeonDbStatus>(res, {
      connected: false,
      message: 'Respuesta no válida del servidor.',
    });
  } catch (err) {
    return {
      connected: false,
      message: 'No se pudo conectar con el endpoint de base de datos.',
      error: String(err),
    };
  }
}

export async function syncDataToNeon(products: ShoeProduct[], sales: Sale[]): Promise<{
  success: boolean;
  message: string;
  productsCount?: number;
  salesCount?: number;
  error?: string;
}> {
  try {
    const res = await fetch('/api/db/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ products, sales }),
    });
    return await safeJson(res, {
      success: false,
      message: 'Respuesta vacía del servidor',
    });
  } catch (err) {
    return {
      success: false,
      message: 'Fallo al sincronizar con Neon PostgreSQL',
      error: String(err),
    };
  }
}

export async function verifyBdvPagoMovil(data: BdvVerificationData): Promise<BdvVerificationResponse> {
  const refClean = String(data.referencia || '').trim();
  const amount = Number(data.monto_bs);

  // Validación básica del comprobante
  if (!refClean || refClean.length < 4) {
    return {
      aprobado: false,
      codigo_aprobacion: 'REF_INVALIDA',
      referencia: refClean,
      monto_bs: amount || 0,
      monto_usd_estimado: data.monto_usd,
      telefono_origen: data.telefono_origen || '',
      cedula_cliente: data.cedula_cliente || '',
      banco_origen: data.banco_origen || 'Banco de Venezuela',
      cuenta_receptora: 'Cuenta de demostración',
      fecha_transaccion: new Date().toISOString(),
      modo: 'SANDBOX_VERIFICADO',
      mensaje: 'La referencia bancaria debe tener al menos 4 dígitos.',
    };
  }

  if (isNaN(amount) || amount <= 0) {
    return {
      aprobado: false,
      codigo_aprobacion: 'MONTO_INVALIDO',
      referencia: refClean,
      monto_bs: 0,
      monto_usd_estimado: data.monto_usd,
      telefono_origen: data.telefono_origen || '',
      cedula_cliente: data.cedula_cliente || '',
      banco_origen: data.banco_origen || 'Banco de Venezuela',
      cuenta_receptora: 'Cuenta de demostración',
      fecha_transaccion: new Date().toISOString(),
      modo: 'SANDBOX_VERIFICADO',
      mensaje: 'El monto en Bolívares debe ser mayor a 0.',
    };
  }

  // Si se ingresa una referencia de prueba de rechazo
  if (refClean === '999999' || refClean === '000000') {
    return {
      aprobado: false,
      codigo_aprobacion: 'RECHAZADO_BDV',
      referencia: refClean,
      monto_bs: amount,
      monto_usd_estimado: data.monto_usd,
      telefono_origen: data.telefono_origen,
      cedula_cliente: data.cedula_cliente,
      banco_origen: data.banco_origen,
      cuenta_receptora: 'Cuenta de demostración',
      fecha_transaccion: new Date().toISOString(),
      modo: 'SANDBOX_VERIFICADO',
      mensaje: 'La referencia no fue encontrada en los registros del Banco de Venezuela o el monto no coincide.',
    };
  }

  try {
    const res = await fetch('/api/bdv/verificar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (res.ok) {
      const result = await safeJson<BdvVerificationResponse | null>(res, null);
      if (result && typeof result.aprobado === 'boolean') {
        return result;
      }
    }
  } catch (err: any) {
    console.warn('API BDV no disponible en el backend, usando verificación asistida en cliente:', err);
  }

  return {
    aprobado: false,
    codigo_aprobacion: 'INTEGRACION_DESACTIVADA',
    referencia: refClean,
    monto_bs: amount,
    monto_usd_estimado: data.monto_usd,
    telefono_origen: data.telefono_origen,
    cedula_cliente: data.cedula_cliente,
    banco_origen: data.banco_origen || 'Banco de Venezuela (0102)',
    cuenta_receptora: '',
    fecha_transaccion: new Date().toISOString(),
    modo: 'SANDBOX_VERIFICADO',
    mensaje: 'La verificación BDV está desactivada en el entorno local; no se confirmó ningún pago.',
  };
}

export async function getBdvConfig() {
  const fallback = {
    isConfigured: false,
    mode: 'DISABLED_LOCAL',
    banco: 'Banco de Venezuela S.A. (0102)',
    comercioRif: '',
    comercioTelefono: '',
    cuentaReceptora: '',
  };

  try {
    const res = await fetch('/api/bdv/status');
    return await safeJson(res, fallback);
  } catch {
    return fallback;
  }
}

// Expenses API client
export async function fetchExpensesApi(): Promise<Expense[]> {
  try {
    const res = await fetch('/api/expenses');
    const json = await safeJson(res, { data: [] });
    return json.data || [];
  } catch (err) {
    console.error('Error fetching expenses from API:', err);
    return [];
  }
}

export async function saveExpenseApi(expense: Expense): Promise<boolean> {
  try {
    const res = await fetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(expense),
    });
    const json = await safeJson(res, { saved: false });
    return Boolean(json.saved);
  } catch (err) {
    console.error('Error saving expense to API:', err);
    return false;
  }
}

export async function deleteExpenseApi(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/expenses/${id}`, {
      method: 'DELETE',
    });
    const json = await safeJson(res, { deleted: false });
    return Boolean(json.deleted);
  } catch (err) {
    console.error('Error deleting expense:', err);
    return false;
  }
}

// Neon Tables Explorer
export async function fetchNeonTablesList(): Promise<NeonTableInfo[]> {
  try {
    const res = await fetch('/api/db/tables');
    const json = await safeJson(res, { tables: [] });
    return json.tables || [];
  } catch (err) {
    console.error('Error fetching Neon tables:', err);
    return [];
  }
}

export async function fetchNeonTableContent(tableName: string, limit = 50): Promise<{
  tableName: string;
  rowCount: number;
  columns: string[];
  rows: any[];
} | null> {
  try {
    const res = await fetch(`/api/db/table-data?table=${encodeURIComponent(tableName)}&limit=${limit}`);
    const json = await safeJson(res, null);
    if (!json || !json.success) return null;
    return json;
  } catch (err) {
    console.error(`Error loading table data for ${tableName}:`, err);
    return null;
  }
}

// Bank Reconciliations API client
export async function fetchBankReconciliationsApi(): Promise<BankMovement[]> {
  try {
    const res = await fetch('/api/bank-reconciliations');
    const json = await safeJson(res, { data: [] });
    return json.data || [];
  } catch (err) {
    console.error('Error fetching bank reconciliations:', err);
    return [];
  }
}

export async function saveBankReconciliationApi(item: BankMovement): Promise<boolean> {
  try {
    const res = await fetch('/api/bank-reconciliations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
    const json = await safeJson(res, { saved: false });
    return Boolean(json.saved);
  } catch (err) {
    console.error('Error saving bank reconciliation:', err);
    return false;
  }
}

export async function updateBankReconciliationApi(
  id: string, 
  updates: Partial<BankMovement>
): Promise<boolean> {
  try {
    const res = await fetch(`/api/bank-reconciliations/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    const json = await safeJson(res, { updated: false });
    return Boolean(json.updated);
  } catch (err) {
    console.error('Error updating bank reconciliation:', err);
    return false;
  }
}

// Sales API client
export async function fetchSalesApi(): Promise<Sale[]> {
  try {
    const res = await fetch('/api/sales');
    const json = await safeJson(res, { data: [] });
    return json.data || [];
  } catch (err) {
    console.error('Error fetching sales from API:', err);
    return [];
  }
}

export async function saveSaleApi(sale: Sale): Promise<boolean> {
  try {
    const res = await fetch('/api/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sale),
    });
    const json = await safeJson(res, { saved: false });
    return Boolean(json.saved);
  } catch (err) {
    console.error('Error saving sale to API:', err);
    return false;
  }
}

export async function voidSaleApi(id: string, motivo: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/sales/${id}/void`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo }),
    });
    const json = await safeJson(res, { success: false });
    return Boolean(json.success);
  } catch (err) {
    console.error('Error voiding sale in API:', err);
    return false;
  }
}

// Cash Closures API client
export async function fetchClosuresApi(): Promise<DailyCashClosure[]> {
  try {
    const res = await fetch('/api/closures');
    const json = await safeJson(res, { data: [] });
    return json.data || [];
  } catch (err) {
    console.error('Error fetching closures from API:', err);
    return [];
  }
}

export async function saveClosureApi(closure: DailyCashClosure): Promise<boolean> {
  try {
    const res = await fetch('/api/closures', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(closure),
    });
    const json = await safeJson(res, { saved: false });
    return Boolean(json.saved);
  } catch (err) {
    console.error('Error saving closure to API:', err);
    return false;
  }
}

import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import { createHash } from 'node:crypto';
import { tenantStorageContext } from './multiempresa/companyAccess.ts';
import { logger } from './logger.ts';
import { EXPENSE_CUENTA, EXPENSE_PARTIDA, normalizeExpenseCategory } from '../src/domain/expenseChart.ts';

const sqlClients = new Map<string, { fingerprint: string; client: NeonQueryFunction<false, false> }>();
const initializedTenantSchemas = new Set<string>();

// PostgreSQL (y por lo tanto Neon) devuelve las columnas NUMERIC/DECIMAL como
// strings, no como números JS, para evitar pérdida de precisión. Nuestro
// esquema usa NUMERIC para todos los campos de dinero/tasas, así que cada fila
// leída directo de la BD necesita estos campos convertidos de vuelta a número
// antes de enviarse al cliente — si no, cosas como `total_usd.toFixed(2)` o
// `sum + row.total_usd` se rompen (concatenación de texto en vez de suma).
function normalizeNumericFields<T extends Record<string, any>>(row: T, fields: string[]): T {
  const out: any = { ...row };
  for (const field of fields) {
    if (out[field] !== null && out[field] !== undefined && out[field] !== '') {
      const n = Number(out[field]);
      if (!Number.isNaN(n)) out[field] = n;
    }
  }
  return out;
}

function normalizeNumericRows<T extends Record<string, any>>(rows: T[], fields: string[]): T[] {
  return rows.map((row) => normalizeNumericFields(row, fields));
}

export const NUMERIC_FIELDS = {
  shoe_products: ['precio', 'costo'],
  sales_transactions: [
    'subtotal_usd',
    'descuento_usd',
    'porcentaje_iva',
    'iva_monto_usd',
    'total_usd',
    'total_bs',
    'costo_total_usd',
    'ganancia_neta_usd',
    'tasa_cambio',
    'total_positivo_inmediato_usd',
    'total_cashea_pendiente_usd',
  ],
  expenses: ['monto', 'tasa_cambio', 'monto_usd', 'monto_bs'],
  bank_reconciliations: ['monto_bs', 'monto_usd'],
  layaways: [
    'total_usd',
    'total_bs',
    'tasa_cambio',
    'total_abonado_usd',
    'total_abonado_bs',
    'saldo_pendiente_usd',
    'saldo_pendiente_bs',
  ],
};

export function normalizeProducts<T extends Record<string, any>>(rows: T[]): T[] {
  return normalizeNumericRows(rows, NUMERIC_FIELDS.shoe_products);
}

export function normalizeSales<T extends Record<string, any>>(rows: T[]): T[] {
  return normalizeNumericRows(rows, NUMERIC_FIELDS.sales_transactions);
}

export function normalizeExpenses<T extends Record<string, any>>(rows: T[]): T[] {
  return normalizeNumericRows(rows, NUMERIC_FIELDS.expenses);
}

export function normalizeBankReconciliations<T extends Record<string, any>>(rows: T[]): T[] {
  return normalizeNumericRows(rows, NUMERIC_FIELDS.bank_reconciliations);
}

export function normalizeLayaways<T extends Record<string, any>>(rows: T[]): T[] {
  return normalizeNumericRows(rows, NUMERIC_FIELDS.layaways);
}

export async function getDailyClosures(): Promise<any[]> {
  const sql = getNeonSql();
  if (!sql) return [];
  try {
    const rows = await sql`SELECT * FROM cash_closures ORDER BY fecha DESC, created_at DESC`;
    return rows;
  } catch (err) {
    logger.error('Error obteniendo cierres de caja:', err);
    return [];
  }
}

export async function addDailyClosure(closure: any): Promise<boolean> {
  const sql = getNeonSql();
  if (!sql) return false;
  try {
    await sql`
      INSERT INTO cash_closures (
        id, fecha, monto_apertura_usd, monto_apertura_bs, total_ventas_usd, total_ventas_bs,
        totales_por_cuenta, monto_declarado_usd, monto_declarado_bs, diferencia_usd, diferencia_bs,
        tasa_bcv, usuario, observaciones, estado
      ) VALUES (
        ${closure.id}, ${closure.fecha}, ${closure.monto_apertura_usd || 0}, ${closure.monto_apertura_bs || 0},
        ${closure.total_ventas_usd || 0}, ${closure.total_ventas_bs || 0}, ${JSON.stringify(closure.totales_por_cuenta || {})},
        ${closure.monto_declarado_usd || 0}, ${closure.monto_declarado_bs || 0}, ${closure.diferencia_usd || 0},
        ${closure.diferencia_bs || 0}, ${closure.tasa_bcv || 0}, ${closure.usuario || ''}, ${closure.observaciones || ''},
        ${closure.estado || 'cerrado'}
      )
    `;
    return true;
  } catch (err) {
    logger.error('Error insertando cierre de caja:', err);
    return false;
  }
}

export async function replaceDailyClosures(closures: any[]): Promise<boolean> {
  const sql = getNeonSql();
  if (!sql) return false;
  try {
    for (const c of closures) {
      await addDailyClosure(c);
    }
    return true;
  } catch {
    return false;
  }
}

export function getNeonSql(): NeonQueryFunction<false, false> | null {
  const tenant = tenantStorageContext.getStore();
  if (!tenant?.companyId || !tenant.connectionString) return null;
  const fingerprint = createHash('sha256').update(tenant.connectionString).digest('hex');
  const cached = sqlClients.get(tenant.companyId);
  if (!cached || cached.fingerprint !== fingerprint) {
    const client = neon(tenant.connectionString);
    sqlClients.set(tenant.companyId, { fingerprint, client });
    return client;
  }
  return cached.client;
}

/**
 * Persistencia JSON complementaria del espacio de trabajo de un tenant.
 * Cada empresa resuelve su propia conexión Neon en tenantStorageContext, por
 * lo que esta tabla vive en la base operativa de esa empresa.
 */
export async function readTenantWorkspaceState(): Promise<Record<string, unknown> | null> {
  const sql = getNeonSql();
  if (!sql) return null;
  await sql`
    CREATE TABLE IF NOT EXISTS nexoss_workspace_state (
      id TEXT PRIMARY KEY CHECK (id = 'current'),
      state JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  const rows = await sql`SELECT state FROM nexoss_workspace_state WHERE id = 'current' LIMIT 1`;
  const state = rows[0]?.state;
  return state && typeof state === 'object' && !Array.isArray(state)
    ? state as Record<string, unknown>
    : null;
}

export async function writeTenantWorkspaceState(state: Record<string, unknown>): Promise<void> {
  const sql = getNeonSql();
  if (!sql) throw new Error('No existe una conexión Neon operativa para la empresa autorizada.');
  await sql`
    CREATE TABLE IF NOT EXISTS nexoss_workspace_state (
      id TEXT PRIMARY KEY CHECK (id = 'current'),
      state JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`
    INSERT INTO nexoss_workspace_state (id, state, updated_at)
    VALUES ('current', ${JSON.stringify(state)}::jsonb, NOW())
    ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()
  `;
}

export async function checkDatabaseConnection(): Promise<{
  connected: boolean;
  message: string;
  tablesCount?: number;
  productsCount?: number;
  salesCount?: number;
  closuresCount?: number;
  expensesCount?: number;
  bankCount?: number;
  layawaysCount?: number;
  databaseName?: string;
  tablesSummary?: Record<string, number>;
  error?: string;
}> {
  const sql = getNeonSql();
  if (!sql) {
    return {
      connected: false,
      message: 'DATABASE_URL no configurada en las variables de entorno. Puedes agregarla en .env o Vercel.',
    };
  }

  try {
    const timeResult = await sql`SELECT current_database() as db, NOW() as current_time`;
    const dbName = timeResult[0]?.db || 'neondb';

    // Ensure tables exist
    await initDatabaseSchema();

    // Check count of records across all core business tables
    const [pRes, sRes, cRes, eRes, bRes, lRes] = await Promise.allSettled([
      sql`SELECT COUNT(*) as count FROM shoe_products`,
      sql`SELECT COUNT(*) as count FROM sales_transactions`,
      sql`SELECT COUNT(*) as count FROM cash_closures`,
      sql`SELECT COUNT(*) as count FROM expenses`,
      sql`SELECT COUNT(*) as count FROM bank_reconciliations`,
      sql`SELECT COUNT(*) as count FROM layaways`,
    ]);

    const getCount = (res: PromiseSettledResult<any>) =>
      res.status === 'fulfilled' && res.value[0]?.count ? Number(res.value[0].count) : 0;

    const productsCount = getCount(pRes);
    const salesCount = getCount(sRes);
    const closuresCount = getCount(cRes);
    const expensesCount = getCount(eRes);
    const bankCount = getCount(bRes);
    const layawaysCount = getCount(lRes);

    return {
      connected: true,
      message: 'Conectado exitosamente a la base de datos Neon PostgreSQL',
      databaseName: dbName,
      productsCount,
      salesCount,
      closuresCount,
      expensesCount,
      bankCount,
      layawaysCount,
      tablesSummary: {
        shoe_products: productsCount,
        sales_transactions: salesCount,
        cash_closures: closuresCount,
        expenses: expensesCount,
        bank_reconciliations: bankCount,
        layaways: layawaysCount,
      },
    };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      connected: false,
      message: 'Error al conectar con Neon PostgreSQL',
      error: errMsg,
    };
  }
}

export async function initDatabaseSchema() {
  const sql = getNeonSql();
  const tenant = tenantStorageContext.getStore();
  const tenantId = tenant?.companyId;
  if (!sql || !tenantId || !tenant?.connectionString) return;
  const connectionFingerprint = createHash('sha256').update(tenant.connectionString).digest('hex');
  const schemaKey = `${tenantId}:${connectionFingerprint}`;
  if (initializedTenantSchemas.has(schemaKey)) return;

  try {
    // 1. Table for Shoe Products
    await sql`
      CREATE TABLE IF NOT EXISTS shoe_products (
        id VARCHAR(64) PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL,
        marca VARCHAR(100) NOT NULL,
        modelo VARCHAR(150),
        tipo VARCHAR(100),
        color VARCHAR(80),
        genero VARCHAR(50),
        categoria VARCHAR(100),
        clasificacion_inventario VARCHAR(100) NOT NULL DEFAULT 'Mercancía',
        talla VARCHAR(20) NOT NULL,
        sku VARCHAR(80) NOT NULL,
        precio NUMERIC(12, 2) NOT NULL,
        costo NUMERIC(12, 2) NOT NULL,
        stock INTEGER NOT NULL DEFAULT 0,
        stock_minimo INTEGER NOT NULL DEFAULT 3,
        stock_maximo INTEGER NOT NULL DEFAULT 30,
        imagen_url TEXT,
        ubicacion VARCHAR(100),
        descripcion TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;

    // 2. Table for Sales Transactions
    await sql`
      CREATE TABLE IF NOT EXISTS sales_transactions (
        id VARCHAR(64) PRIMARY KEY,
        numero_factura VARCHAR(50) NOT NULL,
        cliente_nombre VARCHAR(120),
        cliente_apellido VARCHAR(120),
        cliente_rif VARCHAR(50),
        cliente_telefono VARCHAR(50),
        subtotal_usd NUMERIC(12, 2) NOT NULL,
        descuento_usd NUMERIC(12, 2) DEFAULT 0,
        aplica_iva BOOLEAN DEFAULT FALSE,
        iva_incluido BOOLEAN DEFAULT FALSE,
        porcentaje_iva NUMERIC(5, 2) DEFAULT 0,
        iva_monto_usd NUMERIC(12, 2) DEFAULT 0,
        total_usd NUMERIC(12, 2) NOT NULL,
        total_bs NUMERIC(14, 2) NOT NULL,
        costo_total_usd NUMERIC(12, 2) DEFAULT 0,
        ganancia_neta_usd NUMERIC(12, 2) DEFAULT 0,
        tasa_cambio NUMERIC(10, 2) NOT NULL,
        items JSONB NOT NULL,
        pagos JSONB NOT NULL,
        fecha TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        usuario VARCHAR(100),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;

    // Secuencia persistente de facturación. Neon es la fuente de verdad para
    // evitar que dos terminales generen el mismo número.
    await sql`
      CREATE TABLE IF NOT EXISTS invoice_sequences (
        id VARCHAR(30) PRIMARY KEY,
        last_number INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;
    await sql`
      INSERT INTO invoice_sequences (id, last_number)
      VALUES ('NEXOSS', COALESCE((
        SELECT MAX(CASE
          WHEN numero_factura ~ '[0-9]+$'
          THEN CAST(SUBSTRING(numero_factura FROM '[0-9]+$') AS INTEGER)
          ELSE 0 END)
        FROM sales_transactions
      ), 0))
      ON CONFLICT (id) DO UPDATE SET
        last_number = GREATEST(invoice_sequences.last_number, EXCLUDED.last_number),
        updated_at = NOW();
    `;

    // 3. Table for Cash Closures (Arqueo de caja)
    await sql`
      CREATE TABLE IF NOT EXISTS cash_closures (
        id VARCHAR(64) PRIMARY KEY,
        fecha VARCHAR(20) NOT NULL,
        monto_apertura_usd NUMERIC(12, 2) DEFAULT 0,
        monto_apertura_bs NUMERIC(14, 2) DEFAULT 0,
        total_ventas_usd NUMERIC(12, 2) DEFAULT 0,
        total_ventas_bs NUMERIC(14, 2) DEFAULT 0,
        totales_por_cuenta JSONB NOT NULL,
        monto_declarado_usd NUMERIC(12, 2) DEFAULT 0,
        monto_declarado_bs NUMERIC(14, 2) DEFAULT 0,
        diferencia_usd NUMERIC(12, 2) DEFAULT 0,
        diferencia_bs NUMERIC(14, 2) DEFAULT 0,
        tasa_bcv NUMERIC(10, 2) NOT NULL,
        usuario VARCHAR(100),
        observaciones TEXT,
        estado VARCHAR(30) DEFAULT 'cerrado',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;

    // Columnas para persistir el cierre de caja / arqueo diario tal como lo
    // arma el frontend (evita depender de que las columnas de arriba
    // coincidan exactamente con lo que la app realmente envía).
    await sql`ALTER TABLE cash_closures ADD COLUMN IF NOT EXISTS data JSONB`;
    await sql`ALTER TABLE cash_closures ALTER COLUMN totales_por_cuenta DROP NOT NULL`;
    await sql`ALTER TABLE cash_closures ALTER COLUMN tasa_bcv DROP NOT NULL`;

    // Columnas añadidas después del diseño original: permiten guardar el
    // correo del cliente, notas de la venta, y anular una venta con error
    // (en vez de borrarla, se marca como 'anulada' y se conserva el historial).
    // Marca si el producto es original/auténtico o una réplica.
    await sql`ALTER TABLE shoe_products ADD COLUMN IF NOT EXISTS tipo VARCHAR(100)`;
    await sql`ALTER TABLE shoe_products ADD COLUMN IF NOT EXISTS clasificacion_inventario VARCHAR(100) NOT NULL DEFAULT 'Mercancía'`;
    await sql`ALTER TABLE shoe_products ADD COLUMN IF NOT EXISTS es_original BOOLEAN DEFAULT true`;
    // updated_at: para que la app pueda preguntar "¿cambió algo?" con una
    // consulta barata, en vez de tener que volver a descargar todos los
    // productos (con sus fotos) cada vez que revisa si hay novedades.
    await sql`ALTER TABLE shoe_products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()`;

    await sql`ALTER TABLE sales_transactions ADD COLUMN IF NOT EXISTS iva_incluido BOOLEAN DEFAULT FALSE`;
    await sql`ALTER TABLE sales_transactions ADD COLUMN IF NOT EXISTS cliente_correo VARCHAR(150)`;
    await sql`ALTER TABLE sales_transactions ADD COLUMN IF NOT EXISTS notas TEXT`;
    await sql`ALTER TABLE sales_transactions ADD COLUMN IF NOT EXISTS estado VARCHAR(20) DEFAULT 'completada'`;
    await sql`ALTER TABLE sales_transactions ADD COLUMN IF NOT EXISTS motivo_anulacion TEXT`;
    await sql`ALTER TABLE sales_transactions ADD COLUMN IF NOT EXISTS anulada_at TIMESTAMP WITH TIME ZONE`;
    await sql`ALTER TABLE sales_transactions ADD COLUMN IF NOT EXISTS total_positivo_inmediato_usd NUMERIC(12, 2) DEFAULT 0`;
    await sql`ALTER TABLE sales_transactions ADD COLUMN IF NOT EXISTS total_cashea_pendiente_usd NUMERIC(12, 2) DEFAULT 0`;
    await sql`ALTER TABLE sales_transactions ADD COLUMN IF NOT EXISTS estado_cashea VARCHAR(30) DEFAULT 'sin_cashea'`;
    await sql`ALTER TABLE sales_transactions ADD COLUMN IF NOT EXISTS cashea_abonos JSONB DEFAULT '[]'::jsonb`;
    await sql`ALTER TABLE cash_closures ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()`;

    // 4. Table for BDV Verified Payments
    await sql`
      CREATE TABLE IF NOT EXISTS bdv_verifications (
        id VARCHAR(64) PRIMARY KEY,
        referencia VARCHAR(30) NOT NULL,
        telefono_origen VARCHAR(25) NOT NULL,
        cedula_cliente VARCHAR(30) NOT NULL,
        banco_origen VARCHAR(100) NOT NULL,
        monto_bs NUMERIC(14, 2) NOT NULL,
        monto_usd_estimado NUMERIC(12, 2),
        codigo_aprobacion VARCHAR(50),
        estado VARCHAR(30) NOT NULL,
        mensaje VARCHAR(255),
        datos_bdv JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;

    // 5. Table for Expenses (Gastos y Costos Operativos)
    await sql`
      CREATE TABLE IF NOT EXISTS expenses (
        id VARCHAR(64) PRIMARY KEY,
        fecha VARCHAR(20) NOT NULL,
        categoria VARCHAR(100) NOT NULL,
        descripcion TEXT NOT NULL,
        beneficiario VARCHAR(150),
        cuenta_origen VARCHAR(100) NOT NULL,
        moneda VARCHAR(10) NOT NULL,
        monto NUMERIC(14, 2) NOT NULL,
        tasa_cambio NUMERIC(10, 2) NOT NULL,
        monto_usd NUMERIC(12, 2) NOT NULL,
        monto_bs NUMERIC(14, 2) NOT NULL,
        comprobante_ref VARCHAR(80),
        registrado_por VARCHAR(100),
        notas TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;
    await sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()`;
    await sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS foto_factura TEXT`;

    // 5A. Directorio persistente de clientes y proveedores para autocompletar por cédula/RIF.
    await sql`
      CREATE TABLE IF NOT EXISTS business_contacts (
        id VARCHAR(64) PRIMARY KEY,
        tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('cliente','proveedor')),
        documento VARCHAR(80),
        nombre VARCHAR(180) NOT NULL,
        apellido VARCHAR(120),
        telefono VARCHAR(60),
        correo VARCHAR(180),
        direccion TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE (tipo, documento)
      );
    `;
    await sql`CREATE INDEX IF NOT EXISTS business_contacts_name_idx ON business_contacts (tipo, LOWER(nombre))`;

    // 6. Table for Bank Reconciliations (Conciliaciones Bancarias)
    await sql`
      CREATE TABLE IF NOT EXISTS bank_reconciliations (
        id VARCHAR(64) PRIMARY KEY,
        fecha VARCHAR(20) NOT NULL,
        banco VARCHAR(100) NOT NULL,
        tipo VARCHAR(30) NOT NULL,
        referencia VARCHAR(60) NOT NULL,
        descripcion TEXT NOT NULL,
        monto_bs NUMERIC(14, 2) NOT NULL,
        monto_usd NUMERIC(12, 2),
        estado_conciliacion VARCHAR(30) DEFAULT 'pendiente',
        vinculado_tipo VARCHAR(50),
        vinculado_id VARCHAR(64),
        notas TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;
    await sql`ALTER TABLE bank_reconciliations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()`;

    // 7. Table for Layaways (Apartados de Calzado y Abonos)
    await sql`
      CREATE TABLE IF NOT EXISTS layaways (
        id VARCHAR(64) PRIMARY KEY,
        codigo_apartado VARCHAR(50) NOT NULL,
        cliente_nombre VARCHAR(120) NOT NULL,
        cliente_apellido VARCHAR(120),
        cliente_cedula VARCHAR(50),
        cliente_telefono VARCHAR(50),
        items JSONB NOT NULL,
        total_usd NUMERIC(12, 2) NOT NULL,
        total_bs NUMERIC(14, 2) NOT NULL,
        tasa_cambio NUMERIC(10, 2) NOT NULL,
        total_abonado_usd NUMERIC(12, 2) DEFAULT 0,
        total_abonado_bs NUMERIC(14, 2) DEFAULT 0,
        saldo_pendiente_usd NUMERIC(12, 2) DEFAULT 0,
        saldo_pendiente_bs NUMERIC(14, 2) DEFAULT 0,
        abonos JSONB NOT NULL,
        fecha_apartado TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        fecha_vencimiento VARCHAR(30),
        estado VARCHAR(30) DEFAULT 'activo',
        usuario VARCHAR(100),
        notas TEXT,
        cashea_config JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;

    await sql`ALTER TABLE layaways ADD COLUMN IF NOT EXISTS cashea_config JSONB DEFAULT '{}'::jsonb`;


    // 8. Contabilidad: libro diario / mayor y asientos manuales
    await sql`
      CREATE TABLE IF NOT EXISTS accounting_entries (
        id VARCHAR(64) PRIMARY KEY,
        fecha TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        numero_asiento VARCHAR(50),
        tipo VARCHAR(30) DEFAULT 'manual',
        origen VARCHAR(50),
        origen_id VARCHAR(100),
        sujeto VARCHAR(150),
        rif VARCHAR(50),
        documento VARCHAR(80),
        tipo_documento VARCHAR(50),
        metodo_pago VARCHAR(100),
        tasa_dolar NUMERIC(12, 4) DEFAULT 0,
        total_debe NUMERIC(14, 2) DEFAULT 0,
        total_haber NUMERIC(14, 2) DEFAULT 0,
        lineas JSONB NOT NULL,
        libro_compra_venta BOOLEAN DEFAULT FALSE,
        total_compras NUMERIC(14, 2) DEFAULT 0,
        compras_no_gravadas NUMERIC(14, 2) DEFAULT 0,
        compras_gravadas NUMERIC(14, 2) DEFAULT 0,
        porcentaje_impuesto NUMERIC(6, 2) DEFAULT 0,
        ingresos_brutos NUMERIC(14, 2) DEFAULT 0,
        retencion_iva NUMERIC(14, 2) DEFAULT 0,
        retencion_islr NUMERIC(14, 2) DEFAULT 0,
        retencion_municipal NUMERIC(14, 2) DEFAULT 0,
        observaciones TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;
    await sql`ALTER TABLE accounting_entries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()`;
    await sql`CREATE TABLE IF NOT EXISTS accounting_sequences (id INTEGER PRIMARY KEY, last_number INTEGER NOT NULL DEFAULT 0)`;
    await sql`INSERT INTO accounting_sequences (id,last_number) VALUES (1,0) ON CONFLICT (id) DO NOTHING`;
    await sql`
      CREATE TABLE IF NOT EXISTS business_categories (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        kind VARCHAR(20) NOT NULL CHECK (kind IN ('product', 'service')),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE (kind, name)
      );
    `;

    // Las categorías del onboarding se siembran en la base aislada de esta empresa.
    for (const [index, name] of (tenant?.inventoryCategories ?? []).entries()) {
      if (!name.trim()) continue;
      await sql`INSERT INTO business_categories (id, name, kind) VALUES (${`onboarding-${index}-${createHash('sha256').update(name).digest('hex').slice(0, 16)}`}, ${name.trim()}, 'product') ON CONFLICT (kind, name) DO NOTHING`;
    }

    if (tenant?.industryTemplate === 'manufacturing' || tenant?.industryTemplate === 'food_manufacturing') {
      await sql`CREATE TABLE IF NOT EXISTS manufacturing_recipes (
        id VARCHAR(64) PRIMARY KEY, name VARCHAR(180) NOT NULL, output_product_id VARCHAR(64),
        output_quantity NUMERIC(14, 3) NOT NULL DEFAULT 1 CHECK (output_quantity > 0),
        output_unit VARCHAR(40) NOT NULL DEFAULT 'unidad', notes TEXT,
        active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`;
      await sql`CREATE TABLE IF NOT EXISTS manufacturing_recipe_items (
        id VARCHAR(64) PRIMARY KEY, recipe_id VARCHAR(64) NOT NULL REFERENCES manufacturing_recipes(id) ON DELETE CASCADE,
        inventory_product_id VARCHAR(64) NOT NULL, quantity NUMERIC(14, 3) NOT NULL CHECK (quantity > 0),
        unit VARCHAR(40) NOT NULL DEFAULT 'unidad', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`;
      await sql`CREATE INDEX IF NOT EXISTS manufacturing_recipe_items_recipe_idx ON manufacturing_recipe_items (recipe_id)`;
      await sql`CREATE TABLE IF NOT EXISTS manufacturing_lots (
        id VARCHAR(64) PRIMARY KEY, lot_number VARCHAR(80) NOT NULL UNIQUE,
        recipe_id VARCHAR(64) REFERENCES manufacturing_recipes(id) ON DELETE SET NULL,
        output_product_id VARCHAR(64), planned_quantity NUMERIC(14, 3) NOT NULL DEFAULT 0,
        produced_quantity NUMERIC(14, 3) NOT NULL DEFAULT 0, waste_quantity NUMERIC(14, 3) NOT NULL DEFAULT 0,
        status VARCHAR(24) NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_progress','completed','cancelled')),
        started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, expires_at DATE, notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`;
      await sql`CREATE TABLE IF NOT EXISTS manufacturing_consumptions (
        id VARCHAR(64) PRIMARY KEY, lot_id VARCHAR(64) NOT NULL REFERENCES manufacturing_lots(id) ON DELETE CASCADE,
        inventory_product_id VARCHAR(64) NOT NULL, quantity NUMERIC(14, 3) NOT NULL CHECK (quantity > 0),
        unit VARCHAR(40) NOT NULL DEFAULT 'unidad', unit_cost NUMERIC(14, 4) NOT NULL DEFAULT 0,
        consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), notes TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`;
      await sql`CREATE INDEX IF NOT EXISTS manufacturing_consumptions_lot_idx ON manufacturing_consumptions (lot_id)`;
    }


    initializedTenantSchemas.add(schemaKey);
    logger.info('✅ Esquema Neon PostgreSQL verificado e inicializado correctamente.');
  } catch (error) {
    logger.error('Error al inicializar tablas en Neon:', error);
    throw error;
  }
}

// ==========================================
// Ventas (sales_transactions)
// ==========================================

export async function getNextInvoiceNumber(): Promise<string | null> {
  const sql = getNeonSql();
  if (!sql) return null;
  try {
    await initDatabaseSchema();
    const rows = await (sql as any).query(
      `INSERT INTO invoice_sequences (id, last_number, updated_at)
       VALUES ('NEXOSS', 1, NOW())
       ON CONFLICT (id) DO UPDATE SET
         last_number = invoice_sequences.last_number + 1,
         updated_at = NOW()
       RETURNING last_number`,
      []
    );
    const n = Number(rows?.[0]?.last_number) || 1;
    return `MK-${String(n).padStart(6, '0')}`;
  } catch (err) {
    logger.error('Error generando número de factura:', err);
    return null;
  }
}

export async function saveSaleAndDeductStock(sale: any): Promise<{
  ok: boolean;
  alreadySaved?: boolean;
  error?: string;
  updatedProducts?: Array<{ id: string; stock: number }>;
}> {
  const sql = getNeonSql();
  if (!sql) return { ok: false, error: 'Base de datos Neon no configurada.' };
  if (!sale?.id || !Array.isArray(sale.items) || sale.items.length === 0) {
    return { ok: false, error: 'La venta no tiene ID o productos.' };
  }

  try {
    await initDatabaseSchema();
    const result = await (sql as any).query(
      `WITH sale_data AS (
         SELECT $1::jsonb AS sale
       ), item_data AS (
         SELECT
           COALESCE(NULLIF(item->>'producto_id',''), NULL) AS producto_id,
           COALESCE(NULLIF(item->>'sku',''), NULL) AS sku,
           COALESCE(NULLIF(item->>'nombre_producto',''), NULL) AS nombre_producto,
           COALESCE(NULLIF(item->>'talla',''), NULL) AS talla,
           GREATEST(1, COALESCE((item->>'cantidad')::numeric, 1))::integer AS cantidad
         FROM sale_data, jsonb_array_elements(sale->'items') item
       ), matched AS (
         SELECT i.*, p.id AS matched_id, p.stock
         FROM item_data i
         LEFT JOIN LATERAL (
           SELECT id, stock FROM shoe_products p
           WHERE (i.producto_id IS NOT NULL AND p.id = i.producto_id)
              OR (i.sku IS NOT NULL AND lower(p.sku) = lower(i.sku))
              OR (i.nombre_producto IS NOT NULL AND i.talla IS NOT NULL
                  AND lower(p.nombre) = lower(i.nombre_producto) AND p.talla = i.talla)
           ORDER BY CASE WHEN i.producto_id IS NOT NULL AND p.id = i.producto_id THEN 1
                         WHEN i.sku IS NOT NULL AND lower(p.sku) = lower(i.sku) THEN 2 ELSE 3 END
           LIMIT 1
         ) p ON TRUE
       ), validation AS (
         SELECT COUNT(*) AS total_items,
                COUNT(matched_id) AS matched_items,
                COALESCE(BOOL_AND(stock >= cantidad), FALSE) AS enough_stock
         FROM matched
       ), inserted AS (
         INSERT INTO sales_transactions (
           id, numero_factura, cliente_nombre, cliente_apellido, cliente_rif,
           cliente_telefono, cliente_correo, subtotal_usd, descuento_usd, aplica_iva, iva_incluido,
           porcentaje_iva, iva_monto_usd, total_usd, total_bs, costo_total_usd,
           ganancia_neta_usd, tasa_cambio, items, pagos, fecha, usuario, notas, estado,
           total_positivo_inmediato_usd, total_cashea_pendiente_usd, estado_cashea
         )
         SELECT
           sale->>'id', sale->>'numero_factura', COALESCE(sale->>'cliente_nombre',''),
           COALESCE(sale->>'cliente_apellido',''), COALESCE(sale->>'cliente_rif',''),
           COALESCE(sale->>'cliente_telefono',''), COALESCE(sale->>'cliente_correo',''),
           COALESCE((sale->>'subtotal_usd')::numeric,0), COALESCE((sale->>'descuento_usd')::numeric,0),
           COALESCE((sale->>'aplica_iva')::boolean,FALSE), COALESCE((sale->>'iva_incluido')::boolean,FALSE), COALESCE((sale->>'porcentaje_iva')::numeric,0),
           COALESCE((sale->>'iva_monto_usd')::numeric,0), COALESCE((sale->>'total_usd')::numeric,0),
           COALESCE((sale->>'total_bs')::numeric,0), COALESCE((sale->>'costo_total_usd')::numeric,0),
           COALESCE((sale->>'ganancia_neta_usd')::numeric,0), COALESCE((sale->>'tasa_cambio')::numeric,0),
           sale->'items', sale->'pagos', COALESCE(NULLIF(sale->>'fecha','')::timestamptz, NOW()), COALESCE(sale->>'usuario',''),
           COALESCE(sale->>'notas',''), COALESCE(sale->>'estado','completada'),
           COALESCE((sale->>'total_positivo_inmediato_usd')::numeric,0),
           COALESCE((sale->>'total_cashea_pendiente_usd')::numeric,0), COALESCE(sale->>'estado_cashea','sin_cashea')
         FROM sale_data, validation
         WHERE validation.total_items = validation.matched_items
           AND validation.enough_stock
         ON CONFLICT (id) DO NOTHING
         RETURNING id
       ), updated AS (
         UPDATE shoe_products p
         SET stock = p.stock - m.cantidad, updated_at = NOW()
         FROM matched m, inserted ins
         WHERE p.id = m.matched_id
         RETURNING p.id, p.stock
       )
       SELECT
         (SELECT COUNT(*) FROM inserted)::integer AS inserted_count,
         (SELECT COUNT(*) FROM updated)::integer AS updated_count,
         (SELECT COUNT(*) FROM matched)::integer AS total_items,
         (SELECT COUNT(*) FROM matched WHERE matched_id IS NOT NULL)::integer AS matched_items,
         (SELECT COALESCE(BOOL_AND(stock >= cantidad), FALSE) FROM matched) AS enough_stock,
         (SELECT json_agg(json_build_object('id', id, 'stock', stock)) FROM updated) AS updated_products`,
      [JSON.stringify(sale)]
    );

    const row = result?.[0] || {};
    const total = Number(row.total_items) || 0;
    const matched = Number(row.matched_items) || 0;
    const inserted = Number(row.inserted_count) || 0;
    const updated = Number(row.updated_count) || 0;

    if (inserted === 0) {
      const existing = await (sql as any).query(`SELECT id, estado FROM sales_transactions WHERE id = $1`, [sale.id]);
      if (existing?.[0]) return { ok: true, alreadySaved: true, updatedProducts: [] };
    }
    if (total !== matched) return { ok: false, error: 'Uno o más productos de la venta no existen en Neon.' };
    if (!row.enough_stock) return { ok: false, error: 'Stock insuficiente para completar la venta.' };
    if (inserted !== 1 || updated < 1) return { ok: false, error: 'No se pudo registrar la venta y actualizar el inventario.' };
    return { ok: true, updatedProducts: row.updated_products || [] };
  } catch (err) {
    logger.error('Error transaccional venta+inventario:', err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function insertSale(sale: any): Promise<boolean> {
  const sql = getNeonSql();
  if (!sql) return false;
  await sql`
    INSERT INTO sales_transactions (
      id, numero_factura, cliente_nombre, cliente_apellido, cliente_rif,
      cliente_telefono, cliente_correo, subtotal_usd, descuento_usd, aplica_iva, iva_incluido,
      porcentaje_iva, iva_monto_usd, total_usd, total_bs, costo_total_usd,
      ganancia_neta_usd, tasa_cambio, items, pagos, fecha, usuario, notas, estado,
      total_positivo_inmediato_usd, total_cashea_pendiente_usd, estado_cashea
    ) VALUES (
      ${sale.id}, ${sale.numero_factura}, ${sale.cliente_nombre || ''}, ${sale.cliente_apellido || ''},
      ${sale.cliente_rif || ''}, ${sale.cliente_telefono || ''}, ${sale.cliente_correo || ''},
      ${sale.subtotal_usd || 0}, ${sale.descuento_usd || 0}, ${!!sale.aplica_iva}, ${!!sale.iva_incluido},
      ${sale.porcentaje_iva || 0}, ${sale.iva_monto_usd || 0}, ${sale.total_usd || 0},
      ${sale.total_bs || 0}, ${sale.costo_total_usd || 0}, ${sale.ganancia_neta_usd || 0},
      ${sale.tasa_cambio || 0}, ${JSON.stringify(sale.items || [])}, ${JSON.stringify(sale.pagos || [])},
      ${sale.fecha ? new Date(sale.fecha).toISOString() : new Date().toISOString()}, ${sale.usuario || ''}, ${sale.notas || ''},
      ${sale.estado || 'completada'},
      ${sale.total_positivo_inmediato_usd || 0}, ${sale.total_cashea_pendiente_usd || 0},
      ${sale.estado_cashea || 'sin_cashea'}
    )
    ON CONFLICT (id) DO UPDATE SET
      pagos = EXCLUDED.pagos,
      total_positivo_inmediato_usd = EXCLUDED.total_positivo_inmediato_usd,
      total_cashea_pendiente_usd = EXCLUDED.total_cashea_pendiente_usd,
      estado_cashea = EXCLUDED.estado_cashea,
      estado = EXCLUDED.estado,
      fecha = EXCLUDED.fecha,
      notas = EXCLUDED.notas;
  `;
  return true;
}

export async function deductStockForSaleItems(
  items: any[]
): Promise<{
  ok: boolean;
  error?: string;
  updatedProducts?: Array<{ id: string; stock: number }>;
}> {
  const sql = getNeonSql();

  if (!sql) {
    return { ok: false, error: 'Base de datos Neon no configurada.' };
  }

  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: 'La venta no contiene productos.' };
  }

  const updatedProducts: Array<{ id: string; stock: number }> = [];

  for (const item of items) {
    const cantidad = Math.max(1, Number(item?.cantidad) || 1);
    const id = item?.producto_id ? String(item.producto_id).trim() : null;
    const sku = item?.sku ? String(item.sku).trim() : null;
    const nombre = item?.nombre_producto ? String(item.nombre_producto).trim() : null;
    const talla = item?.talla ? String(item.talla).trim() : null;

    if (!id && !sku && !(nombre && talla)) {
      return { ok: false, error: `No se pudo identificar el producto vendido: ${JSON.stringify(item)}` };
    }

    try {
      const rows = await (sql as any).query(
        `
        SELECT id, stock
        FROM shoe_products
        WHERE
          ($1::varchar IS NOT NULL AND id = $1::varchar)
          OR
          ($2::varchar IS NOT NULL AND sku IS NOT NULL AND lower(sku) = lower($2::varchar))
          OR
          (
            $3::varchar IS NOT NULL
            AND $4::varchar IS NOT NULL
            AND lower(nombre) = lower($3::varchar)
            AND talla = $4::varchar
          )
        ORDER BY
          CASE
            WHEN $1::varchar IS NOT NULL AND id = $1::varchar THEN 1
            WHEN $2::varchar IS NOT NULL AND sku IS NOT NULL AND lower(sku) = lower($2::varchar) THEN 2
            ELSE 3
          END
        LIMIT 1
        `,
        [id, sku, nombre, talla]
      );

      const product = rows?.[0];

      if (!product) {
        return {
          ok: false,
          error: `No se encontró en Neon el producto vendido. ID=${id || '-'} SKU=${sku || '-'} Nombre=${nombre || '-'} Talla=${talla || '-'}`,
        };
      }

      const stockActual = Number(product.stock) || 0;
      if (stockActual < cantidad) {
        return {
          ok: false,
          error: `Stock insuficiente para ${nombre || sku || id}. Disponible: ${stockActual}, vendido: ${cantidad}.`,
        };
      }

      const updatedRows = await (sql as any).query(
        `
        UPDATE shoe_products
        SET stock = stock - $1, updated_at = NOW()
        WHERE id = $2
        RETURNING id, stock
        `,
        [cantidad, product.id]
      );

      const updated = updatedRows?.[0];
      if (!updated) {
        return { ok: false, error: `No se pudo actualizar el stock del producto ${product.id}.` };
      }

      updatedProducts.push({ id: String(updated.id), stock: Number(updated.stock) || 0 });
    } catch (err) {
      logger.error('Error descontando stock en Neon para item de venta:', item, err);
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Error desconocido actualizando inventario.',
      };
    }
  }

  return { ok: true, updatedProducts };
}

export async function updateSale(id: string, updates: Record<string, any>): Promise<boolean> {
  const sql = getNeonSql();
  if (!sql) return false;
  const allowed: Record<string, true> = {
    numero_factura: true, fecha: true, notas: true, cliente_nombre: true, cliente_apellido: true,
    cliente_rif: true, cliente_telefono: true, cliente_correo: true,
    pagos: true, total_positivo_inmediato_usd: true, total_cashea_pendiente_usd: true,
    estado_cashea: true, cashea_abonos: true, estado: true, motivo_anulacion: true,
  };
  const keys = Object.keys(updates).filter((k) => allowed[k]);
  if (keys.length === 0) return false;
  if (keys.includes('cashea_abonos')) {
    // Bases creadas antes de esta columna no la tienen: sin ella el abono fallaba en silencio.
    await sql`ALTER TABLE sales_transactions ADD COLUMN IF NOT EXISTS cashea_abonos JSONB DEFAULT '[]'::jsonb`;
  }
  for (const key of keys) {
    const val = typeof updates[key] === 'object' && updates[key] !== null
      ? JSON.stringify(updates[key])
      : updates[key];
    const updated = await (sql as any).query(`UPDATE sales_transactions SET ${key} = $1 WHERE id = $2 RETURNING id`, [val, id]);
    if (!updated?.length) return false;
  }
  return true;
}

// Anular una venta con error: no se borra (se conserva el historial), se
// marca como 'anulada' y el stock de cada producto vendido se restituye.
export async function voidSale(id: string, motivo: string): Promise<{ ok: boolean; items?: any[]; alreadyVoided?: boolean }> {
  const sql = getNeonSql();
  if (!sql) return { ok: false };
  try {
    const result = await (sql as any).query(
      `WITH target AS (
         SELECT id, items, estado FROM sales_transactions WHERE id = $1
       ), item_data AS (
         SELECT
           COALESCE(NULLIF(item->>'producto_id',''), NULL) AS producto_id,
           COALESCE(NULLIF(item->>'sku',''), NULL) AS sku,
           COALESCE(NULLIF(item->>'nombre_producto',''), NULL) AS nombre_producto,
           COALESCE(NULLIF(item->>'talla',''), NULL) AS talla,
           GREATEST(1, COALESCE((item->>'cantidad')::numeric,1))::integer AS cantidad
         FROM target, jsonb_array_elements(COALESCE(target.items,'[]'::jsonb)) item
         WHERE target.estado IS DISTINCT FROM 'anulada'
       ), matched AS (
         SELECT i.*, p.id AS matched_id
         FROM item_data i
         LEFT JOIN LATERAL (
           SELECT id FROM shoe_products p
           WHERE (i.producto_id IS NOT NULL AND p.id = i.producto_id)
              OR (i.sku IS NOT NULL AND lower(p.sku) = lower(i.sku))
              OR (i.nombre_producto IS NOT NULL AND i.talla IS NOT NULL
                  AND lower(p.nombre) = lower(i.nombre_producto) AND p.talla = i.talla)
           ORDER BY CASE WHEN i.producto_id IS NOT NULL AND p.id = i.producto_id THEN 1
                         WHEN i.sku IS NOT NULL AND lower(p.sku) = lower(i.sku) THEN 2 ELSE 3 END
           LIMIT 1
         ) p ON TRUE
       ), grouped AS (
         SELECT matched_id, SUM(cantidad)::integer AS cantidad
         FROM matched WHERE matched_id IS NOT NULL GROUP BY matched_id
       ), restored AS (
         UPDATE shoe_products p
         SET stock = p.stock + g.cantidad, updated_at = NOW()
         FROM grouped g
         WHERE p.id = g.matched_id
         RETURNING p.id, p.stock
       ), marked AS (
         UPDATE sales_transactions s
         SET estado = 'anulada', motivo_anulacion = COALESCE($2,''), anulada_at = NOW()
         WHERE s.id = $1 AND s.estado IS DISTINCT FROM 'anulada'
         RETURNING s.id, s.items
       )
       SELECT
         (SELECT COUNT(*) FROM target)::integer AS found,
         (SELECT estado FROM target LIMIT 1) AS previous_state,
         (SELECT items FROM target LIMIT 1) AS items,
         (SELECT COUNT(*) FROM marked)::integer AS marked_count,
         (SELECT COALESCE(json_agg(json_build_object('id', id, 'stock', stock)), '[]'::json) FROM restored) AS restored_products`,
      [id, motivo || '']
    );
    const row = result?.[0];
    if (!row || Number(row.found) === 0) return { ok: false };
    if (row.previous_state === 'anulada') return { ok: true, alreadyVoided: true, items: row.items || [] };
    if (Number(row.marked_count) !== 1) return { ok: false };
    return { ok: true, items: row.items || [] };
  } catch (err) {
    logger.error('Error anulando venta y restituyendo inventario:', err);
    throw err;
  }
}

// ==========================================
// Cierres de caja / arqueo diario (cash_closures.data)
// ==========================================

export async function getSalesClosures(): Promise<any[]> {
  const sql = getNeonSql();
  if (!sql) return [];
  try {
    const rows = await sql`
      SELECT id, data FROM cash_closures
      WHERE data IS NOT NULL
      ORDER BY fecha DESC, created_at DESC
    `;
    return rows.map((r: any) => ({ ...(r.data || {}), id: r.id }));
  } catch (err) {
    logger.error('Error obteniendo cierres de caja:', err);
    return [];
  }
}

export async function addSalesClosure(closure: any): Promise<boolean> {
  const sql = getNeonSql();
  if (!sql || !closure?.id) return false;
  await sql`
    INSERT INTO cash_closures (
      id, fecha, data, total_ventas_usd, total_ventas_bs, usuario, observaciones, estado
    ) VALUES (
      ${closure.id}, ${closure.fecha || ''}, ${JSON.stringify(closure)},
      ${closure.total_ventas_usd || 0}, ${closure.total_ventas_bs || 0},
      ${closure.usuario || ''}, ${closure.notas || ''}, 'cerrado'
    )
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW();
  `;
  return true;
}

// ==========================================
// Versión ligera del estado de la tienda
// ==========================================
// Consulta MUY barata (no trae fotos ni datos completos) que la app usa
// para preguntar "¿cambió algo desde la última vez?" antes de decidir si
// vale la pena volver a descargar todo (incluidas las fotos de productos).
// Esto es lo que evita que cada revisión automática consuma el ancho de
// banda de re-enviar el catálogo completo una y otra vez sin necesidad.
// Antes esta función juntaba productos, ventas, gastos, etc. en UN solo
// "número de versión". El problema: cada venta nueva (que pasa todo el día,
// muchas veces por hora) cambiaba ese número combinado, así que el "¿cambió
// algo?" casi SIEMPRE decía que sí — y la app terminaba re-descargando TODO
// el catálogo, fotos de productos incluidas, en cada sincronización (cada
// 60 segundos, en cada PC/pestaña abierta). Eso fue lo que agotó el ancho
// de banda gratuito de Render.
//
// Ahora se calcula un número de versión POR SEPARADO para cada cosa
// (productos, ventas, gastos, etc.). Así, una venta nueva solo obliga a
// re-descargar ventas (datos livianos, sin fotos) — el catálogo de
// productos con sus fotos solo se vuelve a bajar cuando un producto de
// verdad cambió.
export interface StoreVersion {
  products: string;
  sales: string;
  expenses: string;
  bankReconciliations: string;
  closures: string;
  layaways: string;
}

export async function getStoreVersion(): Promise<StoreVersion> {
  const sql = getNeonSql();
  const empty: StoreVersion = {
    products: 'no-db', sales: 'no-db', expenses: 'no-db',
    bankReconciliations: 'no-db', closures: 'no-db', layaways: 'no-db',
  };
  if (!sql) return empty;
  try {
    const rows = await sql`
      SELECT
        (SELECT COUNT(*) FROM shoe_products) AS p_count,
        (SELECT COALESCE(EXTRACT(EPOCH FROM MAX(updated_at)), 0) FROM shoe_products) AS p_ts,
        (SELECT COUNT(*) FROM sales_transactions) AS s_count,
        (SELECT COALESCE(EXTRACT(EPOCH FROM MAX(GREATEST(created_at, COALESCE(anulada_at, created_at)))), 0) FROM sales_transactions) AS s_ts,
        (SELECT COUNT(*) FROM expenses) AS e_count,
        (SELECT COALESCE(EXTRACT(EPOCH FROM MAX(updated_at)), 0) FROM expenses) AS e_ts,
        (SELECT COUNT(*) FROM bank_reconciliations) AS b_count,
        (SELECT COALESCE(EXTRACT(EPOCH FROM MAX(updated_at)), 0) FROM bank_reconciliations) AS b_ts,
        (SELECT COUNT(*) FROM cash_closures) AS c_count,
        (SELECT COALESCE(EXTRACT(EPOCH FROM MAX(updated_at)), 0) FROM cash_closures) AS c_ts,
        (SELECT COUNT(*) FROM layaways) AS l_count,
        (SELECT COALESCE(EXTRACT(EPOCH FROM MAX(updated_at)), 0) FROM layaways) AS l_ts
    `;
    const r: any = rows[0] || {};
    return {
      products: `${r.p_count}-${r.p_ts}`,
      sales: `${r.s_count}-${r.s_ts}`,
      expenses: `${r.e_count}-${r.e_ts}`,
      bankReconciliations: `${r.b_count}-${r.b_ts}`,
      closures: `${r.c_count}-${r.c_ts}`,
      layaways: `${r.l_count}-${r.l_ts}`,
    };
  } catch (err) {
    logger.error('Error calculando versión de la tienda:', err);
    return {
      products: 'error', sales: 'error', expenses: 'error',
      bankReconciliations: 'error', closures: 'error', layaways: 'error',
    };
  }
}

export async function getNeonTables(): Promise<{ table_name: string }[]> {
  const sql = getNeonSql();
  if (!sql) return [];
  try {
    const rows = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name ASC;
    `;
    return rows.map((r: any) => ({ table_name: String(r.table_name) }));
  } catch (err) {
    logger.error('Error listando tablas en Neon:', err);
    return [];
  }
}

export async function getNeonTableData(tableName: string, limit = 50): Promise<{
  tableName: string;
  rowCount: number;
  columns: string[];
  rows: any[];
}> {
  const sql = getNeonSql();
  if (!sql) {
    throw new Error('Base de datos Neon no conectada');
  }

  // Sanitize table name (only letters, numbers, underscores)
  const cleanName = tableName.replace(/[^a-zA-Z0-9_]/g, '');
  if (!cleanName) {
    throw new Error('Nombre de tabla inválido');
  }

  try {
    // Fetch columns
    const columnsMeta = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = ${cleanName}
      ORDER BY ordinal_position ASC;
    `;
    const columns = columnsMeta.map((c: any) => String(c.column_name));

    // Fetch count (cleanName is strictly sanitized to [a-zA-Z0-9_])
    const countRes = await (sql as any)(`SELECT COUNT(*) as total FROM "${cleanName}"`);
    const rowCount = Number(countRes[0]?.total || 0);

    // Fetch sample rows
    const safeLimit = Number.isFinite(Number(limit)) ? Math.min(Math.max(Math.trunc(Number(limit)), 1), 200) : 50;
    const rows = await (sql as any)(`SELECT * FROM "${cleanName}" ORDER BY 1 DESC LIMIT ${safeLimit}`);

    return {
      tableName: cleanName,
      rowCount,
      columns,
      rows,
    };
  } catch (err: unknown) {
    logger.error(`Error consultando tabla ${cleanName} en Neon:`, err);
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(msg);
  }
}

// ==========================================
// Contabilidad: Diario / Mayor
// ==========================================

export async function getAccountingManualEntries(start?: string, end?: string) {
  const sql = getNeonSql(); if (!sql) return [];
  await initDatabaseSchema();
  if (start && end) return await sql`SELECT * FROM accounting_entries WHERE fecha >= ${start}::date AND fecha < (${end}::date + INTERVAL '1 day') ORDER BY fecha DESC, created_at DESC`;
  return await sql`SELECT * FROM accounting_entries ORDER BY fecha DESC, created_at DESC`;
}

async function getNextAccountingEntryNumber(sql:any): Promise<string> {
  const r = await sql`UPDATE accounting_sequences SET last_number=last_number+1 WHERE id=1 RETURNING last_number`;
  return `AS-${String(Number(r[0]?.last_number || 1)).padStart(6,'0')}`;
}

export async function saveAccountingEntry(entry: any) {
  const sql = getNeonSql(); if (!sql) throw new Error('Neon no configurado');
  await initDatabaseSchema();
  const lineas = Array.isArray(entry.lineas) ? entry.lineas : [];
  const totalDebe = lineas.reduce((s:any,l:any)=>s+Number(l.debe||0),0);
  const totalHaber = lineas.reduce((s:any,l:any)=>s+Number(l.haber||0),0);
  if (!lineas.length || Math.abs(totalDebe-totalHaber)>0.01) throw new Error('El asiento debe estar cuadrado: Debe = Haber.');
  const id = String(entry.id || `asi-${Date.now()}`);
  if (entry.origen && entry.origen_id) {
    const existing = await sql`SELECT id, numero_asiento, total_debe, total_haber FROM accounting_entries WHERE origen=${String(entry.origen)} AND origen_id=${String(entry.origen_id)} LIMIT 1`;
    if (existing.length) return { id: existing[0].id, numeroAsiento: existing[0].numero_asiento, totalDebe: Number(existing[0].total_debe || 0), totalHaber: Number(existing[0].total_haber || 0), alreadySaved: true };
  }
  const numeroAsiento = String(entry.numero_asiento || await getNextAccountingEntryNumber(sql));
  await sql`INSERT INTO accounting_entries (id,fecha,numero_asiento,tipo,origen,origen_id,sujeto,rif,documento,tipo_documento,metodo_pago,tasa_dolar,total_debe,total_haber,lineas,libro_compra_venta,total_compras,compras_no_gravadas,compras_gravadas,porcentaje_impuesto,ingresos_brutos,retencion_iva,retencion_islr,retencion_municipal,observaciones,updated_at)
    VALUES (${id}, COALESCE(${entry.fecha}::timestamptz,NOW()),${numeroAsiento},${entry.tipo||'manual'},${entry.origen||'manual'},${entry.origen_id||null},${entry.sujeto||null},${entry.rif||null},${entry.documento||null},${entry.tipo_documento||null},${entry.metodo_pago||null},${Number(entry.tasa_dolar||0)},${totalDebe},${totalHaber},${JSON.stringify(lineas)},${!!entry.libro_compra_venta},${Number(entry.total_compras||0)},${Number(entry.compras_no_gravadas||0)},${Number(entry.compras_gravadas||0)},${Number(entry.porcentaje_impuesto||0)},${Number(entry.ingresos_brutos||0)},${Number(entry.retencion_iva||0)},${Number(entry.retencion_islr||0)},${Number(entry.retencion_municipal||0)},${entry.observaciones||null},NOW())
    ON CONFLICT (id) DO UPDATE SET fecha=EXCLUDED.fecha, numero_asiento=EXCLUDED.numero_asiento, tipo=EXCLUDED.tipo, sujeto=EXCLUDED.sujeto, rif=EXCLUDED.rif, documento=EXCLUDED.documento, tipo_documento=EXCLUDED.tipo_documento, metodo_pago=EXCLUDED.metodo_pago, tasa_dolar=EXCLUDED.tasa_dolar,total_debe=EXCLUDED.total_debe,total_haber=EXCLUDED.total_haber,lineas=EXCLUDED.lineas,libro_compra_venta=EXCLUDED.libro_compra_venta,total_compras=EXCLUDED.total_compras,compras_no_gravadas=EXCLUDED.compras_no_gravadas,compras_gravadas=EXCLUDED.compras_gravadas,porcentaje_impuesto=EXCLUDED.porcentaje_impuesto,ingresos_brutos=EXCLUDED.ingresos_brutos,retencion_iva=EXCLUDED.retencion_iva,retencion_islr=EXCLUDED.retencion_islr,retencion_municipal=EXCLUDED.retencion_municipal,observaciones=EXCLUDED.observaciones,updated_at=NOW()`;
  return {id,totalDebe,totalHaber};
}

export async function deleteAccountingEntry(id:string) { const sql=getNeonSql(); if(!sql) throw new Error('Neon no configurado'); await sql`DELETE FROM accounting_entries WHERE id=${id}`; }

export async function getAccountingLedger(start?:string,end?:string) {
  const sql=getNeonSql(); if(!sql) return {entries:[], ledger:[]};
  await initDatabaseSchema();
  const manual = await getAccountingManualEntries(start,end);
  const sales = start&&end ? await sql`SELECT * FROM sales_transactions WHERE fecha::text::timestamptz >= ${start}::date AND fecha::text::timestamptz < (${end}::date + INTERVAL '1 day') AND COALESCE(estado,'completada') <> 'anulada' ORDER BY fecha` : await sql`SELECT * FROM sales_transactions WHERE COALESCE(estado,'completada') <> 'anulada' ORDER BY fecha`;
  const expenses = start&&end ? await sql`SELECT * FROM expenses WHERE fecha::text::timestamptz >= ${start}::date AND fecha::text::timestamptz < (${end}::date + INTERVAL '1 day') ORDER BY fecha` : await sql`SELECT * FROM expenses ORDER BY fecha`;
  const entries:any[] = [];
  const enrichLine=(l:any, partida='01', ventaCompra='Venta')=>({partida,subcuenta:l.subcuenta||'',subclasificacion:l.subclasificacion||'',moneda:l.moneda||'USD',venta_compra:l.venta_compra||ventaCompra,...l});
  for(const s of sales as any[]){
    const total=Number(s.total_usd||0), iva=Number(s.iva_monto_usd||0), net=Math.max(0,total-iva), cost=Number(s.costo_total_usd||0);
    const pays=Array.isArray(s.pagos)?s.pagos:[]; const lineas:any[]=[];
    for(const pay of pays){ const a=String(pay.cuenta||'Caja / Banco'); const amt=Number(pay.monto_equivalente_usd||0); if(amt<=0) continue; lineas.push({cuenta: pay.estado_liquidacion==='pendiente_banco' || a==='Cashea' ? 'Cuentas por Cobrar - Cashea' : a, debe:amt, haber:0, clasificacion:'Activo'}); }
    lineas.push({cuenta:'Ventas de Mercancía',debe:0,haber:net,clasificacion:'Ingreso'}); if(iva>0) lineas.push({cuenta:'IVA Débito Fiscal',debe:0,haber:iva,clasificacion:'Pasivo'}); if(cost>0){lineas.push({cuenta:'Costo de Mercancía Vendida',debe:cost,haber:0,clasificacion:'Costo'});lineas.push({cuenta:'Inventario de Mercancía',debe:0,haber:cost,clasificacion:'Activo'});}
    lineas.forEach((l:any)=>{ if(!l.clasificacion) l.clasificacion=/Ventas/.test(l.cuenta)?'Ingreso':/IVA/.test(l.cuenta)?'Pasivo':/Costo/.test(l.cuenta)?'Costo':/Inventario|Caja|Banco|Cobrar/.test(l.cuenta)?'Activo':'General'; });
    const enrichedLineas=lineas.map((l:any)=>enrichLine(l,'01','Venta'));
    entries.push({id:`venta-${s.id}`,fecha:s.fecha,numero_asiento:`V-${s.numero_factura||s.id}`,tipo:'venta',origen:'venta',origen_id:s.id,documento:s.numero_factura,tipo_documento:'Factura',sujeto:`${s.cliente_nombre||''} ${s.cliente_apellido||''}`.trim(),rif:s.cliente_rif||'',tasa_dolar:Number(s.tasa_cambio||0),lineas:enrichedLineas});
  }
  // Los gastos se reflejan automáticamente en Diario y Mayor desde el registro original.
  // Cada asiento conserva la moneda del gasto y la de la cuenta pagadora; ambos importes
  // se convierten a la moneda funcional usando la tasa histórica del propio gasto.
  for(const e of expenses as any[]){
    const tasa=Number(e.tasa_cambio||0);
    const monedaGasto=String(e.moneda||'USD').toUpperCase()==='BS'?'Bs':'USD';
    const montoOriginal=Number(e.monto|| (monedaGasto==='Bs'?e.monto_bs:e.monto_usd) || 0);
    const montoBs=Number(e.monto_bs|| (monedaGasto==='Bs'?montoOriginal:montoOriginal*tasa) || 0);
    const montoUsd=Number(e.monto_usd|| (monedaGasto==='USD'?montoOriginal:(tasa>0?montoOriginal/tasa:0)) || 0);
    if(montoOriginal<=0 || (monedaGasto==='USD' && tasa<=0 && !Number(e.monto_usd))) continue;
    const cuentaOrigen=String(e.cuenta_origen||'Caja / Banco');
    const origenLower=cuentaOrigen.toLowerCase();
    const cuentaPagoEsBs=/(^|[^a-z])bs([^a-z]|$)|bol[ií]var|pago\s*m[oó]vil|punto\s*de\s*venta|bdv|venezuela|mercantil|banesco|banco/i.test(origenLower) && !/(usd|d[oó]lar|zelle|binance)/i.test(origenLower);
    const monedaPago=cuentaPagoEsBs?'Bs':'USD';
    const montoPago=monedaPago==='Bs'?montoBs:montoUsd;
    // Norma Patentadoc: Partida Egresos > Cuenta Gastos > subcuenta (la descripción va en la glosa).
    const subcuentaGasto=normalizeExpenseCategory(e.categoria);
    const glosa=[e.descripcion,e.notas].filter(Boolean).join(' — ');
    entries.push({
      id:`gasto-${e.id}`,fecha:e.fecha,numero_asiento:`G-${e.id}`,tipo:'gasto',origen:'gasto',origen_id:e.id,
      documento:e.comprobante_ref||e.id,tipo_documento:'Comprobante de Gasto',sujeto:e.beneficiario||'',
      metodo_pago:cuentaOrigen,tasa_dolar:tasa,observaciones:glosa,
      lineas:[
        enrichLine({cuenta:EXPENSE_CUENTA,subcuenta:subcuentaGasto,debe:montoOriginal,haber:0,moneda:monedaGasto,clasificacion:'Gasto'},EXPENSE_PARTIDA,'Gasto'),
        enrichLine({cuenta:cuentaOrigen,debe:0,haber:montoPago,moneda:monedaPago,clasificacion:'Activo'},'02','Gasto')
      ]
    });
  }
  for(const m of manual as any[]){ let parsedLines:any[]=[]; try { parsedLines=Array.isArray(m.lineas)?m.lineas:(typeof m.lineas==='string'?JSON.parse(m.lineas||'[]'):[]); } catch { parsedLines=[]; } entries.push({...m,lineas:Array.isArray(parsedLines)?parsedLines:[]}); }
  const ledgerMap:any={}; for(const en of entries){ for(const l of en.lineas||[]){const k=l.cuenta||'Sin cuenta'; if(!ledgerMap[k]) ledgerMap[k]={cuenta:k,debe:0,haber:0,movimientos:[]}; ledgerMap[k].debe+=Number(l.debe||0); ledgerMap[k].haber+=Number(l.haber||0); ledgerMap[k].movimientos.push({...l,fecha:en.fecha,documento:en.documento,numero_asiento:en.numero_asiento,origen:en.origen});}}
  return {entries:entries.sort((a,b)=>new Date(b.fecha).getTime()-new Date(a.fecha).getTime()),ledger:Object.values(ledgerMap).map((x:any)=>({...x,saldo:x.debe-x.haber})).sort((a:any,b:any)=>a.cuenta.localeCompare(b.cuenta))};
}

// ==========================================
// Apartados de Calzado (layaways)
// ==========================================

export async function getLayawaysFromDb(): Promise<any[]> {
  const sql = getNeonSql();
  if (!sql) return [];
  await initDatabaseSchema();
  const rows = await sql`SELECT * FROM layaways ORDER BY fecha_apartado DESC`;
  return normalizeLayaways(rows as any[]);
}

export async function reserveStockAndSaveLayaway(layaway: any): Promise<{ ok: boolean; alreadySaved?: boolean; error?: string }> {
  const sql = getNeonSql();
  if (!sql || !layaway?.id || !Array.isArray(layaway.items) || layaway.items.length === 0) {
    return { ok: false, error: 'Apartado inválido o base de datos no configurada.' };
  }
  try {
    await initDatabaseSchema();
    const result = await (sql as any).query(
      `WITH layaway_data AS (
         SELECT $1::jsonb AS data
       ), item_data AS (
         SELECT
           COALESCE(NULLIF(item->>'producto_id',''), NULL) AS producto_id,
           COALESCE(NULLIF(item->>'sku',''), NULL) AS sku,
           COALESCE(NULLIF(item->>'nombre_producto',''), NULL) AS nombre_producto,
           COALESCE(NULLIF(item->>'talla',''), NULL) AS talla,
           GREATEST(1, COALESCE((item->>'cantidad')::numeric,1))::integer AS cantidad
         FROM layaway_data, jsonb_array_elements(data->'items') item
       ), matched AS (
         SELECT i.*, p.id AS matched_id, p.stock
         FROM item_data i
         LEFT JOIN LATERAL (
           SELECT id, stock FROM shoe_products p
           WHERE (i.producto_id IS NOT NULL AND p.id = i.producto_id)
              OR (i.sku IS NOT NULL AND lower(p.sku) = lower(i.sku))
              OR (i.nombre_producto IS NOT NULL AND i.talla IS NOT NULL
                  AND lower(p.nombre) = lower(i.nombre_producto) AND p.talla = i.talla)
           ORDER BY CASE WHEN i.producto_id IS NOT NULL AND p.id = i.producto_id THEN 1
                         WHEN i.sku IS NOT NULL AND lower(p.sku) = lower(i.sku) THEN 2 ELSE 3 END
           LIMIT 1
         ) p ON TRUE
       ), validation AS (
         SELECT COUNT(*) AS total_items, COUNT(matched_id) AS matched_items,
                COALESCE(BOOL_AND(stock >= cantidad), FALSE) AS enough_stock
         FROM matched
       ), inserted AS (
         INSERT INTO layaways (
           id, codigo_apartado, cliente_nombre, cliente_apellido, cliente_cedula, cliente_telefono,
           items, total_usd, total_bs, tasa_cambio, total_abonado_usd, total_abonado_bs,
           saldo_pendiente_usd, saldo_pendiente_bs, abonos, fecha_apartado, fecha_vencimiento,
           estado, usuario, notas, cashea_config
         )
         SELECT
           data->>'id', data->>'codigo_apartado', COALESCE(data->>'cliente_nombre',''),
           COALESCE(data->>'cliente_apellido',''), COALESCE(data->>'cliente_cedula',''),
           COALESCE(data->>'cliente_telefono',''), data->'items',
           COALESCE((data->>'total_usd')::numeric,0), COALESCE((data->>'total_bs')::numeric,0),
           COALESCE((data->>'tasa_cambio')::numeric,0), COALESCE((data->>'total_abonado_usd')::numeric,0),
           COALESCE((data->>'total_abonado_bs')::numeric,0), COALESCE((data->>'saldo_pendiente_usd')::numeric,0),
           COALESCE((data->>'saldo_pendiente_bs')::numeric,0), COALESCE(data->'abonos','[]'::jsonb),
           COALESCE((data->>'fecha_apartado')::timestamptz,NOW()), COALESCE(data->>'fecha_vencimiento',''),
           COALESCE(data->>'estado','activo'), COALESCE(data->>'usuario',''), COALESCE(data->>'notas',''), COALESCE(data->'cashea','{}'::jsonb)
         FROM layaway_data, validation
         WHERE validation.total_items = validation.matched_items AND validation.enough_stock
         ON CONFLICT (id) DO NOTHING
         RETURNING id
       ), grouped AS (
         SELECT matched_id, SUM(cantidad)::integer AS cantidad
         FROM matched WHERE matched_id IS NOT NULL GROUP BY matched_id
       ), updated AS (
         UPDATE shoe_products p
         SET stock = p.stock - g.cantidad, updated_at = NOW()
         FROM grouped g, inserted ins
         WHERE p.id = g.matched_id
         RETURNING p.id
       )
       SELECT
         (SELECT COUNT(*) FROM inserted)::integer AS inserted_count,
         (SELECT COUNT(*) FROM updated)::integer AS updated_count,
         (SELECT COUNT(*) FROM matched)::integer AS total_items,
         (SELECT COUNT(*) FROM matched WHERE matched_id IS NOT NULL)::integer AS matched_items,
         (SELECT COALESCE(BOOL_AND(stock >= cantidad), FALSE) FROM matched) AS enough_stock`,
      [JSON.stringify(layaway)]
    );
    const row=result?.[0]||{};
    if (Number(row.inserted_count)===0) {
      const existing=await (sql as any).query(`SELECT id FROM layaways WHERE id=$1`,[layaway.id]);
      if(existing?.[0]) return {ok:true,alreadySaved:true};
    }
    if(Number(row.total_items)!==Number(row.matched_items)) return {ok:false,error:'Uno o más productos del apartado no existen en Neon.'};
    if(!row.enough_stock) return {ok:false,error:'Stock insuficiente para reservar el apartado.'};
    if(Number(row.inserted_count)!==1 || Number(row.updated_count)<1) return {ok:false,error:'No se pudo guardar el apartado y reservar el inventario.'};
    return {ok:true};
  } catch(err) {
    logger.error('Error reservando stock y guardando apartado:',err);
    return {ok:false,error:err instanceof Error?err.message:String(err)};
  }
}

export async function saveLayawayToDb(layaway: any): Promise<boolean> {
  const sql = getNeonSql();
  if (!sql || !layaway || !layaway.id) return false;
  try {
    await initDatabaseSchema();
    await sql`
      INSERT INTO layaways (
        id, codigo_apartado, cliente_nombre, cliente_apellido, cliente_cedula,
        cliente_telefono, items, total_usd, total_bs, tasa_cambio,
        total_abonado_usd, total_abonado_bs, saldo_pendiente_usd, saldo_pendiente_bs,
        abonos, fecha_apartado, fecha_vencimiento, estado, usuario, notas, cashea_config
      ) VALUES (
        ${layaway.id}, ${layaway.codigo_apartado || ''}, ${layaway.cliente_nombre || ''},
        ${layaway.cliente_apellido || ''}, ${layaway.cliente_cedula || ''},
        ${layaway.cliente_telefono || ''}, ${JSON.stringify(layaway.items || [])},
        ${layaway.total_usd || 0}, ${layaway.total_bs || 0}, ${layaway.tasa_cambio || 0},
        ${layaway.total_abonado_usd || 0}, ${layaway.total_abonado_bs || 0},
        ${layaway.saldo_pendiente_usd || 0}, ${layaway.saldo_pendiente_bs || 0},
        ${JSON.stringify(layaway.abonos || [])},
        ${layaway.fecha_apartado || new Date().toISOString()},
        ${layaway.fecha_vencimiento || ''}, ${layaway.estado || 'activo'},
        ${layaway.usuario || ''}, ${layaway.notas || ''}, ${JSON.stringify(layaway.cashea || {})}
      )
      ON CONFLICT (id) DO UPDATE SET
        total_abonado_usd = EXCLUDED.total_abonado_usd,
        total_abonado_bs = EXCLUDED.total_abonado_bs,
        saldo_pendiente_usd = EXCLUDED.saldo_pendiente_usd,
        saldo_pendiente_bs = EXCLUDED.saldo_pendiente_bs,
        abonos = EXCLUDED.abonos,
        estado = EXCLUDED.estado,
        notas = EXCLUDED.notas,
        cashea_config = EXCLUDED.cashea_config,
        updated_at = NOW();
    `;
    return true;
  } catch (err) {
    logger.error('Error al guardar apartado en Neon:', err);
    return false;
  }
}

export async function deleteLayawayFromDb(id: string): Promise<boolean> {
  const sql = getNeonSql();
  if (!sql) return false;
  try {
    await sql`DELETE FROM layaways WHERE id = ${id}`;
    return true;
  } catch (err) {
    logger.error('Error al eliminar apartado de Neon:', err);
    return false;
  }
}

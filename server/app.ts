// OBSOLETO: app heredada sin autenticación ni empresa. Ya no la importa api/index.ts.
// No montarla en ningún servidor; se conserva solo porque scripts/audit-multiempresa-readiness.mjs la lee.
import express from 'express';
import {
  getNeonSql,
  initDatabaseSchema,
  getDailyClosures,
  addDailyClosure,
  replaceDailyClosures,
  normalizeProducts,
  normalizeSales,
  normalizeExpenses,
  normalizeBankReconciliations,
  insertSale,
  deductStockForSaleItems,
  saveSaleAndDeductStock,
  getNextInvoiceNumber,
  updateSale,
  voidSale,
  getSalesClosures,
  addSalesClosure,
  getLayawaysFromDb,
  saveLayawayToDb,
  reserveStockAndSaveLayaway,
  getAccountingLedger,
  saveAccountingEntry,
  deleteAccountingEntry,
} from './db.js';
import { analyzeShoeImage } from './shoeAi.js';
import { analyzeReceiptImage } from './receiptAi.js';

export const app = express();
// límite ampliado: las fotos del escáner de calzado llegan como base64 (~1-4mb)
app.use(express.json({ limit: '12mb' }));

// API: Escáner de calzado con IA (Gemini Vision)
const handleShoeAnalysis = async (req: express.Request, res: express.Response) => {
  try {
    const { imageBase64, userHint } = req.body || {};
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({ error: 'No se recibió ninguna imagen.' });
    }
    const result = await analyzeShoeImage(imageBase64, userHint);
    res.json(result);
  } catch (error: any) {
    console.error('Error al analizar el zapato con Gemini:', error);
    res.status(500).json({
      error: error?.message || 'No se pudo analizar la imagen con IA.',
    });
  }
};
app.post('/api/ai/analyze-shoe', handleShoeAnalysis);
app.post('/api/analyze-shoe', handleShoeAnalysis);

// API: Escáner de facturas / comprobantes de gastos con IA (Gemini Vision with Lite/Flash Fallbacks)
const handleReceiptAnalysis = async (req: express.Request, res: express.Response) => {
  try {
    const { imageBase64, exchangeRate, historicalRates } = req.body || {};
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({ error: 'No se recibió ninguna imagen de la factura.' });
    }
    const rate = Number(exchangeRate) > 0 ? Number(exchangeRate) : 1;
    const result = await analyzeReceiptImage(imageBase64, rate, historicalRates);
    res.json(result);
  } catch (error: any) {
    console.error('Error al escanear la factura con Gemini:', error);
    const msg = error?.message || String(error);
    let cleanError = msg;
    if (msg.includes('503') || msg.includes('high demand') || msg.includes('UNAVAILABLE')) {
      cleanError = 'Los servidores de IA están saturados temporalmente por alta demanda. Por favor, pulsa "Reintentar" o completa los campos manualmente con la foto.';
    } else if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
      cleanError = 'Límite de solicitudes momentáneo. Espera unos segundos y pulsa "Reintentar".';
    }
    res.status(500).json({
      error: cleanError,
    });
  }
};
app.post('/api/expenses/scan-receipt', handleReceiptAnalysis);
app.post('/api/ai/scan-receipt', handleReceiptAnalysis);

// API Store State
app.get('/api/store/state', async (_req, res) => {
  const sql = getNeonSql();
  if (sql) {
    try {
      await initDatabaseSchema();
      const [products, sales, expenses, reconciliations, closures, layaways] = await Promise.all([
        sql`SELECT * FROM shoe_products ORDER BY nombre ASC`,
        sql`SELECT * FROM sales_transactions ORDER BY fecha DESC`,
        sql`SELECT * FROM expenses ORDER BY fecha DESC, created_at DESC`,
        sql`SELECT * FROM bank_reconciliations ORDER BY fecha DESC, created_at DESC`,
        getSalesClosures(),
        getLayawaysFromDb(),
      ]);

      return res.json({
        success: true,
        source: 'neon_postgres',
        data: {
          products: normalizeProducts(products as any[]),
          sales: normalizeSales(sales as any[]),
          movements: [],
          cashClosures: closures,
          expenses: normalizeExpenses(expenses as any[]),
          accounts: [],
          bankMovements: normalizeBankReconciliations(reconciliations as any[]),
          layaways,
        },
      });
    } catch (err) {
      console.error('Error al sincronizar estado de Neon:', err);
      return res.status(503).json({
        success: false,
        source: 'neon_error',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return res.status(503).json({
    success: false,
    source: 'no_database_configured',
    error: 'DATABASE_URL no configurada en Vercel.',
  });
});

// Apartados de calzado
app.get('/api/layaways', async (_req, res) => {
  const sql = getNeonSql();
  if (!sql) return res.status(503).json({ source: 'no_database_configured', error: 'DATABASE_URL no configurada.', data: [] });
  try {
    const data = await getLayawaysFromDb();
    return res.json({ source: 'neon_postgres', data });
  } catch (err) {
    console.error('Error leyendo apartados en Neon:', err);
    return res.status(503).json({ source: 'neon_error', error: 'No se pudieron leer los apartados.', data: [] });
  }
});

app.post('/api/layaways', async (req, res) => {
  const sql = getNeonSql();
  if (!sql) return res.status(503).json({ saved: false, error: 'DATABASE_URL no configurada.' });
  try {
    const layaway = req.body;
    if (!layaway?.id || !Array.isArray(layaway.items)) {
      return res.status(400).json({ saved: false, error: 'Apartado inválido.' });
    }
    await initDatabaseSchema();
    const result = await reserveStockAndSaveLayaway(layaway);
    if (!result.ok) return res.status(400).json({ saved: false, error: result.error || 'No se pudo guardar el apartado.' });
    return res.json({ saved: true, alreadySaved: !!result.alreadySaved, id: layaway.id });
  } catch (err) {
    console.error('Error guardando apartado en Neon:', err);
    return res.status(500).json({ saved: false, error: err instanceof Error ? err.message : String(err) });
  }
});

app.put('/api/layaways/:id', async (req, res) => {
  const sql = getNeonSql();
  if (!sql) return res.status(503).json({ updated: false, error: 'DATABASE_URL no configurada.' });
  try {
    const id = req.params.id;
    const layaway = { ...(req.body || {}), id };
    const ok = await saveLayawayToDb(layaway);
    return res.json({ updated: ok, id });
  } catch (err) {
    console.error('Error actualizando apartado en Neon:', err);
    return res.status(500).json({ updated: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// Products
app.get('/api/products', async (_req, res) => {
  const sql = getNeonSql();
  if (sql) {
    try {
      const rows = await sql`SELECT * FROM shoe_products ORDER BY nombre ASC`;
      return res.json({ source: 'neon_postgres', data: normalizeProducts(rows as any[]) });
    } catch (err) {
      console.error('Neon products fetch error:', err);
    }
  }
  res.json({ source: 'local_fallback', data: [] });
});

// Guardar (crear o actualizar) un producto individual
app.post('/api/products', async (req, res) => {
  const p = req.body;
  if (!p || !p.id) {
    return res.status(400).json({ saved: false, error: 'Datos de producto inválidos' });
  }

  const sql = getNeonSql();
  if (!sql) {
    return res.status(503).json({
      saved: false,
      error: 'DATABASE_URL no configurada en Vercel: no se puede persistir el producto.',
    });
  }

  try {
    await initDatabaseSchema();
    await sql`
      INSERT INTO shoe_products (
        id, nombre, marca, modelo, tipo, color, genero, categoria, clasificacion_inventario,
        talla, sku, precio, costo, stock, stock_minimo, stock_maximo,
        imagen_url, ubicacion, descripcion, es_original
      ) VALUES (
        ${p.id}, ${p.nombre}, ${p.marca}, ${p.modelo || ''}, ${p.tipo || p.modelo || 'Otros'}, ${p.color || ''},
        ${p.genero || 'Unisex'}, ${p.categoria || 'Casual'}, ${p.clasificacion_inventario || 'Mercancía'}, ${p.talla || 'Única'}, ${p.sku || `SKU-${p.id}`},
        ${Number(p.precio) || 0}, ${Number(p.costo) || 0}, ${Number(p.stock) || 0}, ${p.stock_minimo || 3}, ${p.stock_maximo || 30},
        ${p.imagen_url || p.imagen || null}, ${p.ubicacion || 'Almacén'}, ${p.descripcion || ''},
        ${p.es_original !== false}
      )
      ON CONFLICT (id) DO UPDATE SET
        nombre = EXCLUDED.nombre,
        marca = EXCLUDED.marca,
        modelo = EXCLUDED.modelo,
        tipo = EXCLUDED.tipo,
        color = EXCLUDED.color,
        genero = EXCLUDED.genero,
        categoria = EXCLUDED.categoria,
        clasificacion_inventario = EXCLUDED.clasificacion_inventario,
        talla = EXCLUDED.talla,
        sku = EXCLUDED.sku,
        precio = EXCLUDED.precio,
        costo = EXCLUDED.costo,
        stock = EXCLUDED.stock,
        stock_minimo = EXCLUDED.stock_minimo,
        stock_maximo = EXCLUDED.stock_maximo,
        imagen_url = EXCLUDED.imagen_url,
        ubicacion = EXCLUDED.ubicacion,
        descripcion = EXCLUDED.descripcion,
        es_original = EXCLUDED.es_original,
        updated_at = NOW();
    `;
    res.json({ saved: true, id: p.id, product: p });
  } catch (err) {
    console.error('Error guardando producto en Neon:', err);
    res.status(500).json({ saved: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// Eliminar un producto
app.delete('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  const sql = getNeonSql();
  if (!sql) {
    return res.status(503).json({ success: false, error: 'DATABASE_URL no configurada en Vercel.' });
  }
  try {
    await sql`DELETE FROM shoe_products WHERE id = ${id}`;
    res.json({ success: true, id });
  } catch (err) {
    console.error('Error eliminando producto en Neon:', err);
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// Importación / carga masiva de productos (Excel, o crear modelo multi-talla)
app.post('/api/products/bulk', async (req, res) => {
  const { products, replaceExisting } = req.body || {};
  if (!Array.isArray(products)) {
    return res.status(400).json({ success: false, error: 'Se esperaba un arreglo de productos' });
  }

  const sql = getNeonSql();
  if (!sql) {
    return res.status(503).json({ success: false, error: 'DATABASE_URL no configurada en Vercel.' });
  }

  try {
    await initDatabaseSchema();
    if (replaceExisting) {
      await sql`DELETE FROM shoe_products`;
    }
    for (const p of products) {
      await sql`
        INSERT INTO shoe_products (
          id, nombre, marca, modelo, tipo, color, genero, categoria, clasificacion_inventario,
          talla, sku, precio, costo, stock, stock_minimo, stock_maximo,
          imagen_url, ubicacion, descripcion
        ) VALUES (
          ${p.id}, ${p.nombre}, ${p.marca}, ${p.modelo || ''}, ${p.tipo || p.modelo || 'Otros'}, ${p.color || ''},
          ${p.genero || 'Unisex'}, ${p.categoria || 'Casual'}, ${p.clasificacion_inventario || 'Mercancía'}, ${p.talla || 'Única'}, ${p.sku || `SKU-${p.id}`},
          ${Number(p.precio) || 0}, ${Number(p.costo) || 0}, ${Number(p.stock) || 0}, ${p.stock_minimo || 3}, ${p.stock_maximo || 30},
          ${p.imagen_url || p.imagen || null}, ${p.ubicacion || 'Almacén'}, ${p.descripcion || ''}
        )
        ON CONFLICT (id) DO UPDATE SET
          nombre = EXCLUDED.nombre,
          marca = EXCLUDED.marca,
          modelo = EXCLUDED.modelo,
          tipo = EXCLUDED.tipo,
          color = EXCLUDED.color,
          genero = EXCLUDED.genero,
          categoria = EXCLUDED.categoria,
          clasificacion_inventario = EXCLUDED.clasificacion_inventario,
          talla = EXCLUDED.talla,
          sku = EXCLUDED.sku,
          precio = EXCLUDED.precio,
          costo = EXCLUDED.costo,
          stock = EXCLUDED.stock,
          stock_minimo = EXCLUDED.stock_minimo,
          stock_maximo = EXCLUDED.stock_maximo,
          imagen_url = EXCLUDED.imagen_url,
          ubicacion = EXCLUDED.ubicacion,
          descripcion = EXCLUDED.descripcion;
      `;
    }
    res.json({ success: true, count: products.length });
  } catch (err) {
    console.error('Error en importación masiva a Neon:', err);
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// Sales
app.get('/api/sales', async (_req, res) => {
  const sql = getNeonSql();
  if (sql) {
    try {
      const rows = await sql`SELECT * FROM sales_transactions ORDER BY fecha DESC`;
      return res.json({ source: 'neon_postgres', data: normalizeSales(rows as any[]) });
    } catch (err) {
      console.error('Neon sales fetch error:', err);
      return res.status(503).json({ source: 'neon_error', error: 'No se pudo leer ventas. Tus datos no se borraron.', data: [] });
    }
  }
  res.status(503).json({ source: 'no_database_configured', error: 'DATABASE_URL no configurada.', data: [] });
});

// Crear una nueva venta (se llama justo al completar la venta en el POS)
app.post('/api/invoices/next', async (_req, res) => {
  const sql = getNeonSql();
  if (!sql) return res.status(503).json({ error: 'DATABASE_URL no configurada en Vercel.' });
  try {
    const numero = await getNextInvoiceNumber();
    if (!numero) return res.status(500).json({ error: 'No se pudo generar el número de factura.' });
    res.json({ numero_factura: numero });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post('/api/sales', async (req, res) => {
  const sale = req.body?.sale || req.body;

  if (!sale || !sale.id || !Array.isArray(sale.items)) {
    return res.status(400).json({
      saved: false,
      error: 'Datos de venta inválidos: faltan id o items.',
    });
  }

  const sql = getNeonSql();
  if (!sql) {
    return res.status(503).json({
      saved: false,
      error: 'DATABASE_URL no configurada en Vercel: la venta no se guardó en el servidor.',
    });
  }

  try {
    await initDatabaseSchema();

    const saleResult = await saveSaleAndDeductStock(sale);
    if (!saleResult.ok) {
      throw new Error(saleResult.error || 'No se pudo registrar la venta y actualizar el inventario.');
    }

    return res.json({
      saved: true,
      alreadySaved: !!saleResult.alreadySaved,
      id: sale.id,
      stockUpdated: !saleResult.alreadySaved,
      updatedProducts: saleResult.updatedProducts || [],
    });
  } catch (err) {
    console.error('Error guardando venta en Neon:', err);
    return res.status(500).json({
      saved: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// Editar datos de una venta ya registrada (ej. corregir fecha, datos del cliente, notas)
app.patch('/api/sales/:id', async (req, res) => {
  const { id } = req.params;
  const sql = getNeonSql();
  if (!sql) {
    return res.status(503).json({ updated: false, error: 'DATABASE_URL no configurada en Vercel.' });
  }
  try {
    const ok = await updateSale(id, req.body || {});
    res.json({ updated: ok, id });
  } catch (err) {
    console.error('Error actualizando venta en Neon:', err);
    res.status(500).json({ updated: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// Anular una venta con error (no se borra: queda marcada como 'anulada' y
// se conserva en el historial; el stock vendido se devuelve al inventario)
app.post('/api/sales/:id/void', async (req, res) => {
  const { id } = req.params;
  const { motivo } = req.body || {};
  const sql = getNeonSql();
  if (!sql) {
    return res.status(503).json({ success: false, error: 'DATABASE_URL no configurada en Vercel.' });
  }
  try {
    const result = await voidSale(id, motivo || '');
    if (!result.ok) {
      return res.status(404).json({ success: false, error: 'Venta no encontrada.' });
    }
    res.json({ success: true, id, items: result.items });
  } catch (err) {
    console.error('Error anulando venta en Neon:', err);
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// Cierres de caja / arqueo diario
app.get('/api/closures', async (_req, res) => {
  const sql = getNeonSql();
  if (!sql) {
    return res.status(503).json({ source: 'no_database_configured', error: 'DATABASE_URL no configurada.', data: [] });
  }
  try {
    const closures = await getSalesClosures();
    res.json({ source: 'neon_postgres', data: closures });
  } catch (err) {
    console.error('Error leyendo cierres de caja de Neon:', err);
    res.status(503).json({ source: 'neon_error', error: 'No se pudo leer el arqueo de caja. Tus datos no se borraron.', data: [] });
  }
});

app.post('/api/closures', async (req, res) => {
  const closure = req.body;
  if (!closure || !closure.id) {
    return res.status(400).json({ saved: false, error: 'Datos de cierre de caja inválidos' });
  }
  const sql = getNeonSql();
  if (!sql) {
    return res.status(503).json({ saved: false, error: 'DATABASE_URL no configurada en Vercel: el arqueo no se guardó en el servidor.' });
  }
  try {
    await initDatabaseSchema();
    await addSalesClosure(closure);
    res.json({ saved: true, id: closure.id });
  } catch (err) {
    console.error('Error guardando cierre de caja en Neon:', err);
    res.status(500).json({ saved: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// Directorio de clientes y proveedores: persiste en Neon para reutilizar los datos en todos los equipos.
app.get('/api/contacts', async (req, res) => {
  const sql = getNeonSql();
  if (!sql) return res.status(503).json({ error: 'La base de datos compartida no está configurada.' });
  try {
    await initDatabaseSchema();
    const tipo = String(req.query.tipo || '').toLowerCase();
    if (!['cliente', 'proveedor'].includes(tipo)) return res.status(400).json({ error: 'Tipo de contacto inválido.' });
    const documento = String(req.query.documento || '').replace(/\s/g, '').toUpperCase();
    const nombre = String(req.query.nombre || '').trim();
    let rows: any[] = [];
    if (documento) {
      rows = await sql`SELECT * FROM business_contacts WHERE tipo = ${tipo} AND UPPER(REPLACE(COALESCE(documento,''),' ','')) = ${documento} LIMIT 1` as any[];
    } else if (nombre) {
      rows = await sql`SELECT * FROM business_contacts WHERE tipo = ${tipo} AND LOWER(nombre) = LOWER(${nombre}) ORDER BY updated_at DESC LIMIT 1` as any[];
    }
    return res.json({ contact: rows[0] || null });
  } catch (err) {
    console.error('Error buscando contacto:', err);
    return res.status(500).json({ error: 'No se pudo buscar el contacto guardado.' });
  }
});

app.post('/api/contacts', async (req, res) => {
  const sql = getNeonSql();
  if (!sql) return res.status(503).json({ error: 'La base de datos compartida no está configurada.' });
  try {
    await initDatabaseSchema();
    const body = req.body || {};
    const tipo = String(body.tipo || '').toLowerCase();
    const documento = String(body.documento || '').replace(/\s/g, '').toUpperCase() || null;
    const nombre = String(body.nombre || '').trim();
    if (!['cliente', 'proveedor'].includes(tipo) || !nombre) return res.status(400).json({ error: 'Tipo y nombre del contacto son obligatorios.' });
    const id = String(body.id || `${tipo}-${documento || nombre.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`);
    let rows: any[];
    if (documento) {
      rows = await sql`
        INSERT INTO business_contacts (id,tipo,documento,nombre,apellido,telefono,correo,direccion,updated_at)
        VALUES (${id},${tipo},${documento},${nombre},${String(body.apellido||'').trim() || null},${String(body.telefono||'').trim() || null},${String(body.correo||'').trim() || null},${String(body.direccion||'').trim() || null},NOW())
        ON CONFLICT (tipo,documento) DO UPDATE SET nombre=EXCLUDED.nombre, apellido=EXCLUDED.apellido, telefono=EXCLUDED.telefono, correo=EXCLUDED.correo, direccion=EXCLUDED.direccion, updated_at=NOW()
        RETURNING *` as any[];
    } else {
      const existing = await sql`SELECT id FROM business_contacts WHERE tipo=${tipo} AND LOWER(nombre)=LOWER(${nombre}) AND documento IS NULL ORDER BY updated_at DESC LIMIT 1` as any[];
      if (existing[0]) {
        rows = await sql`UPDATE business_contacts SET apellido=${String(body.apellido||'').trim() || null}, telefono=${String(body.telefono||'').trim() || null}, correo=${String(body.correo||'').trim() || null}, direccion=${String(body.direccion||'').trim() || null}, updated_at=NOW() WHERE id=${existing[0].id} RETURNING *` as any[];
      } else {
        rows = await sql`INSERT INTO business_contacts (id,tipo,documento,nombre,apellido,telefono,correo,direccion) VALUES (${id},${tipo},NULL,${nombre},${String(body.apellido||'').trim() || null},${String(body.telefono||'').trim() || null},${String(body.correo||'').trim() || null},${String(body.direccion||'').trim() || null}) RETURNING *` as any[];
      }
    }
    return res.json({ success: true, contact: rows[0] || null });
  } catch (err) {
    console.error('Error guardando contacto:', err);
    return res.status(500).json({ error: 'No se pudo guardar el contacto.' });
  }
});

// Expenses
app.get('/api/expenses', async (_req, res) => {
  const sql = getNeonSql();
  if (!sql) {
    return res.json({ source: 'local_fallback', data: [] });
  }
  try {
    await initDatabaseSchema();
    const rows = await sql`SELECT * FROM expenses ORDER BY fecha DESC, created_at DESC`;
    res.json({ source: 'neon_postgres', data: normalizeExpenses(rows as any[]) });
  } catch (err) {
    console.error('Error al obtener gastos de Neon:', err);
    res.json({ source: 'local_fallback', error: String(err), data: [] });
  }
});

// Bank Reconciliations
app.get('/api/bank-reconciliations', async (_req, res) => {
  const sql = getNeonSql();
  if (!sql) {
    return res.json({ source: 'local_fallback', data: [] });
  }
  try {
    await initDatabaseSchema();
    const rows = await sql`SELECT * FROM bank_reconciliations ORDER BY fecha DESC, created_at DESC`;
    res.json({ source: 'neon_postgres', data: normalizeBankReconciliations(rows as any[]) });
  } catch (err) {
    res.json({ source: 'local_fallback', error: String(err), data: [] });
  }
});

// Bank Reconciliations - persistencia real en Neon
app.post('/api/bank-reconciliations', async (req, res) => {
  const sql = getNeonSql();
  const item = req.body || {};
  if (!sql) return res.status(503).json({ saved: false, error: 'DATABASE_URL no configurada en Vercel.' });
  if (!item.id || !item.fecha || !item.banco || !item.referencia || !item.descripcion) {
    return res.status(400).json({ saved: false, error: 'Faltan datos obligatorios del movimiento bancario.' });
  }
  try {
    await initDatabaseSchema();
    await sql`
      INSERT INTO bank_reconciliations (
        id, fecha, banco, tipo, referencia, descripcion, monto_bs, monto_usd,
        estado_conciliacion, vinculado_tipo, vinculado_id, notas
      ) VALUES (
        ${item.id}, ${item.fecha}, ${item.banco}, ${item.tipo || 'credito_ingreso'},
        ${item.referencia}, ${item.descripcion}, ${Number(item.monto_bs) || 0},
        ${item.monto_usd == null ? null : Number(item.monto_usd) || 0},
        ${item.estado_conciliacion || 'pendiente'}, ${item.vinculado_tipo || null},
        ${item.vinculado_id || null}, ${item.notas || ''}
      )
      ON CONFLICT (id) DO UPDATE SET
        fecha = EXCLUDED.fecha, banco = EXCLUDED.banco, tipo = EXCLUDED.tipo,
        referencia = EXCLUDED.referencia, descripcion = EXCLUDED.descripcion,
        monto_bs = EXCLUDED.monto_bs, monto_usd = EXCLUDED.monto_usd,
        estado_conciliacion = EXCLUDED.estado_conciliacion,
        vinculado_tipo = EXCLUDED.vinculado_tipo, vinculado_id = EXCLUDED.vinculado_id,
        notas = EXCLUDED.notas, updated_at = NOW()
    `;
    res.json({ saved: true, id: item.id });
  } catch (err) {
    console.error('Error guardando conciliación bancaria:', err);
    res.status(500).json({ saved: false, error: err instanceof Error ? err.message : String(err) });
  }
});

app.put('/api/bank-reconciliations/:id', async (req, res) => {
  const sql = getNeonSql();
  const { id } = req.params;
  if (!sql) return res.status(503).json({ updated: false, error: 'DATABASE_URL no configurada en Vercel.' });
  const { estado_conciliacion, notas, vinculado_tipo, vinculado_id, fecha, banco, tipo, referencia, descripcion, monto_bs, monto_usd } = req.body || {};
  try {
    await initDatabaseSchema();
    const rows = await sql`
      UPDATE bank_reconciliations SET
        estado_conciliacion = COALESCE(${estado_conciliacion ?? null}, estado_conciliacion),
        notas = COALESCE(${notas ?? null}, notas),
        vinculado_tipo = COALESCE(${vinculado_tipo ?? null}, vinculado_tipo),
        vinculado_id = COALESCE(${vinculado_id ?? null}, vinculado_id),
        fecha = COALESCE(${fecha ?? null}, fecha),
        banco = COALESCE(${banco ?? null}, banco),
        tipo = COALESCE(${tipo ?? null}, tipo),
        referencia = COALESCE(${referencia ?? null}, referencia),
        descripcion = COALESCE(${descripcion ?? null}, descripcion),
        monto_bs = COALESCE(${monto_bs == null ? null : Number(monto_bs)}, monto_bs),
        monto_usd = COALESCE(${monto_usd == null ? null : Number(monto_usd)}, monto_usd),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING id
    `;
    res.json({ updated: rows.length > 0, id });
  } catch (err) {
    console.error('Error actualizando conciliación bancaria:', err);
    res.status(500).json({ updated: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// ==========================================
// CATÁLOGO PÚBLICO & SINCRONIZACIÓN CON GITHUB
// ==========================================

// Endpoint público con CORS abierto para que el catálogo web (catalogo.html) pueda consultar stock en vivo
app.get('/api/catalog/products', async (_req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  const sql = getNeonSql();
  if (sql) {
    try {
      const rows = await sql`SELECT * FROM shoe_products WHERE stock > 0 ORDER BY nombre ASC`;
      const products = normalizeProducts(rows as any[]);
      return res.json({
        success: true,
        count: products.length,
        actualizado: new Date().toISOString(),
        products,
      });
    } catch (err) {
      console.error('Error obteniendo productos para catálogo público:', err);
    }
  }
  res.json({ success: true, count: 0, products: [] });
});

// Endpoint para sincronizar / hacer commit directamente al repositorio de GitHub

// API: Contabilidad - Libro Diario / Mayor
app.get('/api/accounting', async (req,res)=>{ try { const data=await getAccountingLedger(String(req.query.start||'')||undefined,String(req.query.end||'')||undefined); res.json({source:'neon_postgres',data}); } catch(e:any){ res.status(500).json({error:e?.message||'No se pudo consultar contabilidad'}); } });
app.post('/api/accounting/journal', async (req,res)=>{ try { const result=await saveAccountingEntry(req.body||{}); res.json({source:'neon_postgres',data:result}); } catch(e:any){ res.status(400).json({error:e?.message||'No se pudo guardar el asiento'}); } });
app.delete('/api/accounting/journal/:id', async (req,res)=>{ try { await deleteAccountingEntry(req.params.id); res.json({ok:true}); } catch(e:any){ res.status(500).json({error:e?.message||'No se pudo eliminar el asiento'}); } });

app.post('/api/catalog/sync-github', (_req, res) => {
  res.status(503).json({ success: false, error: 'La publicación en GitHub está desactivada en NEXOSS local.' });
});
app.post('/api/catalog/sync-github', async (req, res) => {
  try {
    const {
      token,
      owner = 'nexoss-demo',
      repo = 'nexoss-demo',
      branch = 'main',
      htmlContent,
      jsonContent,
      commitMessage,
    } = req.body || {};

    if (!token || typeof token !== 'string' || !token.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere un Token Personal de Acceso (PAT) de GitHub con permisos de escritura.',
      });
    }

    if (!htmlContent || typeof htmlContent !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'No se recibió el contenido HTML del catálogo a sincronizar.',
      });
    }

    const cleanToken = token.trim();
    const targetOwner = owner.trim() || 'nexoss-demo';
    const targetRepo = repo.trim() || 'nexoss-demo';
    const targetBranch = branch.trim() || 'main';

    const githubHeaders: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${cleanToken}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'NEXOSS-App',
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
    };

    // Función auxiliar para obtener el SHA canónico de un archivo en GitHub
    const getAuthoritativeSha = async (filePath: string): Promise<string | undefined> => {
      const timestamp = Date.now();
      try {
        const shaRes = await fetch(
          `https://api.github.com/repos/${targetOwner}/${targetRepo}/contents/${filePath}?ref=${encodeURIComponent(targetBranch)}&_cb=${timestamp}`,
          { headers: githubHeaders }
        );
        if (shaRes.ok) {
          const shaData: any = await shaRes.json();
          if (shaData && typeof shaData.sha === 'string') return shaData.sha;
        } else if (shaRes.status === 404) {
          return undefined;
        }
      } catch (e) {
        console.warn(`[ServerAppGitHub] Error en consulta de SHA para ${filePath}:`, e);
      }

      try {
        const treeRes = await fetch(
          `https://api.github.com/repos/${targetOwner}/${targetRepo}/git/trees/${encodeURIComponent(targetBranch)}?recursive=1&_cb=${timestamp}`,
          { headers: githubHeaders }
        );
        if (treeRes.ok) {
          const treeData: any = await treeRes.json();
          if (Array.isArray(treeData?.tree)) {
            const item = treeData.tree.find((t: any) => t.path === filePath);
            if (item && item.sha) return item.sha;
            return undefined;
          }
        }
      } catch (e) {
        console.warn(`[ServerAppGitHub] Error en Git Tree para ${filePath}:`, e);
      }

      return undefined;
    };

    // Función auxiliar para enviar commit con reintento ante conflictos 409
    const putFileWithRetry = async (
      filePath: string,
      base64Content: string,
      msg: string,
      maxRetries = 3
    ): Promise<{ ok: boolean; data?: any; status: number; error?: string }> => {
      let lastErr = '';
      let lastStat = 0;

      for (let i = 1; i <= maxRetries; i++) {
        const currentSha = await getAuthoritativeSha(filePath);
        const putBody: Record<string, any> = {
          message: msg,
          content: base64Content,
          branch: targetBranch,
        };
        if (currentSha) {
          putBody.sha = currentSha;
        }

        try {
          const putRes = await fetch(
            `https://api.github.com/repos/${targetOwner}/${targetRepo}/contents/${filePath}`,
            {
              method: 'PUT',
              headers: githubHeaders,
              body: JSON.stringify(putBody),
            }
          );

          if (putRes.ok) {
            const data = await putRes.json();
            return { ok: true, data, status: putRes.status };
          }

          const errBody: any = await putRes.json().catch(() => ({}));
          lastStat = putRes.status;
          lastErr = errBody.message || putRes.statusText || 'Error desconocido';

          if (putRes.status === 409 && i < maxRetries) {
            console.warn(
              `[ServerAppGitHub] Conflicto 409 en ${filePath}. Reintentando con SHA fresco (intento ${i}/${maxRetries})...`
            );
            await new Promise((r) => setTimeout(r, 1000 * i));
            continue;
          }

          return { ok: false, status: putRes.status, error: lastErr };
        } catch (netErr: any) {
          lastStat = 0;
          lastErr = netErr?.message || String(netErr);
          if (i < maxRetries) {
            await new Promise((r) => setTimeout(r, 1000 * i));
            continue;
          }
          return { ok: false, status: 0, error: lastErr };
        }
      }

      return { ok: false, status: lastStat, error: lastErr };
    };

    // 1. Commit de catalogo.html
    const nowStr = new Date().toLocaleString('es-VE');
    const msg = commitMessage || `Actualizar catálogo oficial desde NEXOSS - ${nowStr}`;
    const base64Html = Buffer.from(htmlContent, 'utf-8').toString('base64');

    const htmlCommitResult = await putFileWithRetry('catalogo.html', base64Html, msg, 3);

    if (!htmlCommitResult.ok) {
      return res.status(htmlCommitResult.status || 500).json({
        success: false,
        error: `Error de GitHub (${htmlCommitResult.status}): ${htmlCommitResult.error}`,
      });
    }

    const putData = htmlCommitResult.data;

    // 2. Commit opcional de products.json si fue enviado
    if (jsonContent && typeof jsonContent === 'string') {
      try {
        const base64Json = Buffer.from(jsonContent, 'utf-8').toString('base64');
        await putFileWithRetry(
          'products.json',
          base64Json,
          `Actualizar datos JSON del catálogo NEXOSS - ${nowStr}`,
          3
        );
      } catch (jsonErr) {
        console.warn('Error no crítico actualizando products.json en GitHub:', jsonErr);
      }
    }

    const commitUrl =
      putData?.commit?.html_url ||
      `https://github.com/${targetOwner}/${targetRepo}/commits/${targetBranch}`;
    const catalogUrl = `https://${targetOwner}.github.io/${targetRepo}/catalogo.html`;

    return res.json({
      success: true,
      message: 'Catálogo sincronizado exitosamente en GitHub.',
      commitUrl,
      catalogUrl,
      sha: putData?.content?.sha,
    });
  } catch (err: any) {
    console.error('Error sincronizando con GitHub en el backend:', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'Error interno del servidor al sincronizar con GitHub.',
    });
  }
});

export default app;

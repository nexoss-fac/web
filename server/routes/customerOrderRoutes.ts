import type { Express, RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';
import { tenantStorageContext, type TenantAuthenticatedRequest } from '../multiempresa/companyAccess.ts';

type Sql = any;
const STATES = ['pending', 'approved', 'preparing', 'dispatched', 'partial', 'cancelled'] as const;
function tenant(req: any) { return (req as TenantAuthenticatedRequest).tenant || tenantStorageContext.getStore(); }
function clean(value: unknown, max = 240) { return String(value ?? '').trim().slice(0, max); }
function normalizeItems(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).map((item: any) => ({
    productId: clean(item?.productId, 100), sku: clean(item?.sku, 100),
    name: clean(item?.name, 180), quantity: Math.max(1, Math.min(100000, Math.floor(Number(item?.quantity) || 1))),
    approvedQuantity: Math.max(0, Math.min(100000, Math.floor(Number(item?.approvedQuantity ?? item?.quantity) || 0))),
    deliveredQuantity: Math.max(0, Math.min(100000, Math.floor(Number(item?.deliveredQuantity) || 0))),
    unitPrice: Math.max(0, Number(item?.unitPrice) || 0),
  }));
}
async function ensureOrdersSchema(sql: Sql) {
  await sql`CREATE TABLE IF NOT EXISTS nexoss_customer_orders (
    id TEXT PRIMARY KEY, order_number TEXT NOT NULL UNIQUE,
    customer_document TEXT NOT NULL DEFAULT '', customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL DEFAULT '', customer_address TEXT NOT NULL DEFAULT '',
    branch_name TEXT NOT NULL DEFAULT '', branch_address TEXT NOT NULL DEFAULT '',
    requested_delivery_date DATE, status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending','approved','preparing','dispatched','partial','cancelled')),
    items JSONB NOT NULL DEFAULT '[]'::jsonb, notes TEXT NOT NULL DEFAULT '',
    invoice_sale_id TEXT, created_by_uid TEXT NOT NULL, approved_by_uid TEXT,
    dispatched_by_uid TEXT, dispatched_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS nexoss_client_collection_assignments (
    client_document TEXT PRIMARY KEY, client_name TEXT NOT NULL DEFAULT '', client_address TEXT NOT NULL DEFAULT '',
    collector_uid TEXT NOT NULL, assigned_by_uid TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS nexoss_dispatch_followups (
    id TEXT PRIMARY KEY, sale_id TEXT NOT NULL UNIQUE, invoice_number TEXT NOT NULL, client_document TEXT NOT NULL,
    client_name TEXT NOT NULL, client_address TEXT NOT NULL DEFAULT '', client_phone TEXT NOT NULL DEFAULT '', collector_uid TEXT NOT NULL,
    dispatched_at TIMESTAMPTZ NOT NULL, due_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','partial','paid','cancelled')),
    reminder_10_sent_at TIMESTAMPTZ, reminder_due_sent_at TIMESTAMPTZ, reminder_overdue_sent_at TIMESTAMPTZ,
    visit_due_at TIMESTAMPTZ NOT NULL, visit_completed_at TIMESTAMPTZ, visit_completed_by_uid TEXT,
    visit_note TEXT NOT NULL DEFAULT '', visit_reminder_sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`ALTER TABLE nexoss_client_collection_assignments ADD COLUMN IF NOT EXISTS client_address TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE nexoss_dispatch_followups ADD COLUMN IF NOT EXISTS client_address TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE nexoss_dispatch_followups ADD COLUMN IF NOT EXISTS client_phone TEXT NOT NULL DEFAULT ''`;
  await sql`CREATE INDEX IF NOT EXISTS nexoss_customer_orders_status_idx ON nexoss_customer_orders(status, requested_delivery_date)`;
  await sql`CREATE INDEX IF NOT EXISTS nexoss_customer_orders_customer_idx ON nexoss_customer_orders(customer_document)`;
}
export function registerCustomerOrderRoutes(app: Express, deps: { getNeonSql: () => Sql; adminOnly: RequestHandler }) {
  const { getNeonSql, adminOnly } = deps;
  app.get('/api/customer-orders/invoices', adminOnly, async (_req, res) => {
    const sql = getNeonSql();
    if (!sql) return res.status(503).json({ error: 'Base de datos de empresa no disponible.' });
    try {
      const invoices = await sql`SELECT id, numero_factura, cliente_nombre, cliente_apellido, cliente_rif, total_usd, condicion_pago
        FROM sales_transactions WHERE COALESCE(estado,'completada') <> 'anulada' ORDER BY fecha DESC LIMIT 200`;
      return res.json({ invoices });
    } catch { return res.status(503).json({ error: 'No se pudieron cargar las facturas.' }); }
  });
  app.get('/api/customer-orders', adminOnly, async (_req, res) => {
    const sql = getNeonSql();
    if (!sql) return res.status(503).json({ error: 'Base de datos de empresa no disponible.' });
    try { await ensureOrdersSchema(sql); const orders = await sql`SELECT * FROM nexoss_customer_orders ORDER BY created_at DESC LIMIT 500`; return res.json({ orders }); }
    catch { return res.status(503).json({ error: 'No se pudieron cargar los pedidos.' }); }
  });
  app.post('/api/customer-orders', adminOnly, async (req, res) => {
    const context = tenant(req); const sql = getNeonSql(); const body = req.body || {};
    const customerName = clean(body.customerName);
    const items = normalizeItems(body.items);
    if (!context || !sql || !customerName || !items.length) return res.status(400).json({ error: 'Indica el cliente y al menos un producto.' });
    try {
      await ensureOrdersSchema(sql);
      const orderNumber = `PED-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
      const id = randomUUID();
      const rows = await sql`INSERT INTO nexoss_customer_orders
        (id, order_number, customer_document, customer_name, customer_phone, customer_address, branch_name, branch_address, requested_delivery_date, items, notes, created_by_uid)
        VALUES (${id}, ${orderNumber}, ${clean(body.customerDocument, 60)}, ${customerName}, ${clean(body.customerPhone, 60)}, ${clean(body.customerAddress, 500)}, ${clean(body.branchName, 180)}, ${clean(body.branchAddress, 500)}, ${body.requestedDeliveryDate || null}, ${JSON.stringify(items)}, ${clean(body.notes, 2000)}, ${context.uid})
        RETURNING *`;
      return res.status(201).json({ order: rows[0] });
    } catch { return res.status(503).json({ error: 'No se pudo registrar el pedido.' }); }
  });
  app.patch('/api/customer-orders/:id', adminOnly, async (req, res) => {
    const context = tenant(req); const sql = getNeonSql(); const id = clean(req.params.id, 100); const body = req.body || {};
    if (!context || !sql || !id) return res.status(400).json({ error: 'Pedido inválido.' });
    try {
      await ensureOrdersSchema(sql);
      const found = await sql`SELECT * FROM nexoss_customer_orders WHERE id = ${id} LIMIT 1`;
      const order = found[0] as any;
      if (!order) return res.status(404).json({ error: 'Pedido no encontrado.' });
      const nextStatus = body.status ? clean(body.status, 30) : order.status;
      if (!STATES.includes(nextStatus as any)) return res.status(400).json({ error: 'Estado de pedido inválido.' });
      const allowed: Record<string, string[]> = {
        pending: ['pending','approved','cancelled'], approved: ['approved','preparing','cancelled'],
        preparing: ['preparing','dispatched','partial','cancelled'],
        dispatched: ['dispatched'], partial: ['partial','dispatched'], cancelled: ['cancelled'],
      };
      if (!allowed[order.status]?.includes(nextStatus)) return res.status(409).json({ error: 'Transición no permitida para el estado actual.' });
      const items = body.items ? normalizeItems(body.items) : normalizeItems(order.items);
      if (!items.length && nextStatus !== 'cancelled') return res.status(400).json({ error: 'El pedido debe conservar al menos un producto.' });
      if (['partial','dispatched'].includes(nextStatus)) {
        const invalidDelivery = items.some((item) => item.deliveredQuantity > item.approvedQuantity);
        const delivered = items.reduce((sum, item) => sum + item.deliveredQuantity, 0);
        const approved = items.reduce((sum, item) => sum + item.approvedQuantity, 0);
        if (invalidDelivery || delivered <= 0) return res.status(400).json({ error: 'Indica cantidades entregadas válidas para cada producto.' });
        if (nextStatus === 'dispatched' && delivered !== approved) return res.status(409).json({ error: 'El despacho total requiere que las cantidades entregadas coincidan con las aprobadas.' });
        if (nextStatus === 'partial' && delivered >= approved) return res.status(409).json({ error: 'Las cantidades entregadas corresponden a un despacho total, no parcial.' });
      }
      const invoiceSaleId = body.invoiceSaleId === undefined ? order.invoice_sale_id : clean(body.invoiceSaleId, 120);
      if (['dispatched','partial'].includes(nextStatus)) {
        if (!invoiceSaleId) return res.status(409).json({ error: 'Registra primero la factura en Ventas y vincúlala al pedido antes de confirmar el despacho.' });
        const invoice = await sql`SELECT id, numero_factura, cliente_rif, cliente_nombre, cliente_apellido, cliente_telefono, condicion_pago, total_usd, estado FROM sales_transactions WHERE id = ${invoiceSaleId} LIMIT 1`;
        if (!invoice.length || invoice[0].estado === 'anulada') return res.status(404).json({ error: 'La factura vinculada no existe o está anulada en esta empresa.' });
        if (invoice[0].condicion_pago === 'credito') {
          const document = clean(order.customer_document || invoice[0].cliente_rif, 60).toUpperCase().replace(/[.\\s-]/g, '');
          const assignment = await sql`SELECT collector_uid FROM nexoss_client_collection_assignments WHERE client_document = ${document} LIMIT 1`;
          if (!assignment[0]?.collector_uid) return res.status(409).json({ error: 'Asigna un cobrador al cliente en Cobranza antes de confirmar el despacho a crédito.' });
          const dispatchedAt = new Date();
          const dueAt = new Date(dispatchedAt.getTime() + 15 * 86400000);
          const visitDueAt = new Date(dispatchedAt.getTime() + 3 * 86400000);
          const name = [invoice[0].cliente_nombre, invoice[0].cliente_apellido].filter(Boolean).join(' ').trim() || order.customer_name;
          await sql`INSERT INTO nexoss_dispatch_followups
            (id, sale_id, invoice_number, client_document, client_name, client_address, client_phone, collector_uid, dispatched_at, due_at, visit_due_at)
            VALUES (${randomUUID()}, ${invoiceSaleId}, ${invoice[0].numero_factura}, ${document}, ${name}, ${order.branch_address || order.customer_address || ''}, ${invoice[0].cliente_telefono || order.customer_phone || ''}, ${assignment[0].collector_uid}, ${dispatchedAt.toISOString()}, ${dueAt.toISOString()}, ${visitDueAt.toISOString()})
            ON CONFLICT (sale_id) DO UPDATE SET collector_uid = EXCLUDED.collector_uid, client_address = EXCLUDED.client_address, client_phone = EXCLUDED.client_phone, updated_at = NOW()`;
        }
      }
      const rows = await sql`UPDATE nexoss_customer_orders SET
        status = ${nextStatus}, items = ${JSON.stringify(items)}, invoice_sale_id = ${invoiceSaleId || null},
        approved_by_uid = CASE WHEN ${nextStatus} = 'approved' AND approved_by_uid IS NULL THEN ${context.uid} ELSE approved_by_uid END,
        dispatched_by_uid = CASE WHEN ${nextStatus} IN ('dispatched','partial') THEN ${context.uid} ELSE dispatched_by_uid END,
        dispatched_at = CASE WHEN ${nextStatus} IN ('dispatched','partial') AND dispatched_at IS NULL THEN NOW() ELSE dispatched_at END,
        updated_at = NOW() WHERE id = ${id} RETURNING *`;
      return res.json({ order: rows[0] });
    } catch { return res.status(503).json({ error: 'No se pudo actualizar el pedido.' }); }
  });
}

import type { Express, RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';
import { tenantStorageContext, type TenantAuthenticatedRequest } from '../multiempresa/companyAccess.ts';
import { sendWebPushToRoles, sendWebPushToUsers } from '../notify/webPush.ts';

type Sql = any;
type SaleRow = { id: string; numero_factura: string; cliente_nombre: string; cliente_apellido: string; cliente_rif: string | null; cliente_telefono: string | null; condicion_pago: string; total_usd: string | number; pagos: unknown; estado: string | null };

const reminderTimers = new Map<string, ReturnType<typeof setInterval>>();

async function ensureCollectionsSchema(sql: Sql) {
  await sql`CREATE TABLE IF NOT EXISTS nexoss_client_collection_assignments (
    client_document TEXT PRIMARY KEY,
    client_name TEXT NOT NULL DEFAULT '',
    collector_uid TEXT NOT NULL,
    assigned_by_uid TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS nexoss_collection_assignments_collector_idx ON nexoss_client_collection_assignments (collector_uid)`;
  await sql`CREATE TABLE IF NOT EXISTS nexoss_dispatch_followups (
    id TEXT PRIMARY KEY,
    sale_id TEXT NOT NULL UNIQUE,
    invoice_number TEXT NOT NULL,
    client_document TEXT NOT NULL,
    client_name TEXT NOT NULL,
    collector_uid TEXT NOT NULL,
    dispatched_at TIMESTAMPTZ NOT NULL,
    due_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'partial', 'paid', 'cancelled')),
    reminder_10_sent_at TIMESTAMPTZ,
    reminder_due_sent_at TIMESTAMPTZ,
    reminder_overdue_sent_at TIMESTAMPTZ,
    visit_due_at TIMESTAMPTZ NOT NULL,
    visit_completed_at TIMESTAMPTZ,
    visit_note TEXT NOT NULL DEFAULT '',
    visit_reminder_sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS nexoss_dispatch_followups_due_idx ON nexoss_dispatch_followups (status, due_at)`;
  await sql`CREATE INDEX IF NOT EXISTS nexoss_dispatch_followups_collector_idx ON nexoss_dispatch_followups (collector_uid, status)`;
  await sql`CREATE TABLE IF NOT EXISTS nexoss_collection_payments (
    id TEXT PRIMARY KEY,
    sale_id TEXT NOT NULL,
    amount_usd NUMERIC(14,2) NOT NULL CHECK (amount_usd > 0),
    amount_bs NUMERIC(18,2) NOT NULL DEFAULT 0,
    exchange_rate NUMERIC(14,4) NOT NULL DEFAULT 1,
    method TEXT NOT NULL,
    reference TEXT NOT NULL DEFAULT '',
    paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    recorded_by_uid TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS nexoss_collection_payments_sale_idx ON nexoss_collection_payments (sale_id, paid_at)`;
}

function documentKey(value: unknown): string {
  return String(value || '').normalize('NFKC').trim().toUpperCase().replace(/[.\\s-]/g, '').slice(0, 40);
}
function displayName(sale: SaleRow): string {
  return [sale.cliente_nombre, sale.cliente_apellido].filter(Boolean).join(' ').trim() || 'Cliente sin nombre';
}
function initialPaid(pagos: unknown): number {
  let parsed = pagos;
  if (typeof parsed === 'string') { try { parsed = JSON.parse(parsed); } catch { parsed = []; } }
  if (!Array.isArray(parsed)) return 0;
  return parsed.reduce((sum: number, item: any) => sum + Math.max(0, Number(item?.monto_equivalente_usd ?? item?.monto_usd ?? 0) || 0), 0);
}
function tenant(req: any) { return (req as TenantAuthenticatedRequest).tenant || tenantStorageContext.getStore(); }

async function currentBalance(sql: Sql, sale: SaleRow) {
  const [rows] = await Promise.all([sql`SELECT COALESCE(SUM(amount_usd), 0)::numeric AS collected FROM nexoss_collection_payments WHERE sale_id = ${sale.id}`]);
  const total = Number(sale.total_usd) || 0;
  const paid = initialPaid(sale.pagos) + Number(rows?.[0]?.collected || 0);
  return { total, paid, balance: Math.max(0, Number((total - paid).toFixed(2))) };
}

async function processReminders(sql: Sql) {
  await ensureCollectionsSchema(sql);
  const now = new Date();
  const rows = await sql`SELECT * FROM nexoss_dispatch_followups
    WHERE status IN ('open', 'partial')
      AND ((reminder_10_sent_at IS NULL AND due_at <= NOW() + INTERVAL '5 days' AND due_at > NOW())
        OR (reminder_due_sent_at IS NULL AND due_at <= NOW() AND due_at > NOW() - INTERVAL '1 day')
        OR (reminder_overdue_sent_at IS NULL AND due_at <= NOW() - INTERVAL '1 day')
        OR (visit_completed_at IS NULL AND visit_reminder_sent_at IS NULL AND visit_due_at <= NOW()))
    ORDER BY due_at ASC LIMIT 100`;
  for (const row of rows as any[]) {
    const due = new Date(row.due_at);
    let field = '';
    let title = '';
    let body = '';
    let tag = '';
    if (!row.reminder_10_sent_at && due > now && due.getTime() - now.getTime() <= 5 * 86400000) {
      field = 'reminder_10_sent_at'; title = 'Cobranza · Próximo vencimiento';
      body = `Factura ${row.invoice_number} de ${row.client_name}: vence en 5 días.`; tag = `collection-10-${row.sale_id}`;
    } else if (!row.reminder_due_sent_at && due <= now && due.getTime() > now.getTime() - 86400000) {
      field = 'reminder_due_sent_at'; title = 'Cobranza · Vence hoy';
      body = `Factura ${row.invoice_number} de ${row.client_name}: requiere gestión de cobro.`; tag = `collection-due-${row.sale_id}`;
    } else if (!row.reminder_overdue_sent_at && due <= now && due.getTime() <= now.getTime() - 86400000) {
      field = 'reminder_overdue_sent_at'; title = 'Cobranza · Factura vencida';
      body = `Factura ${row.invoice_number} de ${row.client_name}: está vencida. Revisa el saldo pendiente.`; tag = `collection-overdue-${row.sale_id}`;
    } else if (!row.visit_completed_at && !row.visit_reminder_sent_at && new Date(row.visit_due_at) <= now) {
      field = 'visit_reminder_sent_at'; title = 'Macizo · Visita de anaqueles';
      body = `Corresponde revisar los anaqueles de ${row.client_name} (factura ${row.invoice_number}).`; tag = `shelf-visit-${row.sale_id}`;
    }
    if (!field) continue;
    const admins = await sendWebPushToRoles(sql, ['owner', 'admin'], { title, body, url: '/?tab=admin', tag });
    let collector = 0;
    if (field !== 'visit_reminder_sent_at') collector = await sendWebPushToUsers(sql, [row.collector_uid], { title, body, url: '/?tab=collections', tag });
    if (admins + collector > 0) {
      await sql`UPDATE nexoss_dispatch_followups SET ${sql(field)} = NOW(), updated_at = NOW() WHERE id = ${row.id} AND ${sql(field)} IS NULL`;
    }
  }
}

function armReminderScheduler(context: any, sql: Sql) {
  if (!context?.companyId || reminderTimers.has(context.companyId)) return;
  const run = () => {
    void processReminders(sql).catch((error) => console.warn('[Cobranza] No se pudieron procesar recordatorios:', error instanceof Error ? error.message : 'error'));
  };
  run();
  const timer = setInterval(run, 15 * 60 * 1000);
  timer.unref?.();
  reminderTimers.set(context.companyId, timer);
}

export interface CollectionsRouteDeps {
  getNeonSql: () => Sql;
  adminOnly: RequestHandler;
  isActiveCollector: (companyId: string, uid: string) => Promise<boolean>;
}

export function registerCollectionsRoutes(app: Express, deps: CollectionsRouteDeps) {
  const { getNeonSql, adminOnly, isActiveCollector } = deps;

  app.get('/api/collections/clients', adminOnly, async (_req, res) => {
    const sql = getNeonSql(); if (!sql) return res.status(503).json({ error: 'Base de datos de empresa no disponible.' });
    try {
      await ensureCollectionsSchema(sql);
      const rows = await sql`SELECT cliente_rif AS document, MAX(TRIM(CONCAT(COALESCE(cliente_nombre,''), ' ', COALESCE(cliente_apellido,'')))) AS name,
        MAX(cliente_telefono) AS phone, COUNT(*)::int AS invoices
        FROM sales_transactions WHERE COALESCE(cliente_rif,'') <> '' AND COALESCE(estado,'completada') <> 'anulada'
        GROUP BY cliente_rif ORDER BY name`;
      const assignments = await sql`SELECT client_document, collector_uid FROM nexoss_client_collection_assignments`;
      const byDocument = new Map((assignments as any[]).map((a) => [a.client_document, a.collector_uid]));
      return res.json({ clients: (rows as any[]).map((row) => ({ ...row, collectorUid: byDocument.get(documentKey(row.document)) || '' })) });
    } catch (error) { return res.status(503).json({ error: 'No se pudo cargar la cartera de clientes.' }); }
  });

  app.get('/api/collections/assignments', async (req, res) => {
    const context = tenant(req); const sql = getNeonSql();
    if (!context || !sql) return res.status(503).json({ error: 'Base de datos de empresa no disponible.' });
    try {
      await ensureCollectionsSchema(sql);
      const rows = context.role === 'collector'
        ? await sql`SELECT * FROM nexoss_client_collection_assignments WHERE collector_uid = ${context.uid} ORDER BY client_name`
        : await sql`SELECT * FROM nexoss_client_collection_assignments ORDER BY client_name`;
      return res.json({ assignments: rows });
    } catch { return res.status(503).json({ error: 'No se pudieron cargar las asignaciones.' }); }
  });

  app.put('/api/collections/assignments/:document', adminOnly, async (req, res) => {
    const context = tenant(req); const sql = getNeonSql();
    const document = documentKey(req.params.document); const collectorUid = String(req.body?.collectorUid || '').trim();
    const clientName = String(req.body?.clientName || '').trim().slice(0, 180);
    if (!context || !sql || !document || !collectorUid) return res.status(400).json({ error: 'Selecciona un cliente y un cobrador.' });
    try {
      if (!await isActiveCollector(context.companyId, collectorUid)) return res.status(400).json({ error: 'El usuario seleccionado no es cobrador activo de esta empresa.' });
      await ensureCollectionsSchema(sql);
      await sql`INSERT INTO nexoss_client_collection_assignments (client_document, client_name, collector_uid, assigned_by_uid)
        VALUES (${document}, ${clientName}, ${collectorUid}, ${context.uid})
        ON CONFLICT (client_document) DO UPDATE SET client_name = EXCLUDED.client_name, collector_uid = EXCLUDED.collector_uid, assigned_by_uid = EXCLUDED.assigned_by_uid, updated_at = NOW()`;
      return res.json({ saved: true });
    } catch { return res.status(503).json({ error: 'No se pudo guardar la asignación.' }); }
  });

  app.delete('/api/collections/assignments/:document', adminOnly, async (req, res) => {
    const sql = getNeonSql(); if (!sql) return res.status(503).json({ error: 'Base de datos no disponible.' });
    try { await ensureCollectionsSchema(sql); await sql`DELETE FROM nexoss_client_collection_assignments WHERE client_document = ${documentKey(req.params.document)}`; return res.json({ removed: true }); }
    catch { return res.status(503).json({ error: 'No se pudo retirar la asignación.' }); }
  });

  app.post('/api/collections/dispatch', adminOnly, async (req, res) => {
    const context = tenant(req); const sql = getNeonSql(); const saleId = String(req.body?.saleId || '').trim();
    if (!context || !sql || !saleId) return res.status(400).json({ error: 'Indica la factura que se despachó.' });
    try {
      await ensureCollectionsSchema(sql);
      const sales = await sql`SELECT id, numero_factura, cliente_nombre, cliente_apellido, cliente_rif, cliente_telefono, condicion_pago, total_usd, pagos, estado
        FROM sales_transactions WHERE id = ${saleId} LIMIT 1`;
      const sale = sales[0] as SaleRow | undefined;
      if (!sale || sale.condicion_pago !== 'credito' || sale.estado === 'anulada') return res.status(404).json({ error: 'No se encontró una factura a crédito válida.' });
      const document = documentKey(sale.cliente_rif);
      const assignment = await sql`SELECT collector_uid FROM nexoss_client_collection_assignments WHERE client_document = ${document} LIMIT 1`;
      if (!assignment[0]?.collector_uid) return res.status(409).json({ error: 'Asigna primero un cobrador a este cliente.' });
      const dispatchedAt = new Date();
      const dueAt = new Date(dispatchedAt.getTime() + 15 * 86400000);
      const visitDueAt = new Date(dispatchedAt.getTime() + 3 * 86400000);
      await sql`INSERT INTO nexoss_dispatch_followups
        (id, sale_id, invoice_number, client_document, client_name, collector_uid, dispatched_at, due_at, visit_due_at)
        VALUES (${randomUUID()}, ${sale.id}, ${sale.numero_factura}, ${document}, ${displayName(sale)}, ${assignment[0].collector_uid}, ${dispatchedAt.toISOString()}, ${dueAt.toISOString()}, ${visitDueAt.toISOString()})
        ON CONFLICT (sale_id) DO UPDATE SET collector_uid = EXCLUDED.collector_uid, updated_at = NOW()`;
      await sendWebPushToRoles(sql, ['owner', 'admin'], { title: 'Macizo · Despacho a crédito', body: `Factura ${sale.numero_factura} despachada. Cobro en 15 días y visita de anaqueles programada.`, url: '/?tab=collections', tag: `dispatch-${sale.id}` });
      await sendWebPushToUsers(sql, [assignment[0].collector_uid], { title: 'Macizo · Nueva cobranza asignada', body: `Cliente ${displayName(sale)} · Factura ${sale.numero_factura}. Vence en 15 días.`, url: '/?tab=collections', tag: `dispatch-${sale.id}` });
      armReminderScheduler(context, sql);
      return res.status(201).json({ saved: true, dispatchedAt: dispatchedAt.toISOString(), dueAt: dueAt.toISOString(), visitDueAt: visitDueAt.toISOString() });
    } catch (error) { return res.status(503).json({ error: 'No se pudo registrar el despacho y su seguimiento.' }); }
  });

  app.get('/api/collections/tasks', async (req, res) => {
    const context = tenant(req); const sql = getNeonSql();
    if (!context || !sql) return res.status(503).json({ error: 'Base de datos no disponible.' });
    try {
      await ensureCollectionsSchema(sql); armReminderScheduler(context, sql);
      const rows = context.role === 'collector'
        ? await sql`SELECT * FROM nexoss_dispatch_followups WHERE collector_uid = ${context.uid} AND status IN ('open','partial') ORDER BY due_at`
        : await sql`SELECT * FROM nexoss_dispatch_followups WHERE status IN ('open','partial') ORDER BY due_at`;
      const tasks = [];
      for (const row of rows as SaleRow[]) {
        const saleRows = await sql`SELECT id, total_usd, pagos FROM sales_transactions WHERE id = ${(row as any).sale_id} LIMIT 1`;
        if (!saleRows[0]) continue;
        const balance = await currentBalance(sql, { ...(row as any), ...(saleRows[0] as any) });
        tasks.push({ ...row, ...balance });
      }
      return res.json({ tasks });
    } catch { return res.status(503).json({ error: 'No se pudieron cargar las tareas de cobranza.' }); }
  });

  app.post('/api/collections/payments/:saleId', async (req, res) => {
    const context = tenant(req); const sql = getNeonSql();
    const saleId = String(req.params.saleId || '').trim();
    const amountUsd = Number(req.body?.amountUsd);
    const amountBs = Number(req.body?.amountBs || 0);
    const rate = Number(req.body?.exchangeRate || 1);
    const method = String(req.body?.method || '').trim().slice(0, 80);
    const reference = String(req.body?.reference || '').trim().slice(0, 100);
    if (!context || !sql || !saleId || !method || !(amountUsd > 0) || !Number.isFinite(amountUsd) || !(rate > 0)) return res.status(400).json({ error: 'Datos del cobro inválidos.' });
    try {
      await ensureCollectionsSchema(sql);
      const cases = await sql`SELECT * FROM nexoss_dispatch_followups WHERE sale_id = ${saleId} AND status IN ('open','partial') LIMIT 1`;
      const followup = cases[0] as any;
      if (!followup) return res.status(404).json({ error: 'No existe una cobranza activa para esta factura.' });
      if (context.role === 'collector' && followup.collector_uid !== context.uid) return res.status(403).json({ error: 'Esta cobranza no está asignada a tu usuario.' });
      const sales = await sql`SELECT id, total_usd, pagos FROM sales_transactions WHERE id = ${saleId} LIMIT 1`;
      if (!sales[0]) return res.status(404).json({ error: 'Factura no encontrada.' });
      const balance = await currentBalance(sql, { ...(followup as any), ...(sales[0] as any) });
      if (amountUsd > balance.balance + 0.01) return res.status(400).json({ error: 'El cobro supera el saldo pendiente.' });
      await sql`INSERT INTO nexoss_collection_payments (id, sale_id, amount_usd, amount_bs, exchange_rate, method, reference, recorded_by_uid)
        VALUES (${randomUUID()}, ${saleId}, ${amountUsd}, ${amountBs}, ${rate}, ${method}, ${reference}, ${context.uid})`;
      const remaining = Math.max(0, Number((balance.balance - amountUsd).toFixed(2)));
      await sql`UPDATE nexoss_dispatch_followups SET status = ${remaining <= 0.01 ? 'paid' : 'partial'}, updated_at = NOW() WHERE sale_id = ${saleId}`;
      await sendWebPushToRoles(sql, ['owner', 'admin'], { title: remaining <= 0.01 ? 'Macizo · Factura cobrada' : 'Macizo · Abono registrado', body: `Factura ${followup.invoice_number} · Cliente ${followup.client_name} · Saldo restante: $${remaining.toFixed(2)}.`, url: '/?tab=collections', tag: `collection-payment-${saleId}-${Date.now()}` });
      return res.status(201).json({ saved: true, remaining });
    } catch { return res.status(503).json({ error: 'No se pudo registrar el cobro.' }); }
  });

  app.post('/api/collections/visits/:saleId', adminOnly, async (req, res) => {
    const sql = getNeonSql(); const saleId = String(req.params.saleId || '').trim();
    const note = String(req.body?.note || '').trim().slice(0, 2000);
    if (!sql || !saleId) return res.status(400).json({ error: 'Visita inválida.' });
    try {
      await ensureCollectionsSchema(sql);
      const updated = await sql`UPDATE nexoss_dispatch_followups SET visit_completed_at = NOW(), visit_note = ${note}, updated_at = NOW()
        WHERE sale_id = ${saleId} AND visit_completed_at IS NULL RETURNING id`;
      return updated.length ? res.json({ saved: true }) : res.status(404).json({ error: 'La visita no existe o ya fue completada.' });
    } catch { return res.status(503).json({ error: 'No se pudo guardar la visita.' }); }
  });
}

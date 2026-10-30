import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import type { Express, Request, Response } from 'express';
import { getNeonSql, readTenantWorkspaceState } from '../db.ts';
import { tenantStorageContext } from '../multiempresa/companyAccess.ts';
import { resolveIndustryTemplate } from '../../src/domain/companyIndustries.ts';
import { LocalEnvironmentTenantSecretProvider } from '../multiempresa/tenantSecretProvider.ts';
import { logger } from '../logger.ts';

const SCOPES = new Set([
  'journal_read', 'ledger_read', 'purchases_read', 'sales_read', 'expenses_read',
  'reports_read', 'reconciliation_write', 'journal_write', 'tax_read', 'closures_write',
]);
type DelegatedSql = NonNullable<ReturnType<typeof getNeonSql>>;

/** Consulta compras del tenant delegado. Los errores SQL se propagan al handler HTTP. */
export async function queryDelegatedPurchases(sql: DelegatedSql): Promise<any[]> {
  return await sql`SELECT id, supplier_name, supplier_tax_id, invoice_number,
    issue_date, currency, exchange_rate, grand_total, status, created_at
    FROM purchase_invoices ORDER BY issue_date DESC LIMIT 250`;
}

/** Respuesta común del endpoint cuando falla la lectura de libros. */
export function respondBooksReadError(
  res: Pick<Response, 'status' | 'json'>,
  error: unknown,
  firmId: string,
  clientId: string,
  actorUid: string,
) {
  logger.error('[Accounting firm books] Error consultando libros autorizados:', {
    firmCompanyId: firmId, clientCompanyId: clientId, actorUid, error,
  });
  return res.status(503).json({ error: 'No se pudieron abrir los libros autorizados.' });
}

let pool: Pool | undefined;

function controlPlane(): Pool {
  const connectionString = process.env.CONTROL_PLANE_DATABASE_URL?.trim();
  if (!connectionString) throw new Error('CONTROL_PLANE_DATABASE_URL no está configurada.');
  if (!pool) {
    const parsed = new URL(connectionString);
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) throw new Error('Conexión de control plane inválida.');
    pool = new Pool({ connectionString, max: 4, connectionTimeoutMillis: 5000,
      ssl: parsed.hostname.endsWith('.neon.tech') ? { rejectUnauthorized: true } : undefined });
  }
  return pool;
}

function identity(req: Request): { uid: string; email?: string } | null {
  const value = (req as Request & { firebaseIdentity?: { uid?: string; email?: string } }).firebaseIdentity;
  return value?.uid ? { uid: value.uid, ...(value.email ? { email: value.email } : {}) } : null;
}

const DEFAULT_ACCOUNTING_FIRM_SCOPES = ['journal_read', 'ledger_read', 'reports_read'];

/** Solo se aplican permisos predeterminados cuando el cliente omite scopes.
 * Una lista vacía, mal formada o sin permisos reconocidos nunca concede acceso.
 */
export function scopesFrom(value: unknown): string[] {
  if (value === undefined || value === null) return [...DEFAULT_ACCOUNTING_FIRM_SCOPES];
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string' && SCOPES.has(item)))];
}

async function member(client: any, uid: string, companyId: string) {
  const result = await client.query(
    `SELECT u.id AS user_id, m.role, c.id AS company_id, c.workspace, c.status
     FROM platform_users u
     JOIN company_memberships m ON m.user_id = u.id AND m.status = 'active'
     JOIN platform_companies c ON c.id = m.company_id
     WHERE u.auth_provider = 'firebase' AND u.auth_subject = $1 AND u.status = 'active'
       AND c.id = $2 AND c.status = 'active' LIMIT 1`, [uid, companyId]);
  const row = result.rows[0];
  return row && ['owner', 'admin'].includes(row.role) ? row : null;
}


async function activeFirmMember(client: any, uid: string, companyId: string) {
  const result = await client.query(
    `SELECT u.id AS user_id, m.role, c.id AS company_id, c.workspace, c.status
     FROM platform_users u
     JOIN company_memberships m ON m.user_id=u.id AND m.status='active'
     JOIN platform_companies c ON c.id=m.company_id
     WHERE u.auth_provider='firebase' AND u.auth_subject=$1 AND u.status='active'
       AND c.id=$2 AND c.status='active' AND m.role IN ('owner','admin','accountant','auditor')
     LIMIT 1`, [uid, companyId]);
  return result.rows[0] || null;
}

async function audit(client: any, input: { grantId?: string; firmId: string; clientId: string; userId: string; action: string; metadata?: unknown }) {
  await client.query(
    `INSERT INTO accounting_firm_access_audit
     (id, grant_id, firm_company_id, client_company_id, actor_user_id, action, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [randomUUID(), input.grantId || null, input.firmId, input.clientId, input.userId, input.action, JSON.stringify(input.metadata || {})]);
}

export function registerAccountingFirmRoutes(app: Express) {
  app.get('/api/accounting-firm/status', async (req, res) => {
    const actor = identity(req); const companyId = String(req.query.companyId || '');
    if (!actor || !companyId) return res.status(400).json({ error: 'Selecciona una empresa.' });
    const db = controlPlane(); const client = await db.connect();
    try {
      const own = await activeFirmMember(client, actor.uid, companyId);
      if (!own) return res.status(403).json({ error: 'No tienes una membresía activa en esta firma contable.' });
      const enabled = own.workspace?.accountingFirmEnabled === true;
      const [outgoing, incoming] = await Promise.all([
        client.query(`SELECT g.id,g.status,g.scopes,g.requested_at,g.decided_at,
          c.id AS client_company_id,c.legal_name,c.trade_name,c.rif
          FROM company_accounting_firm_grants g JOIN platform_companies c ON c.id=g.client_company_id
          WHERE g.firm_company_id=$1 ORDER BY g.requested_at DESC`, [companyId]),
        client.query(`SELECT g.id,g.status,g.scopes,g.requested_at,
          f.id AS firm_company_id,f.legal_name,f.trade_name,f.rif
          FROM company_accounting_firm_grants g JOIN platform_companies f ON f.id=g.firm_company_id
          WHERE g.client_company_id=$1 ORDER BY g.requested_at DESC`, [companyId]),
      ]);
      return res.json({ enabled, outgoing: outgoing.rows, incoming: incoming.rows });
    } catch (error) {
      return res.status(503).json({ error: 'No se pudo cargar el módulo de firma contable.' });
    } finally { client.release(); }
  });

  app.post('/api/accounting-firm/enable', async (req, res) => {
    const actor = identity(req); const companyId = String(req.body?.companyId || '');
    if (!actor || !companyId) return res.status(400).json({ error: 'Selecciona una empresa.' });
    const db = controlPlane(); const client = await db.connect();
    try {
      await client.query('BEGIN');
      const own = await member(client, actor.uid, companyId);
      if (!own) { await client.query('ROLLBACK'); return res.status(403).json({ error: 'No puedes activar esta función.' }); }
      await client.query(`UPDATE platform_companies SET workspace = COALESCE(workspace,'{}'::jsonb) || '{"accountingFirmEnabled":true}'::jsonb, updated_at=NOW() WHERE id=$1`, [companyId]);
      await client.query('COMMIT');
      return res.json({ enabled: true });
    } catch (error) { await client.query('ROLLBACK'); return res.status(503).json({ error: 'No se pudo activar la firma contable.' }); }
    finally { client.release(); }
  });

  app.get('/api/accounting-firm/directory', async (req, res) => {
    const actor = identity(req); const companyId = String(req.query.companyId || '');
    if (!actor || !companyId) return res.status(400).json({ error: 'Selecciona una empresa.' });
    const db = controlPlane(); const client = await db.connect();
    try {
      const own = await member(client, actor.uid, companyId);
      if (!own) return res.status(403).json({ error: 'No puedes consultar el directorio.' });
      const q = String(req.query.q || '').trim().slice(0, 80);
      const found = await client.query(
        `SELECT id, legal_name, trade_name, rif FROM platform_companies
         WHERE status='active' AND id<>$1
         AND ($2='' OR legal_name ILIKE '%'||$2||'%' OR trade_name ILIKE '%'||$2||'%' OR rif ILIKE '%'||$2||'%')
         ORDER BY trade_name, legal_name LIMIT 20`, [companyId, q]);
      return res.json({ firms: found.rows });
    } catch { return res.status(503).json({ error: 'No se pudo consultar el directorio.' }); }
    finally { client.release(); }
  });

  app.post('/api/accounting-firm/request', async (req, res) => {
    const actor = identity(req); const firmId = String(req.body?.firmCompanyId || '');
    const clientId = String(req.body?.clientCompanyId || '');
    if (!actor || !firmId || !clientId || firmId === clientId) return res.status(400).json({ error: 'Datos de solicitud inválidos.' });
    const scopes = scopesFrom(req.body?.scopes);
    if (scopes.length === 0) return res.status(400).json({ error: 'Debes seleccionar al menos un permiso válido.' });
    const db = controlPlane(); const client = await db.connect();
    try {
      await client.query('BEGIN');
      const firm = await member(client, actor.uid, firmId);
      if (!firm || firm.workspace?.accountingFirmEnabled !== true) { await client.query('ROLLBACK'); return res.status(403).json({ error: 'La empresa debe activar primero su perfil de firma contable.' }); }
      const target = await client.query(`SELECT id FROM platform_companies WHERE id=$1 AND status='active'`, [clientId]);
      if (!target.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'No se encontró la empresa cliente.' }); }
      const inserted = await client.query(
        `INSERT INTO company_accounting_firm_grants
         (id,firm_company_id,client_company_id,scopes,status,requested_by_user_id,requested_at)
         VALUES ($1,$2,$3,$4,'requested',$5,NOW())
         ON CONFLICT (firm_company_id,client_company_id) DO UPDATE
         SET scopes=EXCLUDED.scopes,status='requested',requested_by_user_id=EXCLUDED.requested_by_user_id,
             requested_at=NOW(),decided_by_user_id=NULL,decided_at=NULL,revoked_at=NULL
         WHERE company_accounting_firm_grants.status IN ('rejected','revoked')
         RETURNING id`,
        [randomUUID(), firmId, clientId, scopes, firm.user_id]);
      if (!inserted.rows[0]) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Ya existe una solicitud o autorización para esta empresa.' }); }
      await audit(client, { grantId: inserted.rows[0].id, firmId, clientId, userId: firm.user_id, action: 'access.requested', metadata: { scopes } });
      await client.query('COMMIT');
      return res.status(201).json({ success: true, grantId: inserted.rows[0].id });
    } catch { await client.query('ROLLBACK'); return res.status(503).json({ error: 'No se pudo crear la solicitud.' }); }
    finally { client.release(); }
  });

  app.post('/api/accounting-firm/requests/:id/decision', async (req, res) => {
    const actor = identity(req); const clientId = String(req.body?.clientCompanyId || '');
    const decision = req.body?.decision;
    if (!actor || !clientId || !['approve','reject'].includes(decision)) return res.status(400).json({ error: 'Decisión inválida.' });
    const db = controlPlane(); const client = await db.connect();
    try {
      await client.query('BEGIN');
      const own = await member(client, actor.uid, clientId);
      if (!own) { await client.query('ROLLBACK'); return res.status(403).json({ error: 'Solo el administrador de la empresa cliente puede decidir.' }); }
      const result = await client.query(
        `UPDATE company_accounting_firm_grants SET status=$2,decided_by_user_id=$3,decided_at=NOW()
         WHERE id=$1 AND client_company_id=$4 AND status='requested'
         RETURNING id,firm_company_id,client_company_id,scopes`,
        [req.params.id, decision === 'approve' ? 'active' : 'rejected', own.user_id, clientId]);
      if (!result.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'La solicitud ya no está pendiente.' }); }
      const row = result.rows[0];
      await audit(client, { grantId: row.id, firmId: row.firm_company_id, clientId, userId: own.user_id, action: decision === 'approve' ? 'access.approved' : 'access.rejected', metadata: { scopes: row.scopes } });
      await client.query('COMMIT');
      return res.json({ success: true, status: decision === 'approve' ? 'active' : 'rejected' });
    } catch { await client.query('ROLLBACK'); return res.status(503).json({ error: 'No se pudo procesar la decisión.' }); }
    finally { client.release(); }
  });

  app.delete('/api/accounting-firm/grants/:id', async (req, res) => {
    const actor = identity(req); const companyId = String(req.body?.companyId || req.query.companyId || '');
    if (!actor || !companyId) return res.status(400).json({ error: 'Selecciona la empresa.' });
    const db = controlPlane(); const client = await db.connect();
    try {
      await client.query('BEGIN');
      const own = await member(client, actor.uid, companyId);
      if (!own) { await client.query('ROLLBACK'); return res.status(403).json({ error: 'No puedes revocar este acceso.' }); }
      const result = await client.query(
        `UPDATE company_accounting_firm_grants SET status='revoked',revoked_at=NOW()
         WHERE id=$1 AND client_company_id=$2 AND status='active'
         RETURNING id,firm_company_id,client_company_id`, [req.params.id, companyId]);
      if (!result.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'No se encontró un acceso activo.' }); }
      const row = result.rows[0];
      await audit(client, { grantId: row.id, firmId: row.firm_company_id, clientId: companyId, userId: own.user_id, action: 'access.revoked' });
      await client.query('COMMIT');
      return res.json({ success: true });
    } catch { await client.query('ROLLBACK'); return res.status(503).json({ error: 'No se pudo revocar el acceso.' }); }
    finally { client.release(); }
  });

  // Lectura delegada: el contador nunca cambia el tenant activo de su sesión.
  // Cada petición vuelve a comprobar membresía, grant vigente y scopes en control plane.
  app.get('/api/accounting-firm/clients/:clientCompanyId/books', async (req, res) => {
    const actor = identity(req);
    const firmId = String(req.query.firmCompanyId || '');
    const clientId = String(req.params.clientCompanyId || '');
    if (!actor || !firmId || !clientId || firmId === clientId) {
      return res.status(400).json({ error: 'Solicitud de consulta inválida.' });
    }

    const db = controlPlane();
    const client = await db.connect();
    try {
      const access = await client.query(
        `SELECT u.id AS user_id, m.role AS member_role,
                g.id AS grant_id, g.scopes, g.expires_at,
                c.id AS client_company_id, c.status AS client_status, c.workspace AS client_workspace,
                t.secret_reference, t.encrypted_connection_secret
         FROM platform_users u
         JOIN company_memberships m ON m.user_id=u.id AND m.status='active'
         JOIN platform_companies firm ON firm.id=m.company_id AND firm.status='active'
         JOIN company_accounting_firm_grants g
           ON g.firm_company_id=firm.id AND g.client_company_id=$3 AND g.status='active'
         JOIN platform_companies c ON c.id=g.client_company_id AND c.status='active'
         JOIN tenant_database_connections t ON t.company_id=c.id AND t.status='ready'
         WHERE u.auth_provider='firebase' AND u.auth_subject=$1 AND u.status='active'
           AND firm.id=$2 AND firm.workspace->>'accountingFirmEnabled'='true'
           AND m.role IN ('owner','admin','accountant','auditor')
           AND (g.expires_at IS NULL OR g.expires_at>NOW())
         LIMIT 1`,
        [actor.uid, firmId, clientId],
      );
      const row = access.rows[0];
      if (!row) return res.status(403).json({ error: 'No existe una autorización vigente para consultar esta empresa.' });

      const scopes = Array.isArray(row.scopes)
        ? [...new Set(row.scopes.filter((scope: unknown): scope is string => typeof scope === 'string' && SCOPES.has(scope)))]
        : [];
      if (scopes.length === 0) {
        return res.status(403).json({ error: 'Esta autorización no contiene permisos de lectura válidos.' });
      }
      const connectionString = await new LocalEnvironmentTenantSecretProvider().getConnectionString(
        row.secret_reference || null, row.encrypted_connection_secret || null,
      );
      const workspace = row.client_workspace && typeof row.client_workspace === 'object' ? row.client_workspace : {};
      const context = {
        companyId: clientId,
        uid: actor.uid,
        role: 'auditor' as const,
        industryTemplate: resolveIndustryTemplate(workspace.industryTemplate),
        connectionString,
      };

      const books = await tenantStorageContext.run(context, async () => {
        const state = await readTenantWorkspaceState();
        const sql = getNeonSql();
        if (!sql) throw new Error('No se pudo abrir la base de datos autorizada.');
        const result: Record<string, unknown> = {};
        if (scopes.includes('journal_read') || scopes.includes('ledger_read')) {
          const entries = await sql`SELECT id, fecha, numero_asiento, tipo, origen, sujeto, rif, documento,
            total_debe, total_haber, lineas FROM accounting_entries ORDER BY fecha DESC LIMIT 500`;
          if (scopes.includes('journal_read')) result.journal = entries;
          if (scopes.includes('ledger_read')) result.ledger = entries;
        }
        if (scopes.includes('purchases_read')) {
          // Una consulta exitosa sin filas devuelve []; un error SQL debe propagarse
          // para que el endpoint responda 503 y no simule que no existen compras.
          result.purchases = await queryDelegatedPurchases(sql);
        }
        if (scopes.includes('sales_read')) result.sales = Array.isArray(state?.sales) ? state.sales.slice(0, 500) : [];
        if (scopes.includes('expenses_read')) result.expenses = Array.isArray(state?.expenses) ? state.expenses.slice(0, 500) : [];
        if (scopes.includes('reports_read')) {
          result.summary = {
            salesCount: Array.isArray(state?.sales) ? state.sales.length : 0,
            expensesCount: Array.isArray(state?.expenses) ? state.expenses.length : 0,
            journalCount: Array.isArray(state?.accountingEntries) ? state.accountingEntries.length : 0,
          };
        }
        if (scopes.includes('tax_read')) result.tax = state?.fiscalBoard || {};
        return result;
      });

      await audit(client, {
        grantId: row.grant_id, firmId, clientId, userId: row.user_id,
        action: 'books.read', metadata: { scopes: Object.keys(books) },
      });
      return res.json({ success: true, clientCompanyId: clientId, scopes, books });
    } catch (error) {
      return respondBooksReadError(res, error, firmId, clientId, actor.uid);
    } finally {
      client.release();
    }
  });

}

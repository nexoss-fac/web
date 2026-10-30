import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import express from 'express';
import { createServer } from 'node:http';
import { findDelegatedBooksAccess, registerAccountingFirmRoutes } from './accountingFirmRoutes.ts';
import { tenantStorageContext } from '../multiempresa/companyAccess.ts';

const connectionString = process.env.CONTROL_PLANE_TEST_DATABASE_URL?.trim();

test('la firma solo resuelve libros del cliente con grant activo, usuario vigente y tenant listo', { skip: !connectionString }, async () => {
  const adminPool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 5_000 });
  const schema = `accounting_firm_${randomUUID().replace(/-/g, '')}`;
  let pool: Pool | undefined;
  try {
    await adminPool.query(`CREATE SCHEMA "${schema}"`);
    pool = new Pool({ connectionString, max: 2, connectionTimeoutMillis: 5_000, options: `-c search_path=${schema}` });

    for (const migration of [
      '../../db/migrations/control-plane/001_control_plane.sql',
      '../../db/migrations/control-plane/002_current_platform_model.sql',
      '../../db/migrations/control-plane/020_accounting_firm_access.sql',
    ]) {
      await pool.query(fs.readFileSync(new URL(migration, import.meta.url), 'utf8'));
    }

    const firmId = randomUUID();
    const clientBId = randomUUID();
    const clientCId = randomUUID();
    const firmUserId = randomUUID();
    const firmUid = `firm-user-${randomUUID()}`;
    const grantBId = randomUUID();
    const grantCId = randomUUID();

    await pool.query(
      `INSERT INTO platform_companies (id,slug,legal_name,status,workspace)
       VALUES ($1,'firm-test','Firma de prueba','active','{"accountingFirmEnabled":true}'::jsonb),
              ($2,'client-b','Cliente B','active','{}'::jsonb),
              ($3,'client-c','Cliente C','active','{}'::jsonb)`,
      [firmId, clientBId, clientCId],
    );
    await pool.query(
      `INSERT INTO platform_users (id,auth_provider,auth_subject,email,status)
       VALUES ($1,'firebase',$2,'firm@example.invalid','active')`,
      [firmUserId, firmUid],
    );
    await pool.query(
      `INSERT INTO company_memberships (company_id,user_id,role,status)
       VALUES ($1,$2,'accountant','active')`,
      [firmId, firmUserId],
    );
    await pool.query(
      `INSERT INTO tenant_database_connections (company_id,secret_reference,status)
       VALUES ($1,'local-env:CLIENT_B_DATABASE_URL','ready'),
              ($2,'local-env:CLIENT_C_DATABASE_URL','ready')`,
      [clientBId, clientCId],
    );
    await pool.query(
      `INSERT INTO company_accounting_firm_grants
       (id,firm_company_id,client_company_id,scopes,status,requested_by_user_id,expires_at)
       VALUES ($1,$2,$3,ARRAY['journal_read','reports_read'],'active',$4,NOW()+INTERVAL '1 day'),
              ($5,$2,$6,ARRAY['journal_read'],'active',$4,NOW()-INTERVAL '1 minute')`,
      [grantBId, firmId, clientBId, firmUserId, grantCId, clientCId],
    );

    const db = await pool.connect();
    try {
      const allowed = await findDelegatedBooksAccess(db, firmUid, firmId, clientBId);
      assert.equal(allowed?.client_company_id, clientBId);
      assert.equal(allowed?.secret_reference, 'local-env:CLIENT_B_DATABASE_URL');
      assert.deepEqual(allowed?.scopes, ['journal_read', 'reports_read']);

      // Recorrido HTTP real: middleware de identidad de prueba, autorización SQL real,
      // contexto tenant aislado, respuesta de libros y auditoría persistida en PostgreSQL.
      const app = express();
      app.use((req, _res, next) => {
        (req as typeof req & { firebaseIdentity?: { uid: string } }).firebaseIdentity = { uid: firmUid };
        next();
      });
      let observedTenantCompany: string | undefined;
      let observedConnection: string | undefined;
      const tenantState = {
        sales: [{ id: 'sale-client-b', total: 125 }],
        expenses: [{ id: 'expense-client-b', amount: 25 }],
        accountingEntries: [{ id: 'entry-client-b' }],
      };
      const fakeTenantSql = (async (strings: TemplateStringsArray) => {
        const tenant = tenantStorageContext.getStore();
        observedTenantCompany = tenant?.companyId;
        observedConnection = tenant?.connectionString;
        assert.equal(tenant?.companyId, clientBId);
        assert.equal(tenant?.role, 'auditor');
        assert.equal(tenant?.uid, firmUid);
        assert.equal(tenant?.connectionString, 'postgres://tenant-b.invalid/db');
        assert.match(strings.join(' '), /accounting_entries/);
        return [{ id: 'entry-client-b', numero_asiento: 'A-001' }];
      }) as any;
      registerAccountingFirmRoutes(app, {
        controlPlane: () => pool!,
        getConnectionString: async () => 'postgres://tenant-b.invalid/db',
        readWorkspaceState: async () => {
          assert.equal(tenantStorageContext.getStore()?.companyId, clientBId);
          return tenantState;
        },
        getTenantSql: () => fakeTenantSql,
      });
      const server = createServer(app);
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      try {
        const address = server.address();
        assert.ok(address && typeof address !== 'string');
        const response = await fetch(`http://127.0.0.1:${address.port}/api/accounting-firm/clients/${clientBId}/books?firmCompanyId=${firmId}`);
        assert.equal(response.status, 200);
        const payload = await response.json() as any;
        assert.equal(payload.success, true);
        assert.equal(payload.clientCompanyId, clientBId);
        assert.deepEqual(payload.books.journal, [{ id: 'entry-client-b', numero_asiento: 'A-001' }]);
        assert.equal(observedTenantCompany, clientBId);
        assert.equal(observedConnection, 'postgres://tenant-b.invalid/db');
        const auditRows = await db.query(
          `SELECT action, grant_id, firm_company_id, client_company_id, actor_user_id, metadata
           FROM accounting_firm_access_audit WHERE grant_id=$1 AND action='books.read'`,
          [grantBId],
        );
        assert.equal(auditRows.rows.length, 1);
        assert.equal(auditRows.rows[0].firm_company_id, firmId);
        assert.equal(auditRows.rows[0].client_company_id, clientBId);
        assert.equal(auditRows.rows[0].actor_user_id, firmUserId);
        assert.deepEqual(auditRows.rows[0].metadata, { scopes: ['journal', 'summary'] });
      } finally {
        await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      }

      // Otra empresa con autorización vencida nunca debe resolverse.
      assert.equal(await findDelegatedBooksAccess(db, firmUid, firmId, clientCId), null);

      // Revocación inmediata: la siguiente petición ya no obtiene el tenant.
      await db.query(`UPDATE company_accounting_firm_grants SET status='revoked',revoked_at=NOW() WHERE id=$1`, [grantBId]);
      assert.equal(await findDelegatedBooksAccess(db, firmUid, firmId, clientBId), null);

      // Usuario bloqueado: incluso con grant activo, no puede consultar.
      await db.query(`UPDATE company_accounting_firm_grants SET status='active',revoked_at=NULL WHERE id=$1`, [grantBId]);
      await db.query(`UPDATE platform_users SET status='blocked' WHERE id=$1`, [firmUserId]);
      assert.equal(await findDelegatedBooksAccess(db, firmUid, firmId, clientBId), null);

      // Perfil de firma deshabilitado: se deniega el acceso.
      await db.query(`UPDATE platform_users SET status='active' WHERE id=$1`, [firmUserId]);
      await db.query(`UPDATE platform_companies SET workspace='{"accountingFirmEnabled":false}'::jsonb WHERE id=$1`, [firmId]);
      assert.equal(await findDelegatedBooksAccess(db, firmUid, firmId, clientBId), null);

      // Conexión tenant no lista: no se devuelve ningún secreto/conexión.
      await db.query(`UPDATE platform_companies SET workspace='{"accountingFirmEnabled":true}'::jsonb WHERE id=$1`, [firmId]);
      await db.query(`UPDATE tenant_database_connections SET status='disabled' WHERE company_id=$1`, [clientBId]);
      assert.equal(await findDelegatedBooksAccess(db, firmUid, firmId, clientBId), null);
    } finally {
      db.release();
    }
  } finally {
    if (pool) await pool.end();
    await adminPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await adminPool.end();
  }
});

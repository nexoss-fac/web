import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { tenantStorageContext } from './companyAccess.ts';
import { resolveIndustryTemplate } from '../../src/domain/companyIndustries.ts';

const adminConnection = process.env.CONTROL_PLANE_TEST_DATABASE_URL?.trim();

test('cada contexto tenant consulta exclusivamente su propia base PostgreSQL física', { skip: !adminConnection }, async () => {
  const admin = new Pool({ connectionString: adminConnection, max: 1, connectionTimeoutMillis: 5_000 });
  const suffix = randomUUID().replace(/-/g, '').slice(0, 16);
  const databaseA = `nexoss_tenant_a_${suffix}`;
  const databaseB = `nexoss_tenant_b_${suffix}`;
  const pools = new Map<string, Pool>();
  const created: string[] = [];

  const databaseUrl = (database: string) => {
    const url = new URL(adminConnection!);
    url.pathname = `/${database}`;
    return url.toString();
  };

  // Adaptador tagged-template compatible con la consulta de libros de la ruta.
  // Las consultas se ejecutan mediante pg contra la conexión del contexto actual.
  const tenantSql = () => {
    const context = tenantStorageContext.getStore();
    assert.ok(context?.companyId, 'La consulta debe ejecutarse dentro de un contexto tenant');
    assert.ok(context.connectionString, 'El contexto debe contener la conexión tenant');
    const pool = pools.get(context.connectionString);
    assert.ok(pool, 'La conexión debe corresponder a una de las dos bases tenant creadas para esta prueba');
    return (async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const result = await pool.query(strings.join('$1'), values);
      return result.rows;
    }) as any;
  };

  try {
    for (const database of [databaseA, databaseB]) {
      await admin.query(`CREATE DATABASE "${database}"`);
      created.push(database);
      const pool = new Pool({ connectionString: databaseUrl(database), max: 2, connectionTimeoutMillis: 5_000 });
      pools.set(databaseUrl(database), pool);
      await pool.query(`
        CREATE TABLE isolation_probe (
          id integer PRIMARY KEY,
          tenant_marker text NOT NULL
        )
      `);
    }

    const connectionA = databaseUrl(databaseA);
    const connectionB = databaseUrl(databaseB);
    await pools.get(connectionA)!.query(
      'INSERT INTO isolation_probe (id, tenant_marker) VALUES (1, $1)',
      ['ONLY_COMPANY_A'],
    );
    await pools.get(connectionB)!.query(
      'INSERT INTO isolation_probe (id, tenant_marker) VALUES (1, $1)',
      ['ONLY_COMPANY_B'],
    );

    const context = (companyId: string, connectionString: string) => ({
      companyId,
      uid: `test-user-${companyId}`,
      role: 'owner' as const,
      industryTemplate: resolveIndustryTemplate(undefined),
      connectionString,
    });

    const readFor = async (companyId: string, connectionString: string) =>
      tenantStorageContext.run(context(companyId, connectionString), async () => {
        const sql = tenantSql();
        const rows = await sql`SELECT tenant_marker FROM isolation_probe WHERE id = 1`;
        return { contextCompany: tenantStorageContext.getStore()?.companyId, rows };
      });

    // Ejecutar ambas lecturas a la vez para detectar contaminación del contexto
    // asíncrono o reutilización accidental de la conexión de otra empresa.
    const [resultA, resultB] = await Promise.all([
      readFor('company-a', connectionA),
      readFor('company-b', connectionB),
    ]);

    assert.equal(resultA.contextCompany, 'company-a');
    assert.deepEqual(resultA.rows, [{ tenant_marker: 'ONLY_COMPANY_A' }]);
    assert.equal(resultB.contextCompany, 'company-b');
    assert.deepEqual(resultB.rows, [{ tenant_marker: 'ONLY_COMPANY_B' }]);

    // La conexión de A no contiene datos de B y viceversa.
    const [crossA, crossB] = await Promise.all([
      pools.get(connectionA)!.query(
        'SELECT tenant_marker FROM isolation_probe WHERE tenant_marker = $1',
        ['ONLY_COMPANY_B'],
      ),
      pools.get(connectionB)!.query(
        'SELECT tenant_marker FROM isolation_probe WHERE tenant_marker = $1',
        ['ONLY_COMPANY_A'],
      ),
    ]);
    assert.equal(crossA.rowCount, 0);
    assert.equal(crossB.rowCount, 0);
  } finally {
    await Promise.all([...pools.values()].map((pool) => pool.end()));
    for (const database of created.reverse()) {
      await admin.query(
        'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
        [database],
      );
      await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
    }
    await admin.end();
  }
});

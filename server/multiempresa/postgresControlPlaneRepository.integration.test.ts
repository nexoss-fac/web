import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { PostgresControlPlaneRepository } from './postgresControlPlaneRepository.ts';

const connectionString = process.env.CONTROL_PLANE_TEST_DATABASE_URL?.trim();

test('PostgreSQL rejects cross-company reads, onboarding writes, invites and revocations', { skip: !connectionString }, async () => {
  const adminPool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 5_000 });
  const schema = `cp_test_${randomUUID().replace(/-/g, '')}`;
  let scopedPool: Pool | undefined;
  let repository: PostgresControlPlaneRepository | undefined;
  try {
    await adminPool.query(`CREATE SCHEMA "${schema}"`);
    scopedPool = new Pool({
      connectionString,
      max: 2,
      connectionTimeoutMillis: 5_000,
      options: `-c search_path=${schema}`,
    });
    await scopedPool.query(fs.readFileSync(new URL('../../db/migrations/control-plane/001_control_plane.sql', import.meta.url), 'utf8'));
    await scopedPool.query(fs.readFileSync(new URL('../../db/migrations/control-plane/002_current_platform_model.sql', import.meta.url), 'utf8'));
    await scopedPool.query(
      `INSERT INTO platform_plans
         (id, name, billing_interval, max_users, max_products, max_branches, max_warehouses, modules)
       VALUES ('trial', 'Prueba', 'month', 3, 500, 1, 1, '["pos","inventory"]'::jsonb)`,
    );

    repository = new PostgresControlPlaneRepository(scopedPool);
    const companyA = await repository.createCompany(
      { legalName: 'Empresa integración A', address: 'A', phone: '111', activity: 'Pruebas', countryCode: 'VE' },
      { uid: 'integration-user-a', email: 'a@example.invalid', emailVerified: true },
    );
    const companyB = await repository.createCompany(
      { legalName: 'Empresa integración B', address: 'B', phone: '222', activity: 'Pruebas', countryCode: 'VE' },
      { uid: 'integration-user-b', email: 'b@example.invalid', emailVerified: true },
    );

    assert.ok(await repository.findMembership({ provider: 'firebase', subject: 'integration-user-a' }, companyA.id));
    assert.equal(await repository.findMembership({ provider: 'firebase', subject: 'integration-user-a' }, companyB.id), null);
    assert.equal(await repository.getOnboarding('integration-user-a', companyB.id), null);

    const deniedStep = await repository.saveOnboardingStep(
      { uid: 'integration-user-a', email: 'a@example.invalid' },
      companyB.id,
      2,
      { countryCode: 'XX', currency: 'EUR' },
    );
    assert.equal(deniedStep, null);
    const before = await scopedPool.query(`SELECT fiscal FROM platform_companies WHERE id = $1`, [companyB.id]);
    assert.deepEqual(before.rows[0].fiscal, {});

    const ownInvite = await repository.createInvitation(companyA.id, 'collaborator@example.invalid', 'cashier', { uid: 'integration-user-a' });
    assert.ok(ownInvite);
    assert.equal(await repository.createInvitation(companyB.id, 'attacker@example.invalid', 'cashier', { uid: 'integration-user-a' }), null);
    assert.equal(await repository.revokeInvitation(companyA.id, ownInvite!.id, 'integration-user-b'), false);
    assert.equal(await repository.revokeInvitation(companyB.id, ownInvite!.id, 'integration-user-a'), false);
  } finally {
    if (repository) await repository.close();
    else if (scopedPool) await scopedPool.end();
    await adminPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await adminPool.end();
  }
});

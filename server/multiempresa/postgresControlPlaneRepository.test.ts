import test from 'node:test';
import assert from 'node:assert/strict';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { PostgresControlPlaneRepository, type ControlPlanePool } from './postgresControlPlaneRepository.ts';

type RecordedQuery = { text: string; values: unknown[] };

function mockPool(run: (text: string, values: unknown[]) => QueryResult<QueryResultRow>): ControlPlanePool & { queries: RecordedQuery[] } {
  const queries: RecordedQuery[] = [];
  const client = {
    async query(text: string, values: unknown[] = []) {
      queries.push({ text, values });
      return run(text, values);
    },
    release() {},
  };
  return {
    queries,
    async connect() { return client as unknown as PoolClient; },
    async end() {},
  } as ControlPlanePool & { queries: RecordedQuery[] };
}

function result(rows: QueryResultRow[] = [], rowCount = rows.length): QueryResult<QueryResultRow> {
  return { rows, rowCount, command: '', oid: 0, fields: [] };
}

test('la consulta de membresía enlaza identidad, proveedor y empresa solicitada en servidor', async () => {
  const pool = mockPool((text, values) => {
    assert.match(text, /u\.auth_provider = \$1 AND u\.auth_subject = \$2/);
    assert.match(text, /c\.id = \$3 AND m\.status = 'active'/);
    const allowed = values[0] === 'firebase' && values[1] === 'uid-company-a' && values[2] === 'company-a';
    return result(allowed ? [{
      company_id: 'company-a', slug: 'empresa-a', company_status: 'active',
      membership_status: 'active', role: 'owner', secret_reference: 'secrets/a',
      connection_status: 'ready', modules: ['pos', 'inventory'],
    }] : []);
  });
  const repository = new PostgresControlPlaneRepository(pool);

  assert.equal(await repository.findMembership({ provider: 'firebase', subject: 'uid-company-a' }, 'company-a') !== null, true);
  assert.equal(await repository.findMembership({ provider: 'firebase', subject: 'uid-company-a' }, 'company-b'), null);
  assert.equal(await repository.findMembership({ provider: 'firebase', subject: 'uid-company-b' }, 'company-a'), null);
  assert.deepEqual(pool.queries.map((query) => query.values), [
    ['firebase', 'uid-company-a', 'company-a'],
    ['firebase', 'uid-company-a', 'company-b'],
    ['firebase', 'uid-company-b', 'company-a'],
  ]);
});

test('la revocación de invitación siempre está limitada a su empresa y a owner/admin', async () => {
  const pool = mockPool((text, values) => {
    if (text.includes('UPDATE company_invitations')) {
      assert.match(text, /i\.id = \$1 AND i\.company_id = \$2/);
      assert.match(text, /m\.company_id = i\.company_id AND m\.status = 'active' AND m\.role IN \('owner', 'admin'\)/);
      assert.deepEqual(values, ['invite-a', 'company-a', 'uid-a']);
      return result([{ company_id: 'company-a' }]);
    }
    if (text.includes('SELECT id FROM platform_users')) return result([{ id: 'user-a' }]);
    return result();
  });
  const repository = new PostgresControlPlaneRepository(pool);

  assert.equal(await repository.revokeInvitation('company-a', 'invite-a', 'uid-a'), true);
  const update = pool.queries.find((query) => query.text.includes('UPDATE company_invitations'));
  assert.ok(update);
  assert.deepEqual(update.values, ['invite-a', 'company-a', 'uid-a']);
});

test('un usuario sin membresía no puede crear invitaciones para una empresa', async () => {
  const pool = mockPool((text) => {
    if (text === 'BEGIN' || text === 'ROLLBACK' || text === 'COMMIT') return result();
    if (text.includes('SELECT u.id AS user_id, p.max_users')) {
      assert.match(text, /m\.user_id = u\.id AND m\.company_id = \$2/);
      assert.match(text, /m\.status = 'active' AND m\.role IN \('owner', 'admin'\)/);
      return result();
    }
    throw new Error(`Unexpected query in denied invitation test: ${text}`);
  });
  const repository = new PostgresControlPlaneRepository(pool);

  assert.equal(await repository.createInvitation('company-b', 'intruder@example.invalid', 'cashier', { uid: 'uid-company-a' }), null);
  assert.equal(pool.queries.length, 3);
  assert.equal(pool.queries[0].text, 'BEGIN');
  assert.match(pool.queries[1].text, /m\.user_id = u\.id AND m\.company_id = \$2/);
  assert.equal(pool.queries[2].text, 'COMMIT');
});

test('no permite invitar a un correo que ya pertenece activamente a la empresa', async () => {
  const pool = mockPool((text) => {
    if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return result();
    if (text.includes('SELECT u.id AS user_id, p.max_users')) return result([{ user_id: 'owner-user', max_users: 4 }]);
    if (text.includes('UPDATE company_invitations SET status =')) return result();
    if (text.includes('::text AS count')) return result([{ count: '1' }]);
    if (text.includes('SELECT 1 FROM platform_users u')) return result([{ '?column?': 1 }]);
    throw new Error(`Unexpected query in duplicate membership test: ${text}`);
  });
  const repository = new PostgresControlPlaneRepository(pool);

  assert.equal(await repository.createInvitation('company-a', 'member@example.invalid', 'cashier', { uid: 'owner-uid' }), null);
  assert.equal(pool.queries.some((query) => query.text.includes('INSERT INTO company_invitations')), false);
});

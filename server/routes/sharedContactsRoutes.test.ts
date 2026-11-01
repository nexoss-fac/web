import test from 'node:test';
import assert from 'node:assert/strict';
import { tenantStorageContext } from '../multiempresa/companyAccess.ts';
import { registerSharedContactsRoutes } from './sharedContactsRoutes.ts';

const tenant = {
  companyId: '00000000-0000-4000-8000-000000000001',
  uid: 'firebase-user-1',
  role: 'owner' as const,
  industryTemplate: 'other' as const,
};

function harness(queryHandler: (sql: string, params: unknown[]) => Promise<any>) {
  const handlers: Record<string, Function> = {};
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const client = {
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql: String(sql), params });
      return queryHandler(String(sql), params);
    },
    release() {},
  };
  const app = {
    get(path: string, handler: Function) { handlers[`GET ${path}`] = handler; },
    post(path: string, handler: Function) { handlers[`POST ${path}`] = handler; },
  };
  registerSharedContactsRoutes(app as any, { controlPlane: () => ({ connect: async () => client }) as any });
  return { handlers, calls };
}

function response() {
  return {
    statusCode: 200,
    body: undefined as any,
    status(code: number) { this.statusCode = code; return this; },
    json(value: unknown) { this.body = value; return this; },
  };
}

test('GET por documento normaliza RIF y solo consulta el contacto compartido y la relación de la empresa activa', async () => {
  const { handlers, calls } = harness(async (sql, params) => {
    if (sql.includes('SELECT 1') && sql.includes('company_memberships')) return { rows: [{ ok: 1 }] };
    if (sql.includes('FROM platform_shared_contacts c')) {
      assert.equal(params[0], 'J123456789');
      assert.equal(params[1], tenant.companyId);
      return { rows: [{ id: 'contact-1', tipo: null, associated: false, nombre: 'Proveedor Demo', notas: '' }] };
    }
    throw new Error(`Consulta inesperada: ${sql}`);
  });
  const res = response();
  await tenantStorageContext.run(tenant, () => handlers['GET /api/contacts'](
    { query: { documento: 'J-123.456.789' }, firebaseIdentity: { uid: tenant.uid } }, res,
  ));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.contact.associated, false);
  assert.equal(calls.length, 2);
  assert.equal(calls.some((call) => /company_shared_contact_relations.*company_id/.test(call.sql)), true);
});

test('POST crea identidad global una sola vez y guarda notas en la relación privada', async () => {
  let insertedGlobal = false;
  let relationNotes: unknown;
  const { handlers, calls } = harness(async (sql, params) => {
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
    if (sql.includes('SELECT 1') && sql.includes('company_memberships')) return { rows: [{ ok: 1 }] };
    if (sql.includes('SELECT * FROM platform_shared_contacts')) return { rows: [] };
    if (sql.includes('INSERT INTO platform_shared_contacts')) {
      insertedGlobal = true;
      assert.equal(params[1], 'J123456789');
      return { rows: [{
        id: 'contact-1', document_display: 'J-12345678-9', name: 'Proveedor Demo',
        surname: '', phone: '', email: '', fiscal_address: '', created_at: new Date(),
      }] };
    }
    if (sql.includes('INSERT INTO company_shared_contact_relations')) {
      relationNotes = params[4];
      return { rows: [{ private_notes: params[4], updated_at: new Date() }] };
    }
    if (sql.includes('SELECT id FROM platform_users')) return { rows: [{ id: 'user-1' }] };
    if (sql.includes('INSERT INTO platform_audit_events')) return { rows: [] };
    throw new Error(`Consulta inesperada: ${sql}`);
  });
  const res = response();
  await tenantStorageContext.run(tenant, () => handlers['POST /api/contacts'](
    { body: { tipo: 'proveedor', documento: 'J-12345678-9', nombre: 'Proveedor Demo', notas: 'Condición privada MAKD' }, firebaseIdentity: { uid: tenant.uid } }, res,
  ));
  assert.equal(res.statusCode, 201);
  assert.equal(insertedGlobal, true);
  assert.equal(relationNotes, 'Condición privada MAKD');
  assert.equal(res.body.contact.notas, 'Condición privada MAKD');
  assert.equal(calls.some((call) => call.sql.includes('UPDATE platform_shared_contacts')), false);
});

test('POST reutiliza el RIF existente sin sobrescribir los datos compartidos', async () => {
  let insertedGlobal = false;
  const { handlers } = harness(async (sql) => {
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
    if (sql.includes('SELECT 1') && sql.includes('company_memberships')) return { rows: [{ ok: 1 }] };
    if (sql.includes('SELECT * FROM platform_shared_contacts')) return { rows: [{
      id: 'contact-existing', document_display: 'J-12345678-9', name: 'Nombre Oficial',
      surname: '', phone: '04140000000', email: 'oficial@example.com',
      fiscal_address: 'Dirección oficial', created_at: new Date(),
    }] };
    if (sql.includes('INSERT INTO platform_shared_contacts')) { insertedGlobal = true; return { rows: [] }; }
    if (sql.includes('INSERT INTO company_shared_contact_relations')) return { rows: [{ private_notes: '', updated_at: new Date() }] };
    if (sql.includes('SELECT id FROM platform_users')) return { rows: [{ id: 'user-1' }] };
    if (sql.includes('INSERT INTO platform_audit_events')) return { rows: [] };
    throw new Error(`Consulta inesperada: ${sql}`);
  });
  const res = response();
  await tenantStorageContext.run(tenant, () => handlers['POST /api/contacts'](
    { body: { tipo: 'cliente', documento: 'J-12345678-9', nombre: 'Nombre distinto' }, firebaseIdentity: { uid: tenant.uid } }, res,
  ));
  assert.equal(res.statusCode, 200);
  assert.equal(insertedGlobal, false);
  assert.equal(res.body.contact.nombre, 'Nombre Oficial');
  assert.equal(res.body.created, false);
});

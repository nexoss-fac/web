import assert from 'node:assert/strict';
import test from 'node:test';
import { queryDelegatedPurchases, respondBooksReadError, scopesFrom } from './accountingFirmRoutes.ts';

function fakeResponse() {
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  return response;
}

test('el endpoint distingue una consulta SQL fallida de una empresa sin compras', async () => {
  const sqlFailure = new Error('relation purchase_invoices does not exist');
  const sql = (async () => { throw sqlFailure; }) as unknown as Parameters<typeof queryDelegatedPurchases>[0];

  await assert.rejects(queryDelegatedPurchases(sql), (error) => error === sqlFailure);

  const response = fakeResponse();
  respondBooksReadError(response as never, sqlFailure, 'firma-1', 'cliente-1', 'contador-1');
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body, {
    error: 'No se pudieron abrir los libros autorizados.',
  });
});

test('una consulta SQL exitosa sin registros devuelve una lista vacía de compras', async () => {
  const sql = (async () => []) as unknown as Parameters<typeof queryDelegatedPurchases>[0];

  const purchases = await queryDelegatedPurchases(sql);

  assert.deepEqual(purchases, []);
  assert.ok(Array.isArray(purchases));
});


test('los permisos predeterminados solo se aplican cuando scopes se omite', () => {
  assert.deepEqual(scopesFrom(undefined), ['journal_read', 'ledger_read', 'reports_read']);
  assert.deepEqual(scopesFrom(null), ['journal_read', 'ledger_read', 'reports_read']);
});

test('una lista de permisos vacía o inválida no concede permisos implícitos', () => {
  assert.deepEqual(scopesFrom([]), []);
  assert.deepEqual(scopesFrom(['unknown_scope', 42, null]), []);
  assert.deepEqual(scopesFrom('journal_read'), []);
});

test('solo conserva permisos reconocidos y elimina duplicados', () => {
  assert.deepEqual(scopesFrom(['journal_read', 'journal_read', 'invalid', 'purchases_read']), [
    'journal_read', 'purchases_read',
  ]);
});

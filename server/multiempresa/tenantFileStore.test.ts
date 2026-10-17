import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { backupPathFor, readJsonFileWithBackup, tenantDataFiles, writeJsonFileAtomic } from './tenantFileStore.ts';

function tempFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexoss-store-'));
  return path.join(dir, 'store_state.json');
}

test('cada empresa obtiene rutas de persistencia distintas y debajo de tenants/', () => {
  const root = path.resolve('server/data');
  const first = tenantDataFiles(root, '11111111-1111-4111-8111-111111111111');
  const second = tenantDataFiles(root, '22222222-2222-4222-8222-222222222222');
  assert.notEqual(first.store, second.store);
  assert.notEqual(first.fiscalBoard, second.fiscalBoard);
  assert.ok(first.store.startsWith(path.join(root, 'tenants')));
  assert.ok(second.store.startsWith(path.join(root, 'tenants')));
});

test('rechaza identificadores que podrían escapar de la carpeta de tenant', () => {
  assert.throws(() => tenantDataFiles('server/data', '..\\..\\outside'));
  assert.throws(() => tenantDataFiles('server/data', 'company-x'));
});

test('la escritura atómica guarda la versión anterior en .prev y no deja temporales', () => {
  const file = tempFile();
  writeJsonFileAtomic(file, { version: 1 });
  writeJsonFileAtomic(file, { version: 2 });
  assert.deepEqual(readJsonFileWithBackup(file), { version: 2 });
  assert.deepEqual(JSON.parse(fs.readFileSync(backupPathFor(file), 'utf8')), { version: 1 });
  assert.deepEqual(fs.readdirSync(path.dirname(file)).filter((name) => name.endsWith('.tmp')), []);
});

test('un JSON dañado se recupera desde .prev en vez de reinicializarse', () => {
  const file = tempFile();
  writeJsonFileAtomic(file, { ventas: ['a'] });
  writeJsonFileAtomic(file, { ventas: ['a', 'b'] });
  fs.writeFileSync(file, '{"ventas": ["a", "b"', 'utf8'); // corte a mitad de escritura
  let recovered = false;
  assert.deepEqual(readJsonFileWithBackup(file, () => { recovered = true; }), { ventas: ['a'] });
  assert.equal(recovered, true);
});

test('si el JSON y su respaldo están dañados, lanza un error y no devuelve un estado vacío', () => {
  const file = tempFile();
  fs.writeFileSync(file, '{roto', 'utf8');
  assert.throws(() => readJsonFileWithBackup(file), /dañado/);
  fs.writeFileSync(backupPathFor(file), '{roto', 'utf8');
  assert.throws(() => readJsonFileWithBackup(file), /dañados/);
  assert.equal(fs.readFileSync(file, 'utf8'), '{roto');
});

test('devuelve undefined solo cuando no existe ningún archivo', () => {
  assert.equal(readJsonFileWithBackup(tempFile()), undefined);
});

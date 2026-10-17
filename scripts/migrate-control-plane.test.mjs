import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const migrationScript = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrate-control-plane.mjs');

function runMigration(environment) {
  return spawnSync(process.execPath, [migrationScript], {
    encoding: 'utf8',
    env: { ...process.env, ...environment },
    timeout: 10_000,
  });
}

test('el migrador rechaza por defecto conexiones a bases que no sean la central nueva', () => {
  const secret = 'do-not-print-this-password';
  const result = runMigration({
    CONTROL_PLANE_DATABASE_URL: `postgresql://migration:${secret}@127.0.0.1:5432/business`,
    CONFIRM_CONTROL_PLANE_MIGRATION: 'business',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /solo acepta la base dedicada nexoss_control_plane/);
  assert.equal(result.stderr.includes(secret), false);
});

test('el migrador exige confirmación explícita antes de conectar', () => {
  const result = runMigration({
    CONTROL_PLANE_DATABASE_URL: 'postgresql://migration:local-only@127.0.0.1:5432/nexoss_control_plane',
    CONFIRM_CONTROL_PLANE_MIGRATION: '',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Confirma el destino/);
  assert.equal(result.stderr.includes('local-only'), false);
});

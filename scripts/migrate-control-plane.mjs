import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const migrationDir = path.resolve(scriptDir, '..', 'db', 'migrations', 'control-plane');
const targetDatabase = 'nexoss_control_plane';

function migrationConnection() {
  const connectionString = process.env.CONTROL_PLANE_DATABASE_URL?.trim();
  if (!connectionString) throw new Error('Define CONTROL_PLANE_DATABASE_URL en la terminal segura o el gestor de secretos.');

  let parsed;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error('CONTROL_PLANE_DATABASE_URL no tiene un formato PostgreSQL válido.');
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || decodeURIComponent(parsed.pathname.slice(1)) !== targetDatabase) {
    throw new Error(`El migrador solo acepta la base dedicada ${targetDatabase}; no se conectó.`);
  }
  if (!parsed.username || !parsed.hostname) {
    throw new Error('La conexión PostgreSQL debe incluir usuario y host; usa Cloud SQL Auth Proxy o el conector de Cloud Run.');
  }
  if (process.env.CONFIRM_CONTROL_PLANE_MIGRATION !== targetDatabase) {
    throw new Error(`Confirma el destino configurando CONFIRM_CONTROL_PLANE_MIGRATION=${targetDatabase}.`);
  }

  return {
    connectionString,
    ssl: parsed.hostname.endsWith('.neon.tech') || process.env.PGSSLMODE === 'verify-full'
      ? { rejectUnauthorized: true }
      : undefined,
  };
}

async function main() {
  const pool = new Pool({ ...migrationConnection(), max: 1, connectionTimeoutMillis: 5000 });
  let client;
  try {
    client = await pool.connect();
    await client.query('SET search_path TO public');
    await client.query(`SELECT pg_advisory_lock(hashtext('nexoss-control-plane-migrations'))`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS nexoss_schema_migrations (
        migration_id TEXT PRIMARY KEY,
        sha256_hex CHAR(64) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const { rows: applied } = await client.query('SELECT migration_id, sha256_hex FROM nexoss_schema_migrations');
    const known = new Map(applied.map((row) => [row.migration_id, row.sha256_hex.trim()]));
    const { readdir } = await import('node:fs/promises');
    const files = (await readdir(migrationDir))
      .filter((name) => /^\d{3}_[a-z0-9_]+\.sql$/.test(name))
      .sort();

    for (const fileName of files) {
      const sql = await readFile(path.join(migrationDir, fileName), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      if (known.has(fileName)) {
        if (known.get(fileName) !== checksum) throw new Error(`La migración aplicada ${fileName} fue modificada; crea una nueva migración en vez de editarla.`);
        continue;
      }

      await client.query(sql);
      await client.query(
        'INSERT INTO nexoss_schema_migrations (migration_id, sha256_hex) VALUES ($1, $2)',
        [fileName, checksum],
      );
      console.log(`Aplicada: ${fileName}`);
    }
    console.log(`Esquema central actualizado en ${targetDatabase}.`);
  } finally {
    client?.release();
    await pool.end();
  }
}

main().catch((error) => {
  const known = error instanceof Error ? error.message : '';
  const isConfigurationError = [
    'CONTROL_PLANE_DATABASE_URL',
    'CONFIRM_CONTROL_PLANE_MIGRATION',
    'solo acepta la base dedicada',
    'formato PostgreSQL válido',
    'usuario y host',
    'fue modificada',
  ].some((marker) => known.includes(marker));
  console.error(isConfigurationError ? known : 'Falló la migración del control plane; revisa la conectividad y los permisos de PostgreSQL. No se imprimieron datos de conexión.');
  process.exitCode = 1;
});

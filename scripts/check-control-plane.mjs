import 'dotenv/config';
import { Pool } from 'pg';

const requiredTables = [
  'company_invitations',
  'company_memberships',
  'company_subscriptions',
  'company_usage_periods',
  'platform_audit_events',
  'platform_companies',
  'platform_plans',
  'platform_users',
  'tenant_database_connections',
];

const connectionString = process.env.CONTROL_PLANE_DATABASE_URL?.trim();
if (!connectionString) {
  console.error('FALTA CONFIGURACIÓN: define CONTROL_PLANE_DATABASE_URL en el entorno local.');
  process.exit(1);
}

let parsed;
try {
  parsed = new URL(connectionString);
} catch {
  console.error('CONFIGURACIÓN INVÁLIDA: CONTROL_PLANE_DATABASE_URL no es una URL válida.');
  process.exit(1);
}
if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname) {
  console.error('CONFIGURACIÓN INVÁLIDA: se requiere una URL PostgreSQL.');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  max: 1,
  connectionTimeoutMillis: 8000,
  ssl: parsed.hostname.endsWith('.neon.tech') ? { rejectUnauthorized: true } : undefined,
});

try {
  const connection = await pool.query('SELECT current_database() AS database_name, current_user AS database_role');
  const tables = await pool.query(
    'SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = $2 AND table_name = ANY($3::text[])',
    ['public', 'BASE TABLE', requiredTables],
  );
  const plan = await pool.query("SELECT id FROM platform_plans WHERE id = 'trial' LIMIT 1");
  const found = new Set(tables.rows.map((row) => row.table_name));
  const missing = requiredTables.filter((name) => !found.has(name));

  if (missing.length) {
    console.error(`CONTROL PLANE INCOMPLETO: faltan tablas: ${missing.join(', ')}`);
    process.exitCode = 1;
  } else if (!plan.rows.length) {
    console.error('CONTROL PLANE INCOMPLETO: no se encontró el plan inicial trial.');
    process.exitCode = 1;
  } else {
    console.log('CONTROL PLANE: CONEXIÓN CORRECTA');
    console.log(`Base de datos: ${connection.rows[0].database_name}`);
    console.log(`Tablas verificadas: ${found.size}/${requiredTables.length}`);
    console.log('Plan inicial: trial disponible');
    console.log('No se modificaron datos.');
  }
} catch (error) {
  console.error('NO SE PUDO VERIFICAR EL CONTROL PLANE:', error instanceof Error ? error.message : 'error desconocido');
  process.exitCode = 1;
} finally {
  await pool.end();
}

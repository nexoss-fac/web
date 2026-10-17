import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const checks = [];
const exists = (p) => fs.existsSync(path.join(root, p));
const read = (p) => exists(p) ? fs.readFileSync(path.join(root, p), 'utf8') : '';
const add = (status, label, detail) => checks.push({ status, label, detail });

for (const p of [
  'db/migrations/control-plane/001_control_plane.sql',
  'db/migrations/control-plane/002_current_platform_model.sql',
  'db/migrations/tenant/001_fiscal_workspace.sql',
  'docs/legacy-v27/arquitectura/IMPLEMENTACION-FASE-1.md',
  '.env.multiempresa.example',
]) add(exists(p) ? 'OK' : 'FALTA', `Archivo ${p}`, exists(p) ? 'presente' : 'no encontrado');

const controlSql = read('db/migrations/control-plane/001_control_plane.sql');
for (const table of ['platform_companies', 'platform_users', 'company_memberships', 'company_invitations', 'platform_plans', 'company_subscriptions', 'company_usage_periods', 'tenant_database_connections', 'platform_audit_events']) {
  add(controlSql.includes(`CREATE TABLE IF NOT EXISTS ${table}`) ? 'OK' : 'FALTA', `Esquema central ${table}`, controlSql.includes(`CREATE TABLE IF NOT EXISTS ${table}`) ? 'declarado' : 'no declarado');
}

const tenantSql = read('db/migrations/tenant/001_fiscal_workspace.sql');
for (const table of ['fiscal_obligations', 'fiscal_documents', 'fiscal_events', 'tenant_audit_events']) {
  add(tenantSql.includes(`CREATE TABLE IF NOT EXISTS ${table}`) ? 'OK' : 'FALTA', `Esquema tenant ${table}`, tenantSql.includes(`CREATE TABLE IF NOT EXISTS ${table}`) ? 'declarado' : 'no declarado');
}

for (const name of ['DATABASE_URL', 'CONTROL_PLANE_DATABASE_URL']) {
  const active = Boolean(process.env[name] && process.env[name].trim());
  add(active ? 'PRECAUCIÓN' : 'OK', `Variable de entorno ${name}`, active ? 'está definida en esta terminal; no se imprimió su valor' : 'no está definida en esta terminal');
}
for (const p of ['.env', '.env.local', '.env.production']) {
  add(exists(p) ? 'PRECAUCIÓN' : 'OK', `Configuración local ${p}`, exists(p) ? 'existe; revisar fuera de Git y no compartir su contenido' : 'no existe');
}

const dbCode = read('server/db.ts');
const serverApp = read('server/app.ts');
const firebaseAuth = read('server/auth/firebaseAuth.ts');
const hasGlobalDb = /process\.env\.DATABASE_URL/.test(dbCode) && /getNeonSql/.test(dbCode);
const authMount = read('server.ts');
const hasAuthAdmin = /firebase-admin|verifyIdToken|verifySessionCookie/.test(firebaseAuth + serverApp + authMount);
const authAppliedToApi = /app\.use\(['"]\/api['"],\s*requireFirebaseAuth\)/.test(authMount);
const accessCode = read('server/multiempresa/companyAccess.ts');
const tenantFiles = read('server/multiempresa/tenantFileStore.ts');
const hasTenantResolver = /createCompanyAccessMiddleware|resolveAuthorizedTenant|requireTenantMembership/.test(serverApp + authMount + accessCode);
add(hasGlobalDb ? 'BLOQUEO' : 'REVISAR', 'Conexión operativa global', hasGlobalDb ? 'la app heredada aún usa DATABASE_URL global; no es multiempresa segura' : 'revisar manualmente la capa de datos');
add(hasAuthAdmin && authAppliedToApi ? 'REVISAR' : 'BLOQUEO', 'Autenticación verificada en servidor', hasAuthAdmin && authAppliedToApi ? 'Firebase Admin verifica tokens y el middleware está montado en /api; configuración y rutas públicas requieren revisión manual' : 'no se detectó middleware de identidad verificada montado en las rutas API');
add(hasTenantResolver ? 'REVISAR' : 'BLOQUEO', 'Resolvedor y autorización de empresa', hasTenantResolver ? 'se encontró un patrón de contexto tenant; requiere revisión manual' : 'no se detectó autorización por membresía en el servidor');

const localPlatform = read('server/multiempresa/platformStore.ts');
const postgresControlPlane = read('server/multiempresa/postgresControlPlaneRepository.ts');
const platformRoutes = read('server.ts');
const scopedWrites = /tenantDataFiles/.test(authMount) && /companyId/.test(tenantFiles);
add(scopedWrites ? 'REVISAR' : 'BLOQUEO', 'Persistencia aislada por empresa', scopedWrites ? 'los JSON locales se separan por UUID de empresa; no equivalen a bases PostgreSQL dedicadas' : 'no se encontró una ruta de almacenamiento aislada por empresa');
const postgresPlatformRoutes = /NEXOSS_PLATFORM_STORAGE === 'postgres'/.test(platformRoutes);
add(postgresControlPlane.includes('class PostgresControlPlaneRepository') && postgresPlatformRoutes ? 'REVISAR' : 'BLOQUEO', 'Repositorio PostgreSQL de control', postgresPlatformRoutes ? 'el modo opt-in conecta onboarding, membresías, invitaciones y administración; falta validación PostgreSQL real y las rutas operativas aún no usan este almacenamiento' : 'el repositorio PostgreSQL aún no está conectado a las rutas de plataforma');
add(/NEXOSS_MULTIEMPRESA_MODE !== 'local-demo'/.test(localPlatform) ? 'BLOQUEO' : 'REVISAR', 'Preparación comercial', 'el backend activo sigue siendo el adaptador local de demostración; faltan integración PostgreSQL verificada, gestor de secretos y provisión de bases tenant');
add('BLOQUEO', 'Cobros recurrentes', 'no se habilitó checkout ni renovación automática; falta elegir e integrar un proveedor de pagos');

console.log('NEXOSS — auditoría estática multiempresa (no conecta a servicios externos)');
for (const c of checks) console.log(`[${c.status}] ${c.label}: ${c.detail}`);
const blockers = checks.filter(c => c.status === 'BLOQUEO' || c.status === 'FALTA').length;
console.log(`
Resultado: ${blockers ? 'NO LISTO PARA USO COMERCIAL MULTIEMPRESA' : 'REVISIÓN ESTÁTICA SIN BLOQUEOS DETECTADOS'}`);
console.log('Este script no prueba aislamiento en ejecución ni sustituye pruebas de seguridad. Los bloqueos de persistencia comercial y pagos se mantienen intencionalmente.');
if (blockers) process.exitCode = 2;

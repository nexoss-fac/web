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
]) {
  add(exists(p) ? 'OK' : 'FALTA', `Archivo ${p}`, exists(p) ? 'presente' : 'no encontrado');
}

const controlSql = read('db/migrations/control-plane/001_control_plane.sql');
for (const table of ['platform_companies', 'platform_users', 'company_memberships', 'company_invitations', 'platform_plans', 'company_subscriptions', 'company_usage_periods', 'tenant_database_connections', 'platform_audit_events']) {
  const found = controlSql.includes(`CREATE TABLE IF NOT EXISTS ${table}`);
  add(found ? 'OK' : 'FALTA', `Esquema central ${table}`, found ? 'declarado' : 'no declarado');
}

const tenantSql = read('db/migrations/tenant/001_fiscal_workspace.sql');
for (const table of ['fiscal_obligations', 'fiscal_documents', 'fiscal_events', 'tenant_audit_events']) {
  const found = tenantSql.includes(`CREATE TABLE IF NOT EXISTS ${table}`);
  add(found ? 'OK' : 'FALTA', `Esquema tenant ${table}`, found ? 'declarado' : 'no declarado');
}

for (const name of ['DATABASE_URL', 'CONTROL_PLANE_DATABASE_URL']) {
  const active = Boolean(process.env[name]?.trim());
  add(active ? 'PRECAUCION' : 'INFO', `Variable de entorno ${name}`, active
    ? 'definida en este proceso; su valor no se imprime'
    : 'no definida en este proceso; el script no lee archivos .env ni configuracion de Render');
}
for (const p of ['.env', '.env.local', '.env.production']) {
  add(exists(p) ? 'PRECAUCION' : 'OK', `Configuracion local ${p}`, exists(p)
    ? 'existe; confirmar que esta excluida de Git sin mostrar su contenido'
    : 'no existe');
}

const implementation = read('server.ts');
const dbCode = read('server/db.ts');
const firebaseAuth = read('server/auth/firebaseAuth.ts');
const accessCode = read('server/multiempresa/companyAccess.ts');
const tenantResolver = read('server/multiempresa/tenantResolver.ts');
const tenantFiles = read('server/multiempresa/tenantFileStore.ts');
const secretProvider = read('server/multiempresa/tenantSecretProvider.ts');
const postgresControlPlane = read('server/multiempresa/postgresControlPlaneRepository.ts');
const runtimeGuard = read('server/productionRuntime.ts');

const sqlFactory = dbCode.match(/export function getNeonSql\(\)[\s\S]*?\n}/)?.[0] || '';
const tenantSqlScoped = /tenantStorageContext\.getStore\(\)/.test(sqlFactory)
  && /tenant\.connectionString/.test(sqlFactory);
const globalSqlInFactory = /process\.env\.(?:DATABASE_URL|NEON_DATABASE_URL)/.test(sqlFactory);
add(tenantSqlScoped && !globalSqlInFactory ? 'OK' : 'BLOQUEO', 'Conexion Neon operativa', tenantSqlScoped && !globalSqlInFactory
  ? 'getNeonSql resuelve la conexion desde el contexto tenant, no desde una URL global'
  : 'no se pudo confirmar que cada consulta use la conexion exclusiva del tenant');

const authVerified = /verifyIdToken\(token,\s*true\)/.test(firebaseAuth);
const authMounted = /app\.use\(['"]\/api['"],\s*requireFirebaseAuth\)/.test(implementation);
add(authVerified && authMounted ? 'OK' : 'BLOQUEO', 'Autenticacion del servidor', authVerified && authMounted
  ? 'Firebase Admin verifica tokens revocados y el middleware se monta antes de las rutas /api; la credencial real del despliegue no se valida aqui'
  : 'no se detecto verificacion Firebase Admin antes de las rutas /api');

const membershipAuthorized = /createPostgresCompanyAccessMiddleware/.test(implementation)
  && /resolveAuthorizedTenant/.test(accessCode + tenantResolver)
  && /c\.id\s*=\s*\$3/.test(postgresControlPlane)
  && /isRoleAllowed\(/.test(accessCode);
add(membershipAuthorized ? 'OK' : 'BLOQUEO', 'Membresia y rol por empresa', membershipAuthorized
  ? 'la ruta PostgreSQL deriva la empresa del control central y aplica la politica de roles en servidor; falta prueba end-to-end'
  : 'no se detecto el control completo de identidad, membresia y rol');

const tenantScopedProductionStore = /process\.env\.NODE_ENV === 'production'[\s\S]*?readTenantWorkspaceState\(\)/.test(implementation)
  && /process\.env\.NODE_ENV === 'production'[\s\S]*?writeTenantWorkspaceState\(/.test(implementation)
  && /tenantStorageContext/.test(dbCode);
const tenantScopedLocalStore = /tenantDataFiles\(/.test(implementation + tenantFiles)
  && /companyId/.test(tenantFiles);
add(tenantScopedProductionStore && tenantScopedLocalStore ? 'OK' : 'BLOQUEO', 'Persistencia aislada por empresa en codigo', tenantScopedProductionStore && tenantScopedLocalStore
  ? 'modo local usa archivos por UUID y produccion usa PostgreSQL mediante el contexto tenant; este chequeo estatico no prueba aislamiento en ejecucion'
  : 'no se detecto persistencia separada por empresa para ambos modos');

const postgresRoutesConnected = /createPostgresControlPlaneRepositoryFromEnvironment/.test(implementation)
  && /NEXOSS_PLATFORM_STORAGE\s*===\s*'postgres'/.test(implementation)
  && /getPostgresControlPlane\(\)/.test(implementation)
  && /setTenantDatabaseConnection/.test(implementation);
add(postgresRoutesConnected ? 'OK' : 'BLOQUEO', 'Repositorio PostgreSQL central conectado en codigo', postgresRoutesConnected
  ? 'las rutas de plataforma seleccionan el repositorio PostgreSQL por configuracion; no se confirma migracion ni conexion de Render'
  : 'no se detecto el repositorio PostgreSQL conectado a las rutas de plataforma');

const secretsAreReferences = /render-env:/.test(secretProvider)
  && /getConnectionString\(\s*secretReference\s*:/.test(secretProvider)
  && /secretReference/.test(postgresControlPlane)
  && /req\.body\?\.secretReference/.test(implementation)
  && !/req\.body\?\.connectionString/.test(implementation);
add(secretsAreReferences ? 'REVISAR' : 'BLOQUEO', 'Secretos de base tenant', secretsAreReferences
  ? 'el control central conserva referencias y el servidor resuelve variables privadas; falta verificar Render, rotacion y salud de conexiones'
  : 'no se confirmo que la URL de conexion permanezca fuera de la solicitud del navegador');

const productionGuardComplete = /environment\.NODE_ENV !== 'production'/.test(runtimeGuard)
  && /NEXOSS_PLATFORM_STORAGE/.test(runtimeGuard)
  && /CONTROL_PLANE_DATABASE_URL/.test(runtimeGuard)
  && /FIREBASE_PROJECT_ID/.test(runtimeGuard)
  && /GOOGLE_APPLICATION_CREDENTIALS/.test(runtimeGuard);
add(productionGuardComplete ? 'OK' : 'BLOQUEO', 'Bloqueo de configuracion incompleta en produccion', productionGuardComplete
  ? 'el proceso se niega a iniciar sin control PostgreSQL y credenciales Firebase requeridos'
  : 'no se detecto un bloqueo de arranque para configuracion de produccion incompleta');

add('BLOQUEO', 'Verificacion de staging y recuperacion', 'este chequeo no conecta servicios; falta probar dos empresas, persistencia tras reinicio, backups y restauracion en entorno aislado');
add('INFO', 'Cobros recurrentes', 'no se considera requisito para esta etapa; mantenerlo fuera del alcance hasta elegir un proveedor de pagos');

console.log('NEXOSS - auditoria estatica multiempresa (no conecta a servicios externos)');
for (const check of checks) console.log(`[${check.status}] ${check.label}: ${check.detail}`);
const blockers = checks.filter((check) => check.status === 'BLOQUEO' || check.status === 'FALTA').length;
console.log(`\nResultado: ${blockers ? 'NO LISTO PARA USO COMERCIAL MULTIEMPRESA' : 'SIN BLOQUEOS ESTATICOS DETECTADOS'}`);
console.log('REVISAR e INFO requieren seguimiento. El script no lee secretos, no valida Render y no reemplaza pruebas de integracion.');
if (blockers) process.exitCode = 2;

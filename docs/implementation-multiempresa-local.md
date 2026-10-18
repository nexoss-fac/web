# NEXOSS multiempresa: implementación y prueba local

## Qué está conectado en esta copia

1. **Identidad:** Firebase Auth cliente y Firebase Admin en Express. Se requieren ID tokens verificados; el correo debe aparecer verificado para registrar o aceptar invitaciones.
2. **Registro:** desde el acceso se puede iniciar sesión/crear una cuenta Firebase y después registrar la empresa. Su creador queda como `owner` de esa empresa.
3. **Configuración inicial:** asistente de datos empresariales, parámetros fiscales, invitación opcional, sucursales/depósitos/categorías y activación del espacio.
4. **Acceso comercial:** `requireFirebaseAuth` cubre `/api`; luego, las rutas comerciales exigen membresía, empresa activa, suscripción vigente y límites/rol del servidor. `/api/health` queda pública. Las rutas `/api/platform/*` autentican la identidad y aplican su propia autorización, porque operan antes de seleccionar un tenant.
5. **Administración SaaS:** la API de administración y el panel local permiten asignar planes, editar límites, activar/renovar/vencer/cancelar suscripciones y suspender/reactivar una empresa. El acceso exige que el UID aparezca en `NEXOSS_PLATFORM_ADMIN_UIDS`, configurado solo en el proceso del servidor.
6. **Aislamiento local:** cada empresa guarda el estado operativo en una carpeta distinta; el cliente conserva su caché bajo una clave por empresa. El selector solo lista membresías devueltas por el servidor.
7. **External services:** la bandera local desactiva las solicitudes cliente a BCV, Google Sheets, GitHub y webhooks. Firebase Auth Emulator es el único servicio esperado.

## Configuración temporal de PowerShell

Mantén el emulador en una terminal y NEXOSS en otra. No crees archivos `.env`; cada variable vive solo en esa terminal.

**Terminal 1, desde `NEXOSS-multiempresa`:**

```powershell
Set-Location 'C:\Users\josel\OneDrive\Desktop\NEXOSS-multiempresa'
npx --yes firebase-tools emulators:start --only auth --project demo-nexoss
```

Espera que Firebase confirme Auth Emulator en el puerto `9099`. Deténlo con `Ctrl+C`.

**Terminal 2, desde `NEXOSS-multiempresa`:**

```powershell
Set-Location 'C:\Users\josel\OneDrive\Desktop\NEXOSS-multiempresa'
$env:NEXOSS_MULTIEMPRESA_MODE = 'local-demo'
$env:VITE_NEXOSS_LOCAL_ONLY = 'true'
$env:FIREBASE_PROJECT_ID = 'demo-nexoss'
$env:GOOGLE_CLOUD_PROJECT = 'demo-nexoss'
$env:FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
$env:VITE_FIREBASE_API_KEY = 'fake-api-key'
$env:VITE_FIREBASE_AUTH_DOMAIN = 'demo-nexoss.firebaseapp.com'
$env:VITE_FIREBASE_PROJECT_ID = 'demo-nexoss'
$env:VITE_FIREBASE_APP_ID = '1:123456789:web:local'
$env:VITE_FIREBASE_AUTH_EMULATOR_URL = 'http://127.0.0.1:9099'
# Opcional: luego de crear una cuenta de administrador en el emulador, agrega solo su UID local.
# $env:NEXOSS_PLATFORM_ADMIN_UIDS = 'UID_LOCAL_DEL_EMULADOR'
npm run dev
```

Abre `http://127.0.0.1:3000/`. Detén el servidor con `Ctrl+C`; al cerrar la terminal también desaparecen sus variables temporales. Confirma que el puerto `9099` lo ocupa Firebase Emulator y que el proceso del servidor tiene `NEXOSS_MULTIEMPRESA_MODE=local-demo`. El proyecto fijo `demo-nexoss`, las claves `fake-*`, el host loopback y la bandera local evitan usar credenciales reales. La app no debe tener `DATABASE_URL` ni `CONTROL_PLANE_DATABASE_URL` configuradas.

## Prueba manual de aceptación

Estas verificaciones aún deben ejecutarse en navegador con el emulador y NEXOSS activos; el build unitario no las sustituye.

1. Crear una cuenta de correo/contraseña en el acceso. Verificarla desde Firebase Emulator UI o el enlace local que genere el emulador; volver a NEXOSS y actualizar la sesión.
2. Registrar **Empresa Sintética A** y completar los pasos. Confirmar que el usuario queda `owner`, el plan es `Prueba` y la fecha de vencimiento es 14 días después.
3. Crear una segunda cuenta y **Empresa Sintética B**. Confirmar que el selector muestra solo empresas con membresía para esa cuenta.
4. Enviar una invitación ficticia a un correo secundario. No se envía correo; la invitación dura siete días y el owner/admin puede revocarla. Crear/verificar esa identidad en el emulador con el mismo email, aceptar solo la invitación mostrada en su selector y comprobar que obtiene el rol asignado y únicamente esa empresa.
5. Agregar un producto sintético en A y otro en B. Cambiar entre empresas y confirmar que la lista, ventas, gastos y cierres no se mezclan.
6. Con Firebase ID token de A, llamar a una ruta comercial con `X-Company-Id` de B. Debe devolver `403`; sin token debe devolver `401`; sin selector de empresa, `400`.
7. En el panel de administración local, suspender A y comprobar `403`. Reactivarla con fecha pasada/vencida y comprobar `403`; asignar plan activo y vencimiento futuro para restaurar acceso.
8. Probar rol `cashier`: puede operar ventas/apartados según la política y no puede crear/modificar productos. Probar `auditor`: solo lectura.
9. Confirmar el archivo local `server/data/platform/control-plane.json` y directorios `server/data/tenants/<UUID>/` solo dentro de esta copia. No copiar estos datos a MAKD V27 ni usar datos reales.

## Pruebas disponibles

```powershell
npm run lint
npm run test:auth
npm run test:multiempresa
npm run audit:multiempresa
npm run build
```

La auditoría debe seguir marcando **NO LISTO PARA USO COMERCIAL MULTIEMPRESA** mientras el control plane y las bases tenant sean solo archivos locales y no exista proveedor de pagos.

## Pendientes antes de producción o prueba comercial

- El repositorio PostgreSQL del control plane y la resolución de una base Neon por empresa ya están conectados en código. Falta ejecutar la migración en una base central nueva y comprobar el flujo con empresas y bases sintéticas en staging.
- El servidor ya resuelve referencias a variables privadas por empresa; falta comprobar configuración en Render, rotación, health checks y provisión. Nunca guardar URLs de clientes en claro ni aceptarlas desde el navegador.
- Ejecutar migraciones únicamente en infraestructura nueva y previamente autorizada, con backups y revisión de seguridad.
- Completar cuota/uso (no solo usuarios, productos, sucursales y depósitos). Pagos automáticos, renovaciones y webhooks quedan fuera del alcance hasta que el dueño elija un PSP.
- Integrar un proveedor de correo para invitaciones, recuperación de cuenta y pruebas negativas E2E para cada ruta, exportación, archivo y trabajo asíncrono.
- Resolver backups/restore, logs/auditoría inmutables, rate limiting, recuperación ante fallas y concurrencia. Validar reglas fiscales/financieras con el dueño y sus asesores.

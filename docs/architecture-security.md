# Estado de seguridad y arquitectura

## Alcance implementado en esta copia local

- Firebase Authentication se verifica en Express con Firebase Admin antes de cualquier ruta `/api`, salvo `/api/health`.
- El registro empresarial y la aceptación de invitaciones requieren correo Firebase verificado.
- Las rutas comerciales requieren además el selector `X-Company-Id`; el servidor lo valida contra la membresía, estado de empresa, plan activo y vencimiento. El encabezado es un selector no confiable, nunca una prueba de identidad.
- Los roles `owner`, `admin`, `accountant`, `auditor`, `supervisor` y `cashier` se leen del control plane del servidor; los permisos visuales/PIN del navegador no conceden autorización.
- El almacenamiento JSON local se separa por UUID en `server/data/tenants/<companyId>/`; el almacenamiento del navegador también usa una clave por empresa. Los archivos globales heredados no se importan.
- Un modo de demostración local (`NEXOSS_MULTIEMPRESA_MODE=local-demo`) guarda empresas, miembros, invitaciones, planes, suscripciones y auditoría en un archivo local. El servidor rechaza este adaptador en producción.
- Hay plan de prueba de 14 días y administración manual de planes, límites, renovación y suspensión. No hay cobros automáticos.
- Con `VITE_NEXOSS_LOCAL_ONLY=true` se bloquean solicitudes del cliente a BCV, Google Sheets, GitHub y webhooks.

## Lo que todavía no constituye una plataforma comercial

La copia local prueba el flujo y la separación por empresa usando archivos JSON. No se implementó ni configuró el repositorio PostgreSQL central, las conexiones Neon separadas por empresa, el gestor de secretos, el cifrado de credenciales, backups/restore, almacenamiento privado de documentos ni la concurrencia/consistencia de una base de datos. El archivo `db/migrations/control-plane/001_control_plane.sql` es solo un diseño; no se ha ejecutado.

Las conexiones heredadas a Neon permanecen deshabilitadas por `getNeonSql()`. Se implementó un repositorio PostgreSQL de control plane aislado (`PostgresControlPlaneRepository`), pero todavía no está seleccionado por las rutas; el almacenamiento local sigue siendo el único backend activo. La suite de PostgreSQL requiere `CONTROL_PLANE_TEST_DATABASE_URL` y aún no se ha ejecutado contra un servidor PostgreSQL. No configures `DATABASE_URL` ni `CONTROL_PLANE_DATABASE_URL` para la prueba local. El adaptador local no cifra datos en reposo y no es apto para datos reales ni para varios procesos/servidores.

La lista `NEXOSS_PLATFORM_ADMIN_UIDS` se configura fuera del navegador con UID creados solo en el emulador. La gestión de cobros queda pendiente de que el dueño indique el proveedor elegido. No se envían correos de invitación: el colaborador debe verificar en Firebase el mismo correo invitado.

## Identidad y límites

El registro usa el UID y correo del token Firebase verificado, nunca campos de identidad enviados por el cliente. El middleware de empresa revalida la membresía en cada operación. Los archivos de datos se abren desde el contexto de empresa validado por Express; las solicitudes sin membresía, con empresa suspendida o con suscripción vencida se rechazan.

El aislamiento probado en esta fase cubre rutas API y almacenamiento JSON del modo local. Aún falta revisar reportes, exportaciones, archivos, tareas en segundo plano y todos los permisos por módulo con pruebas de extremo a extremo. Ninguna fase declara cumplimiento fiscal, legal o contable.

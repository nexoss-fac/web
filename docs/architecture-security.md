# Estado de arquitectura y seguridad

## Control de acceso

- Firebase Authentication se verifica en Express mediante Firebase Admin antes de las rutas `/api`, salvo `/api/health` y la cartelera fiscal pública con token.
- Las rutas de una empresa requieren `X-Company-Id`; el servidor comprueba identidad, membresía activa, estado, suscripción, plan, rol y módulos en el control central.
- Los roles `owner`, `admin`, `accountant`, `auditor`, `supervisor` y `cashier` se autorizan en el servidor. Los permisos visuales del navegador no conceden acceso.
- El modo local de demostración usa archivos JSON por empresa y permanece bloqueado en producción.

## Persistencia de producción

- `NEXOSS_PLATFORM_STORAGE=postgres` selecciona el repositorio PostgreSQL central para empresas, usuarios, membresías, invitaciones, planes y auditoría.
- Al completar el asistente de activación, el servidor provisiona un proyecto Neon aislado para esa empresa. Con el rubro y las categorías ya guardados, crea el esquema común y las tablas iniciales del rubro; el proceso se reintenta desde una cola interna si Neon está temporalmente indisponible.
- `tenant_database_connections` guarda la URL de conexión de los tenants nuevos cifrada con AES-256-GCM mediante `TENANT_DATABASE_ENCRYPTION_KEY`. Los secretos existentes pueden conservar su referencia a una variable del entorno.
- Cada empresa resuelve su conexión desde el control central dentro del contexto autorizado. Productos, ventas, gastos, apartados, cierres y contabilidad se guardan en su base PostgreSQL.
- La empresa MAKD sigue usando su proyecto Neon y referencia actuales; el aprovisionador no altera ni migra esa conexión.
- La cartelera fiscal pública consulta la conexión de la empresa desde el control central y verifica el hash del token antes de devolver documentos publicados.
- `server/productionRuntime.ts` impide iniciar el servidor si faltan la selección PostgreSQL, la URL central, el proyecto Firebase o el archivo secreto de credenciales. No habilita el modo emulador en producción.

## Configuración operativa

La automatización de empresas nuevas requiere configurar `NEON_API_KEY` y `TENANT_DATABASE_ENCRYPTION_KEY` como secretos del servicio Render. La clave Neon aprovisiona proyectos y la clave de cifrado debe respaldarse con seguridad: sin ella no se pueden descifrar las conexiones guardadas.

Cada empresa nueva crea un proyecto Neon y consume recursos sujetos a los límites y al plan de la cuenta Neon. Verifica la capacidad de la cuenta antes de abrir el registro a gran escala. Consulta [despliegue-render-neon.md](./despliegue-render-neon.md) para la configuración.

La escritura del estado JSON complementario reemplaza un único documento JSONB por empresa. Esto conserva el aislamiento, pero no sustituye un diseño de transacciones para escrituras simultáneas. Aún deben configurarse y comprobarse copias de seguridad y restauración, así como almacenamiento externo privado para documentos grandes. No guardes credenciales Firebase o URL de Neon en GitHub ni las compartas en el chat.

El plan gratuito, la vigencia de una suscripción o la configuración fiscal no garantizan cumplimiento legal, contable o tributario. Verifica esos requisitos con profesionales locales.

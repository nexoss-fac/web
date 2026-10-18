# Estado de arquitectura y seguridad

## Control de acceso

- Firebase Authentication se verifica en Express mediante Firebase Admin antes de las rutas `/api`, salvo `/api/health` y la cartelera fiscal pública con token.
- Las rutas de una empresa requieren `X-Company-Id`; el servidor comprueba identidad, membresía activa, estado, suscripción, plan, rol y módulos en el control central.
- Los roles `owner`, `admin`, `accountant`, `auditor`, `supervisor` y `cashier` se autorizan en el servidor. Los permisos visuales del navegador no conceden acceso.
- El modo local de demostración usa archivos JSON por empresa y permanece bloqueado en producción.

## Persistencia prevista para producción

- `NEXOSS_PLATFORM_STORAGE=postgres` selecciona el repositorio PostgreSQL central para empresas, usuarios, membresías, invitaciones, planes y auditoría.
- `tenant_database_connections` guarda una referencia a una variable secreta del entorno, nunca la URL operativa en texto plano. El administrador central puede enlazar una base mediante la pantalla **Verificar y conectar Neon**.
- Cada empresa resuelve su propia URL Neon desde su contexto autorizado. El estado complementario del espacio de trabajo y la carpeta fiscal se guarda en `nexoss_workspace_state` dentro de esa base; productos, ventas, gastos, apartados, cierres y contabilidad también usan sus tablas PostgreSQL cuando están disponibles.
- La cartelera fiscal pública consulta la conexión de la empresa desde el control central y verifica el hash del token antes de devolver documentos publicados.
- `server/productionRuntime.ts` impide iniciar el servidor si faltan la selección PostgreSQL, la URL central, el proyecto Firebase o el archivo secreto de credenciales. No habilita el modo emulador en producción.

## Configuración y límites pendientes

El código está preparado para Render y Neon, pero este repositorio local no confirma que Render tenga las variables, que la migración se haya aplicado ni que cada empresa esté enlazada a su base. Sigue la guía [despliegue-render-neon.md](./despliegue-render-neon.md) antes de publicar.

La escritura del estado JSON complementario reemplaza un único documento JSONB por empresa. Esto conserva el aislamiento, pero no sustituye un diseño de transacciones para escrituras simultáneas. Aún deben configurarse y comprobarse copias de seguridad y restauración, así como almacenamiento externo privado para documentos grandes. No guardes credenciales Firebase o URL de Neon en GitHub ni las compartas en el chat.

El plan gratuito, la vigencia de una suscripción o la configuración fiscal no garantizan cumplimiento legal, contable o tributario. Verifica esos requisitos con profesionales locales.

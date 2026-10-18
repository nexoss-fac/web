# Preparar NEXOSS en Render con Neon

El servicio de Render usa una base central para usuarios, empresas, membresías, planes y conexiones cifradas. Al crear una empresa, NEXOSS crea su proyecto Neon, inicializa el esquema y cifra la URL de conexión en la base central. La URL nunca pasa por el navegador ni se guarda en GitHub.

## Variables del servicio web en Render

Agrega estas variables en **Environment**. Usa el valor de Neon para la base central en `CONTROL_PLANE_DATABASE_URL` y nunca lo subas a GitHub.

| Variable | Valor |
| --- | --- |
| `NODE_ENV` | `production` |
| `NEXOSS_PLATFORM_STORAGE` | `postgres` |
| `CONTROL_PLANE_DATABASE_URL` | URL de la base Neon central dedicada `nexoss_control_plane` |
| `FIREBASE_PROJECT_ID` | ID del mismo proyecto Firebase de la página |
| `GOOGLE_APPLICATION_CREDENTIALS` | Ruta del archivo secreto de Firebase Admin cargado en Render, por ejemplo `/etc/secrets/firebase-admin.json` |
| `NEXOSS_PLATFORM_ADMIN_UIDS` | UID Firebase de la cuenta que administrará la plataforma |
| `APP_PUBLIC_URL` | URL pública HTTPS del servicio Render |
| `NEON_API_KEY` | Clave API de Neon con permiso para crear proyectos |
| `NEON_ORG_ID` | Opcional; necesario si la clave es personal y los proyectos pertenecen a una organización |
| `NEON_REGION_ID` | Opcional; región de Neon. Predeterminado: `aws-us-west-2` (Oregon) |
| `TENANT_DATABASE_ENCRYPTION_KEY` | Clave aleatoria de 32 bytes codificada en Base64, para cifrar las URL Neon en PostgreSQL |

Carga la cuenta de servicio de Firebase como **Secret File** de Render. No la guardes en el repositorio ni la pegues en el chat. `MAIL_FROM` y `RESEND_API_KEY` se configuran aparte para habilitar el envío de invitaciones.

Para generar `TENANT_DATABASE_ENCRYPTION_KEY`, ejecuta localmente `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"` y copia la salida directamente al campo secreto de Render. No la guardes en el repositorio ni la compartas. Conserva una copia segura de esa clave: sin ella no se pueden descifrar las conexiones almacenadas.

## Migrar el control central

La base central debe ser la base dedicada `nexoss_control_plane`. En una terminal segura donde `CONTROL_PLANE_DATABASE_URL` ya esté configurada, ejecuta:

```powershell
$env:CONFIRM_CONTROL_PLANE_MIGRATION = 'nexoss_control_plane'
npm run migrate:control-plane
```

El migrador verifica el nombre de la base antes de crear el esquema. No ejecutes esta migración apuntando a la base operativa de una empresa.

## Aprovisionamiento automático

Después de configurar `NEON_API_KEY` y `TENANT_DATABASE_ENCRYPTION_KEY` una sola vez, cada alta de empresa crea automáticamente un proyecto Neon aislado con un nombre interno derivado del ID de la empresa, espera a que Neon termine de provisionarlo, ejecuta el esquema de NEXOSS y guarda la conexión cifrada en PostgreSQL central. Si Neon tiene una interrupción temporal, el servidor vuelve a intentarlo sin pedirle acciones al usuario.

La empresa MAKD conserva su proyecto y su referencia `render-env:MAKD_SHOP_DATABASE_URL`. El aprovisionamiento nuevo no modifica ni migra esa base.

Cada empresa nueva consume un proyecto y recursos Neon independientes. Confirma los límites y el plan de la organización Neon antes de abrir el registro a gran escala.

## Comandos de Render

- Build: `npm ci && npm run build`
- Start: `npm run start`
- Node: versión 22 o superior

No quites los bloqueos de producción si faltan las variables obligatorias. El servicio debe iniciar con PostgreSQL central y credenciales Firebase reales.

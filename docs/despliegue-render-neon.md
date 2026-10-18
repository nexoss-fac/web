# Preparar NEXOSS en Render con Neon

El servicio de Render usa una base central para usuarios, empresas, membresías, planes y referencias de conexiones. Cada empresa debe tener su propia base Neon operativa. La aplicación no acepta una URL de base enviada por el navegador: solo resuelve referencias a variables secretas definidas en el servidor.

## Variables del servicio web en Render

Agrega estas variables en **Environment**. Usa el valor de Neon para la base central en `CONTROL_PLANE_DATABASE_URL` y nunca lo subas a GitHub.

| Variable | Valor |
| --- | --- |
| `NODE_ENV` | `production` |
| `NEXOSS_PLATFORM_STORAGE` | `postgres` |
| `CONTROL_PLANE_DATABASE_URL` | URL de la base Neon central dedicada `nexoss_control_plane` |
| `FIREBASE_PROJECT_ID` | ID del mismo proyecto Firebase de la página |
| `GOOGLE_APPLICATION_CREDENTIALS` | Ruta del archivo secreto de Firebase Admin cargado en Render, por ejemplo `/etc/secrets/firebase-admin.json` |
| `NEXOSS_PLATFORM_ADMIN_UIDS` | UID Firebase de la cuenta que administrará el enlace de las bases de empresa |
| `APP_PUBLIC_URL` | URL pública HTTPS del servicio Render |

Carga la cuenta de servicio de Firebase como **Secret File** de Render. No la guardes en el repositorio ni la pegues en el chat. `MAIL_FROM` y `RESEND_API_KEY` se configuran aparte para habilitar el envío de invitaciones.

## Migrar el control central

La base central debe ser la base dedicada `nexoss_control_plane`. En una terminal segura donde `CONTROL_PLANE_DATABASE_URL` ya esté configurada, ejecuta:

```powershell
$env:CONFIRM_CONTROL_PLANE_MIGRATION = 'nexoss_control_plane'
npm run migrate:control-plane
```

El migrador verifica el nombre de la base antes de crear el esquema. No ejecutes esta migración apuntando a la base operativa de una empresa.

## Enlazar la base de cada empresa

1. En Render, agrega una variable secreta propia para cada base operativa Neon. Para la empresa actual puede llamarse, por ejemplo, `MAKD_SHOP_DATABASE_URL`; su valor es la URL de esa base.
2. Espera a que Render reinicie el servicio al guardar la variable.
3. Inicia sesión con Firebase usando la cuenta cuyo UID está en `NEXOSS_PLATFORM_ADMIN_UIDS`.
4. Abre **Administración central**, escribe `MAKD_SHOP_DATABASE_URL` en la tarjeta de esa empresa y pulsa **Verificar y conectar Neon**.

El servidor comprueba la conexión y guarda solo la referencia `render-env:MAKD_SHOP_DATABASE_URL` en el control central. Cada empresa debe apuntar a su propia base. No reutilices una URL entre empresas.

## Comandos de Render

- Build: `npm ci && npm run build`
- Start: `npm run start`
- Node: versión 22 o superior

No quites los bloqueos de producción si faltan las variables obligatorias. El servicio debe iniciar con PostgreSQL central y credenciales Firebase reales; las rutas de una empresa quedan cerradas hasta que tenga una conexión Neon individual con estado listo.

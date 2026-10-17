# Autenticación Firebase en desarrollo local

NEXOSS usa Firebase Authentication con Google para iniciar sesión. Express valida el ID token con Firebase Admin antes de procesar las rutas `/api/*`; `/api/health` permanece pública. Este flujo autentica identidad, pero todavía no asigna empresas ni aplica autorización por rol.

## Configuración del navegador

1. Copia `.env.example` como `.env` en la raíz de NEXOSS.
2. Completa `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID` y `VITE_FIREBASE_APP_ID` con la configuración web de un proyecto Firebase de desarrollo.
3. Habilita el proveedor Google en Firebase Authentication y autoriza `localhost` y `127.0.0.1` en dominios permitidos si los vas a usar.

Los valores `VITE_*` se publican en el código del navegador. Firebase Web API keys no son claves privadas; aplica las restricciones de API recomendadas en Google Cloud. Nunca pongas una clave de cuenta de servicio en una variable `VITE_*`.

## Firebase Admin en el servidor

`FIREBASE_PROJECT_ID` debe ser el mismo proyecto que `VITE_FIREBASE_PROJECT_ID`. Para un servicio Firebase real de desarrollo, configura Application Default Credentials mediante `GOOGLE_APPLICATION_CREDENTIALS`, apuntando a un archivo de cuenta de servicio guardado fuera del repositorio. No copies el JSON de credenciales a NEXOSS, no lo imprimas ni lo envíes al navegador.

Para usar Firebase Authentication Emulator, configura ambos lados:

- Navegador: `VITE_FIREBASE_AUTH_EMULATOR_URL=http://127.0.0.1:9099`.
- Servidor: `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099`.
- Usa el mismo `FIREBASE_PROJECT_ID`/`VITE_FIREBASE_PROJECT_ID` en ambos lados.

Con el emulador no se necesita una cuenta de servicio. Inicia el servidor local de Auth Emulator en el puerto configurado y reinicia NEXOSS después de cambiar `.env`.

## Respuestas y alcance

- Token ausente, inválido, vencido o revocado: HTTP 401.
- Firebase Admin sin configuración: HTTP 503; no se permite continuar con la operación.
- `/api/health`: pública.
- Las demás rutas `/api/*`: requieren token verificado.
- El servidor expone la identidad Firebase verificada (UID, correo y proveedor). No toma UID, empresa o rol del navegador como prueba de identidad.

La autenticación no sustituye la autorización por empresa. Los PIN/perfiles de administrador y cajera que queden en la interfaz son solo controles visuales locales hasta que se conecten a membresías y roles verificados del lado del servidor.

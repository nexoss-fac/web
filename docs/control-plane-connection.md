# Conexión de NEXOSS con NEXOSS-CONTROL-PLANE

El backend ya implementa el repositorio PostgreSQL del Control Plane. Para activarlo, debe recibir estas variables en el entorno del servidor:

- `NEXOSS_PLATFORM_STORAGE=postgres`
- `CONTROL_PLANE_DATABASE_URL`: URL PostgreSQL privada del proyecto `NEXOSS-CONTROL-PLANE`.

No uses `DATABASE_URL` para el Control Plane: esa variable puede pertenecer a una base operativa. La URL del Control Plane nunca debe enviarse al navegador, incluirse en el repositorio, imprimirse en logs ni compartirse en mensajes.

## Verificación local

1. Añade ambas variables a tu archivo local ignorado por Git (por ejemplo, `.env`), sin subirlo al repositorio.
2. Ejecuta `npm run check:control-plane`.
3. El verificador comprueba la conexión, las nueve tablas requeridas y el plan inicial `trial`. Solo ejecuta consultas SELECT; no crea, modifica ni elimina datos.
4. Cuando la verificación indique conexión correcta, inicia NEXOSS con `npm run dev`.

## Configuración de producción

Cuando se autorice el despliegue, configura las mismas variables como secretos del servicio de Render. No las añadas al código ni a archivos versionados. El backend ahora falla al iniciar en producción si no está activado explícitamente el modo PostgreSQL, evitando que use silenciosamente el control plane local.

## Separación de bases

- `CONTROL_PLANE_DATABASE_URL`: solo identidad, empresas, membresías, suscripciones, planes y referencias de conexiones.
- `<EMPRESA>_DATABASE_URL`: base operativa independiente de cada empresa cuando se usa una referencia de entorno.
- INTERMED conserva su base clínica de validación existente; esta configuración no importa, modifica ni recrea sus pacientes.

El Control Plane no debe recibir historias clínicas, recetas, pagos clínicos ni otros datos operativos.

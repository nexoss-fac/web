# Verificación continua y preparación de producción

## Alcance

La rama de trabajo es `codex/deploy-nexoss`. El workflow `.github/workflows/ci.yml` valida los cambios de esa rama y las solicitudes de integración dirigidas a ella. No despliega a Render ni ejecuta migraciones.

## Validaciones automáticas

El workflow instala dependencias con `npm ci` y ejecuta:

- `npm run lint` (TypeScript).
- `npm run test:auth`.
- `npm run test:multiempresa`.
- `npm run test:multiempresa:postgres`.
- `npm run build`.
- `npm audit --omit=dev` como informe de dependencias; este paso no bloquea el resto del workflow mientras se clasifica el resultado.

El test PostgreSQL de integración omite su ejecución cuando no existe `CONTROL_PLANE_TEST_DATABASE_URL`. Un resultado verde con ese test omitido **no** demuestra la integración con una base real. Para habilitarlo, configurar en GitHub Actions un secreto que apunte a una base de pruebas desechable y aislada; nunca usar la base productiva de Render ni la base de una empresa. El test crea y elimina un esquema temporal.

## Verificación requerida en Render

La existencia de un servicio alojado no demuestra que la versión actual de esta rama sea la que está activa. Antes de considerar producción verificada, confirmar en el panel de Render, sin compartir secretos:

1. Servicio, rama conectada y commit desplegado.
2. Build command: `npm ci && npm run build`.
3. Start command: `npm run start`.
4. Variables obligatorias de producción descritas en [despliegue-render-neon.md](./despliegue-render-neon.md), sin revelar sus valores.
5. Logs de arranque y estado de `/api/health`.
6. Que la base central configurada sea la base dedicada `nexoss_control_plane`, y que haya backups y una restauración probada.
7. Que las pruebas de aislamiento entre empresas, persistencia, recuperación y flujos de venta/contabilidad se hayan ejecutado en staging con datos ficticios.

No ejecutar migraciones sobre bases conectadas a Render sin confirmar explícitamente el destino y disponer de backup verificado. No quitar el bloqueo de producción para hacer que el proceso arranque.

## Limitaciones de esta verificación

El workflow no tiene acceso a secretos de Render, no inspecciona datos de clientes, no prueba integraciones externas con Neon/ Firebase y no despliega. La auditoría de dependencias requiere revisar cada hallazgo y aplicar actualizaciones compatibles de forma controlada; no actualizar masivamente dependencias críticas sin ejecutar la suite.

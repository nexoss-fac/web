# MAKD V27 — Implementación técnica fase 1

**Estado: base arquitectónica preparada; aplicación comercial multiempresa NO habilitada.**

## Decisiones aprobadas

- Código fuente: GitHub.
- Aplicación web/API: Vercel, después de pruebas y revisión de costos/tiempos de ejecución.
- PostgreSQL: Neon.
- Plano de control: una base independiente para registro de empresas, usuarios, membresías, estado y referencia a secretos.
- Operación: una base PostgreSQL independiente por empresa.
- Identidad: usar Firebase Authentication como candidato inicial porque el proyecto ya contiene Firebase Client SDK; el backend debe verificar cada ID token con Firebase Admin SDK antes de confiar en la identidad. La configuración actual del cliente por sí sola NO autentica de forma segura las rutas del servidor.

## Qué contiene esta fase

1. Migración inicial del plano de control: `db/migrations/control-plane/001_control_plane.sql`.
2. Migración de espacio fiscal por empresa: `db/migrations/tenant/001_fiscal_workspace.sql`.
3. Ejemplos de variables sin secretos: `.env.example` y `.env.multiempresa.example`.
4. Contrato de resolución de tenant en `server/multiempresa/tenantResolver.ts`, con dependencias inyectables y fallo cerrado.
5. Pruebas unitarias del contrato: `npm run test:multiempresa`.
6. Auditoría estática ejecutable: `npm run audit:multiempresa`.
7. Este documento y la lista de aceptación de seguridad.

El resolvedor tiene pruebas unitarias, pero todavía no está conectado al verificador Firebase, al repositorio Neon de control, al gestor de secretos ni a las rutas existentes. Estas piezas son una base de implementación, no una aplicación comercial multiempresa terminada.

## Bloqueos antes de uso multiempresa real

El código heredado aún utiliza `DATABASE_URL` global en `server/db.ts` y endpoints de negocio que no están vinculados a una membresía verificada. También existen datos locales en archivos JSON y almacenamiento del navegador. Por ello:

- No cargar datos reales de empresas adicionales.
- No configurar la URL de producción en `.env`, variables de entorno locales ni Vercel Preview.
- No ejecutar las migraciones en la base actual de MAKD.
- No habilitar un segundo negocio ni vender acceso hasta que todos los bloqueos estén cerrados.

## Arquitectura objetivo

```text
Navegador
  └─ Firebase Authentication (sesión individual)
       └─ API Vercel: verifica ID token en servidor
            └─ Plano de control Neon
                 ├─ valida usuario activo + membresía + rol
                 └─ resuelve company_id desde la sesión/membresía
                      └─ obtiene secreto por referencia en gestor de secretos
                           └─ conexión a la base Neon dedicada de esa empresa
```

El navegador nunca envía ni decide `DATABASE_URL`, el secreto de conexión o el `company_id` autorizado. Un parámetro de empresa es solo una solicitud; el servidor debe verificar la membresía y resolver la conexión desde el plano de control.

## Orden de trabajo recomendado

1. **Aislar desarrollo:** mantener esta copia local y un repositorio/branch de pruebas; conservar V26/V27 originales como respaldo.
2. **Crear entornos vacíos:** crear primero una base de control de prueba y una base tenant de prueba, sin restaurar datos de producción.
3. **Identidad de servidor:** incorporar Firebase Admin SDK, verificación de token y pruebas de tokens ausentes, vencidos y malformados.
4. **Gestión de secretos:** elegir e integrar un proveedor real de secretos; no guardar URLs en texto plano ni descifrarlas en el navegador.
5. **Resolvedor de tenant:** validar estado de empresa y membresía en cada petición; fallar cerrado si algo falta.
6. **Capa de datos por contexto:** reemplazar la conexión global en todos los módulos operativos por un cliente asociado al contexto de tenant autorizado.
7. **Migración piloto:** migrar una copia de MAKD a una base tenant nueva y conciliar conteos, existencias, ventas, apartados y contabilidad.
8. **Pruebas de aislamiento:** empresa A no puede consultar, modificar, exportar ni eliminar datos de B; probar endpoints, archivos, reportes y numeración de documentos.
9. **Preproducción:** backups y restauración demostrados, logs sin secretos, revisión de permisos, pruebas de carga/costo y build repetible.
10. **Despliegue:** solo tras aprobación explícita, PR revisado y variables de entorno configuradas en un entorno separado.

## Sobre el producto comercial

La primera versión comercial debe incluir como mínimo: alta/invitación de empresa, usuarios y roles, estado de suscripción, base tenant provisionada, registro de auditoría, respaldos por empresa, manejo seguro de documentos y procedimiento de soporte/restauración. La carpeta fiscal y automatizaciones tributarias deben distinguir `preparado`, `presentado`, `pagado` y `verificado`, cada uno con evidencia. No se debe simular CAPTCHA ni controles anti-bot.

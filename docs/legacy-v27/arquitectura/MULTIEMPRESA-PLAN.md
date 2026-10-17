# MAKD Gestión Empresarial — arquitectura multiempresa (fase inicial)

**Estado:** diseño + migraciones SQL iniciales. No está conectado al flujo de producción ni debe considerarse multiempresa seguro todavía.

## Decisiones

1. **Piloto:** MAKD SHOP primero. Mantener V26 como respaldo y trabajar en una rama/entorno de pruebas.
2. **Aislamiento de datos:** una base de datos PostgreSQL independiente por empresa, tal como requiere el producto. La plataforma central solo guarda identidad, membresías, estado de la empresa y un secreto de conexión cifrado o una referencia a un gestor de secretos.
3. **Infraestructura candidata:** Vercel para frontend y endpoints de corta duración; Neon Postgres para la base de control y una instancia/proyecto Neon independiente por empresa. La elección se debe validar con una prueba de costos, restauración y provisión antes de producción.
4. **Autenticación:** identidad individual del usuario y membresía explícita por empresa. El PIN local existente no se considera autenticación suficiente para el producto multiempresa.
5. **Principio de seguridad:** el servidor determina la empresa activa desde una sesión verificada y comprueba membresía en cada petición. Nunca se acepta una URL de base de datos enviada por el navegador ni se permite seleccionar una empresa solo modificando un parámetro.
6. **Archivos:** documentos fiscales en almacenamiento de objetos privado, no en una carpeta pública. Guardar en la base solo una clave de objeto, metadatos y hash. Acceso mediante URL firmada de corta duración.
7. **Credenciales:** no almacenar contraseñas de SENIAT/SIGAT en texto plano. Preferir un gestor de secretos; si se cifra en la aplicación, la clave debe estar en un gestor de secretos/KMS y fuera de la base y del repositorio.

## Por qué Neon + Vercel es una opción candidata

- El proyecto ya utiliza Vercel y el driver serverless de Neon, por lo que se reduce el cambio inicial.
- La documentación de Neon consultada en octubre de 2026 describe planes con 100 proyectos en Free/Launch y 1.000 en Scale, con uso y límites distintos por plan. El plan gratuito es útil para prototipos, no debe asumirse como garantía de operación fiscal crítica.
- Vercel tiene límites por plan y por función; antes de producción deben medirse volumen de solicitudes, tiempos de consulta, trabajos de OCR/IA y tamaño de documentos. Los archivos grandes deben ir directamente a almacenamiento privado y no atravesar funciones como base64.
- Alternativa: Supabase ofrece PostgreSQL administrado, pero cada proyecto tiene un costo de cómputo propio en planes de pago; conviene comparar el costo por empresa y las necesidades de autenticación/almacenamiento antes de elegir.

Referencias consultadas:
- https://neon.com/docs/introduction/plans
- https://vercel.com/docs/limits
- https://vercel.com/docs/functions/limitations
- https://supabase.com/docs/guides/platform/billing-on-supabase

## Modelo lógico

### Plano central (base de control)
- `platform_companies`: registro mínimo de cada empresa.
- `platform_users`: usuario de identidad externa; no almacena contraseñas.
- `company_memberships`: relación usuario-empresa y rol.
- `tenant_database_connections`: proveedor y secreto de conexión cifrado/referencia de secreto.
- `platform_audit_events`: acciones de administración de plataforma.

### Base independiente de cada empresa
- Los módulos operativos existentes: productos, ventas, apartados, gastos, contabilidad y conciliación.
- `fiscal_obligations`: obligaciones por organismo, jurisdicción, período y fecha límite.
- `fiscal_documents`: permisos, solvencias, RIF, registros, declaraciones y comprobantes.
- `fiscal_events`: bitácora de preparación, presentación, pago y verificación.
- `tenant_audit_events`: cambios y operaciones importantes dentro de la empresa.

## Secuencia de implementación

1. Respaldar y congelar V26. No ejecutar migraciones sobre la base productiva.
2. Crear base de control separada (`CONTROL_PLANE_DATABASE_URL`) y aplicar solo la migración `control-plane/001_control_plane.sql` en esa base.
3. Crear una base de prueba para MAKD SHOP, aplicar esquema operativo y `tenant/001_fiscal_workspace.sql`.
4. Implementar autenticación verificada y autorización empresa-usuario en el servidor.
5. Implementar un resolvedor de tenant que solo obtenga conexiones desde el plano central y descifre secretos en servidor.
6. Adaptar cada endpoint para recibir un contexto de tenant ya autorizado; eliminar las consultas que usan el singleton global para datos de negocio.
7. Migrar y reconciliar los datos de MAKD SHOP; comparar conteos, totales y saldos antes y después.
8. Crear una segunda empresa ficticia y ejecutar pruebas negativas de aislamiento.
9. Añadir la interfaz de Carpeta Fiscal y después evaluar automatizaciones permitidas en SIGAT/SENIAT.

## Reglas para automatizar portales fiscales

- Los estados `preparado`, `presentado`, `pagado` y `verificado` son diferentes.
- Una captura o un archivo cargado no prueba por sí solo que la autoridad haya confirmado el pago.
- No simular autenticación, CAPTCHA ni controles anti-bot. Automatizar solo mediante mecanismos permitidos por el portal o integraciones oficiales.
- Registrar usuario, fecha, acción, período, referencia y evidencia documental.

## Criterios mínimos de aceptación

- Empresa A no puede leer ni modificar datos, archivos o reportes de empresa B.
- No se puede cambiar de tenant manipulando URL, body, query string o cabeceras.
- La conexión a una base tenant nunca se elige con datos aportados por el navegador.
- No hay secretos en logs, bundles del cliente, repositorio o tablas sin cifrado.
- Se pueden hacer y restaurar copias de seguridad por empresa.
- La migración conserva ventas, existencias, apartados, comprobantes y asientos; se concilian totales.
- Pruebas automatizadas de aislamiento y build pasan antes del despliegue.

## Limitación actual

Este documento y las migraciones describen la base de la arquitectura. No crean automáticamente empresas, no configuran autenticación, no resuelven conexiones de tenant y no modifican aún los endpoints de V26. No desplegar a producción ni presentar el sistema como multiempresa hasta completar esos pasos.

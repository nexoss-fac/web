# Antes de ejecutar migraciones

1. Hacer backup verificado de la base actual y comprobar restauración.
2. Crear una base nueva para el plano de control. No reutilizar la base operativa actual.
3. Aplicar `db/migrations/control-plane/001_control_plane.sql` solo en la base central nueva.
4. Aplicar `db/migrations/tenant/001_fiscal_workspace.sql` solo en una base tenant de prueba.
5. No añadir `DATABASE_URL` ni credenciales de SENIAT/SIGAT al repositorio.
6. No desplegar a producción aún: las rutas existentes de V26 siguen usando la conexión global y no comprueban una membresía de empresa.
7. Antes de conectar datos reales, implementar y probar autenticación, autorización, resolvedor de tenant, cifrado/gestor de secretos, backups y auditoría.

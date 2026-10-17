# Migraciones multiempresa — uso seguro

- `control-plane/001_control_plane.sql`: solo en una base de control nueva y vacía; incluye empresas, usuarios, membresías, invitaciones, planes, suscripciones, conexiones tenant y auditoría.
- `control-plane/002_current_platform_model.sql`: migración aditiva para alinear una base que ya ejecutó `001` con los campos de empresa, vigencia de invitación y uso actuales.
- `tenant/001_fiscal_workspace.sql`: solo en una base tenant de prueba nueva y vacía.
- Nunca ejecutar ambas migraciones en la base actual de MAKD.
- Estas migraciones no migran el inventario, ventas, apartados ni contabilidad existentes.
- No aplicar desde el servidor de la aplicación ni automáticamente al arrancar.
- El repositorio PostgreSQL requiere aplicación manual de las migraciones en la base central dedicada. No habilitar la selección del repositorio hasta completar pruebas de integración con PostgreSQL.
- `npm run test:multiempresa:postgres` ejecuta una prueba de integración en un esquema temporal y elimina únicamente ese esquema. Requiere `CONTROL_PLANE_TEST_DATABASE_URL` apuntando a una base de pruebas desechable con permiso `CREATE/DROP SCHEMA`; no se debe usar una URL de producción.
- Antes de cualquier migración, comprobar que la URL corresponde al entorno de prueba y tener backup restaurable.

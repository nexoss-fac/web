# Pruebas de aceptación — plataforma multiempresa

No ejecutar contra datos reales. Usar empresas y registros ficticios.

## Identidad y acceso

- [ ] API rechaza peticiones sin token.
- [ ] API rechaza token inválido, vencido o con emisor/audiencia incorrectos.
- [ ] Usuario bloqueado no accede aunque el token sea válido.
- [ ] Usuario sin membresía activa recibe 403.
- [ ] Rol cajero no puede administrar usuarios, secretos ni configuración fiscal.
- [ ] El servidor no confía en `company_id`, URL de base de datos ni rol enviados por el navegador.

## Aislamiento entre bases

- [ ] Empresa A y B usan URLs de conexión distintas, resueltas exclusivamente en servidor.
- [ ] Crear una venta en A no cambia inventario ni reportes de B.
- [ ] Buscar/editar/eliminar IDs de B desde una sesión de A no revela existencia ni contenido.
- [ ] Exportaciones, adjuntos, imágenes, recibos y documentos fiscales están aislados.
- [ ] La numeración de facturas y apartados es independiente por empresa.
- [ ] Cerrar sesión o cambiar de empresa limpia el estado local anterior.

## Datos y continuidad

- [ ] Migración desde copia preserva conteos y totales financieros.
- [ ] Backup por empresa se restaura en una base vacía y se verifican los totales.
- [ ] El registro de auditoría identifica actor, empresa, acción, fecha, resultado y request ID.
- [ ] No se registran tokens, URLs de conexión ni credenciales fiscales en logs.

## Operación

- [ ] Lint y build pasan en entorno limpio.
- [ ] Pruebas automatizadas e integración pasan.
- [ ] Las variables de producción no existen en Preview/Development.
- [ ] Hay procedimiento para suspender una empresa sin afectar a las demás.
- [ ] Existe plan de eliminación/exportación de datos al terminar el servicio.

**Criterio:** un solo fallo de aislamiento bloquea el lanzamiento comercial.

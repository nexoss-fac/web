# Cambios sobre NEXOSS multiempresa (copiar encima del proyecto, misma ruta)

Este paquete REEMPLAZA al anterior: incluye todo lo anterior más lo nuevo.
Verificado: `tsc --noEmit` limpio, 113 pruebas del backend + 15 de dominio/auth pasan, el build del frontend compila y el servidor arranca.
Verificación de esta entrega: 134 pruebas del backend, tsc limpio, build y arranque correctos.
NO se probó en un navegador real: abre cada pantalla tocada antes de usar esta versión.

## Nuevo en esta entrega
1. Gastos con la norma Patentadoc: Partida Egresos > Cuenta Gastos > 21 subcuentas, en el orden de la norma (con botón para verlas alfabéticas). Aplica al formulario de gastos, al filtro, al escáner de recibos (IA), al asiento contable automático y al formulario manual de asientos (cuenta Gastos). Los gastos viejos se muestran con su subcuenta equivalente; 3 categorías antiguas no tienen equivalente y quedan "Sin clasificar" (ver docs/expense-classification.md).
2. Libro de Inventario Normado como tu modelo en Excel, SIN columnas de retiro: Existencia inicial, Entrada, Autoconsumo, Donaciones, Salida y Existencia final (pantalla, Excel y PDF salen de la misma definición). El modal de salidas ofrece los motivos Autoconsumo y Donación.
3. Carpeta fiscal: estados Vigente / Por vencer / Vencido / En trámite (calculados con la fecha de hoy), seis áreas, contadores y filtros, calendario fiscal con avisos (7, 3 y 1 día antes, configurable; avisos del navegador), y pestaña Portales que cambia según el estado de la empresa (con enlaces configurables). Ver docs/fiscal-board.md.
4. Error corregido en la validación de la carpeta fiscal: un requisito con documento de evidencia vinculado provocaba un error interno al guardar.
5. El estado público de cada documento (QR) ahora se calcula con la fecha de hoy.

6. Tasa del BCV en modo local: nuevo interruptor `VITE_NEXOSS_ALLOW_BCV=true` en el `.env`. Permite actualizar la tasa del dólar sin abrir Google Sheets, GitHub ni webhooks, que siguen bloqueados por `VITE_NEXOSS_LOCAL_ONLY=true`.

7. Abonos de crédito (Cashea): el servidor descartaba el historial de abonos (`cashea_abonos`) al guardar, así que nunca llegaba a Neon. Ya se guarda; si la base de Neon no tenía esa columna, se crea sola (solo se agrega, no se borra nada). Si Neon falla, ahora aparece un aviso en pantalla en vez de quedarse callado. Los abonos ya registrados antes de este cambio no tienen historial en Neon: ver el mensaje.

8. Teléfono: botón central "Gastos" (cámara) en la barra inferior móvil; abre el escáner de recibos para tomar la foto o subir el archivo.
9. Correo de invitación al equipo: ahora se envía (Gmail por SMTP o Resend). Si no sale, la invitación queda creada y el panel muestra el motivo. Configuración en docs/configuracion-correo-y-avisos.md.
10. Avisos al teléfono (Telegram o ntfy) cuando se registra una venta o un gasto nuevo, una sola vez por registro. Configuración en el mismo documento.

11. Guardar la carpeta fiscal, una venta o un archivo de datos ya no recarga la página en pleno trabajo (Vite ignora `server/data`, `docs` y `tests`).

## Incluido de la entrega anterior
API vieja cerrada (410), error 502 si Neon falla al guardar una venta, validación de totales en el servidor (`NEXOSS_SALE_TOTALS=warn` para solo avisar), logger con niveles (`LOG_LEVEL`), permisos por rol en una tabla, rutas de ventas en `server/routes/salesRoutes.ts`, tipos de venta y producto en el servidor, dos errores de compilación en PointOfSale y cuatro de tipos en industrias.

## Pendiente
- Generalizar el vocabulario de zapatería en los demás perfiles (página Compras, etc.) y categorías propias por empresa guardadas en Neon (requiere decisión: ver el mensaje).
- Informe Fiscal de inspección (listado de más de 100 puntos de las capturas nuevas).
- Pestañas Pagos, Inspección y Gestión de la captura (faltan datos: ver el mensaje).
- Avisos por correo o WhatsApp (requieren un servicio de envío en el servidor).
- Partir `StoreContext.tsx` y el resto de `server.ts`; dinero en centavos enteros.
- `database/control-plane.sql` NO es copia de la migración 001: decide tú si se borra.

## Limpieza manual (PowerShell, desde la carpeta del proyecto)
    Remove-Item audit-detalle.json          # idéntico a audit-dependencias.json
    Get-ChildItem -Recurse -Filter *.bak | Where-Object { $_.FullName -notmatch 'node_modules' } | Remove-Item
    # No incluyas node_modules ni dist al comprimir el proyecto (el zip pesa ~398 MB).

# Revisión de NEXOSS multiempresa

Estado base: `tsc --noEmit` limpio, 5 pruebas de auth + 21 de multiempresa + 7 de dominio pasan, y el build compila. Los problemas están en el diseño y la lógica, no en errores de compilación.

## Corregido en esta carpeta (copiar encima del proyecto, misma ruta)

1. **Explorador de BD abierto a cualquier rol** (`server/multiempresa/companyAccess.ts`, `server/db.ts`). `/api/db/tables` y `/api/db/table-data` permitían leer tablas completas del esquema `public` a auditor, supervisor, contador y cajero (la regla de solo lectura los dejaba pasar). Con Neon configurado, eso es lectura entre empresas. Ahora solo owner/admin. `LIMIT` acotado a 1-200. Prueba nueva: `companyAccess.test.ts`.
2. **Una venta registrada se podía reescribir** (`server.ts`). `POST /api/sales` con un `id` existente y `PATCH /api/sales/:id` hacían merge de todo el body (totales, IVA, ítems), y el rol cajero puede hacer POST. Ahora solo se actualizan pagos, estado, fecha, notas y campos Cashea, igual que el `ON CONFLICT` de Neon.
3. **Anular venta no funcionaba en modo local** (`server.ts`). `voidSale` solo opera con Neon; sin él devolvía 404. Ahora anula sobre el JSON local y devuelve el stock.
4. **Código muerto con manejo de token de GitHub** (`server.ts`): el segundo `app.post('/api/catalog/sync-github')` (195 líneas) nunca se ejecutaba porque el primero responde 503. Eliminado.
5. **Configuración**: `.gitignore` ignoraba `.env.multiempresa.example` (el patrón `.env.*` solo exceptuaba `.env.example`) y ahora también ignora `*.bak`. `.env.example` y `.gitignore` tenían finales de línea CRLF mezclados. El script `clean` usaba `rm -rf` (no funciona en PowerShell); ahora usa Node. `test:multiempresa` incluye la prueba nueva.

## Pendiente (no lo toqué: requiere tu decisión)

- **`api/index.ts` + `server/app.ts` (ruta Vercel/Neon antigua) no tienen autenticación ni empresa.** Si alguna vez se despliega, expone todo. Recomiendo borrarlos o que `api/index.ts` responda 410.
- **Totales confiados al cliente**: `total_usd`, IVA, ganancia y `tasa_cambio` se guardan tal como llegan. Para contabilidad conviene recalcular en el servidor.
- **Dinero en `number` (float)**: saldos de cuentas y totales acumulan error de redondeo. Usar centavos enteros o redondear a 2 decimales en cada operación.
- **Neon es una BD global sin `company_id`** (`sales_transactions`, `shoe_products`): no hay aislamiento entre empresas. Es el bloqueo que ya señala tu auditoría.
- **Fallos de Neon silenciados**: tras guardar en JSON, si Neon falla solo se hace `console.error` y se responde `saved: true`; los dos almacenes divergen sin aviso.
- **Anular no revierte saldos de cuentas** (ni en Neon ni en local): las ventas suman a `accounts.saldo`, pero la anulación solo devuelve stock. Confirma si es intencional.
- **Stock**: tras descontar por ítems, `updatedProducts` del cliente sobrescribe el stock; con dos cajas simultáneas se pierden descuentos.
- **Dependencias**: tu `audit-dependencias.json` marca 5 vulnerabilidades altas (firebase 9.14 vía `@grpc/grpc-js`, y `xlsx`). Tu `package.json` ya declara `firebase ^12`, así que ese audit parece de una versión anterior: vuelve a correr `npm audit`.
- **Orden del proyecto**: `*.bak`, `audit-detalle.json` idéntico a `audit-dependencias.json`, `database/control-plane.sql` duplicando `db/migrations/control-plane/`, y `dist/` y `node_modules/` dentro del zip (398 MB).
- No revisé a fondo el frontend (`StoreContext.tsx`, `PointOfSale.tsx`, etc.).

## Nota sobre verificación
Probé con `xlsx@0.18.5` de npm porque mi entorno no alcanza cdn.sheetjs.com; el `package.json` entregado conserva tu dependencia original.

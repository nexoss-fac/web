# Inventory book specification (initial)

## Categories

Predefined categories:

1. Mercancía
2. Materia prima
3. Productos en proceso
4. Productos terminados

Bienes muebles e inmuebles are fixed assets and must be managed separately from inventory. Authorized users may add custom inventory categories scoped to their company. Category changes must be audited. Decide how archived categories remain visible on historical records before implementation.

## Activity columns

The inventory book uses these columns:

- **Inicio/Inicial** — opening quantity/value for the period or starting balance, with the precise period-opening rule to be confirmed.
- **Entrada** — quantities and values received.
- **Salida** — quantities and values issued or otherwise removed, excluding autoconsumo if the business rule treats it separately.
- **Autoconsumo** — quantities and values consumed internally.
- **Existencia** — resulting quantity/value on hand.

Do not include a separate **Retiros** column. Recommended balance equation for quantities is opening + entradas - salidas - autoconsumo = existencia; validate treatment of returns, adjustments, transfers, and reversals with the business owner.

## Data to capture

- Company, item, category, unit of measure, and movement date.
- Movement type, quantity, unit cost, extended cost, and reference/document.
- Bs amount, USD amount, exchange rate, rate effective date, and rate source where applicable.
- User/actor and timestamps; correction/reversal linkage where applicable.

Precision, valuation method, exchange-rate selection, and rounding are open decisions. Preserve original entered values and rate metadata so a later report can explain conversions. Prevent edits from silently rewriting posted history.

The Phase 1 calculation helper accepts already-recorded Bs and USD amounts and aggregates each currency independently. It does not convert currencies, infer unit costs, decide valuation, or enforce a period-opening policy. The browser prototype is not yet wired to this helper.

## Validation and reporting

- Enforce nonnegative/valid quantities where the chosen activity and policy require it; explicitly design negative stock exceptions.
- Show an as-of balance and activity for a selected period, with company and category filters.
- Keep source records traceable from report totals. Apply server-side tenant authorization to every query and export.

## Estructura del libro en pantalla, Excel y PDF

Definida en `src/domain/inventoryBookLayout.ts` a partir del modelo en Excel del contribuyente (art. 177 LISLR), sin grupo de Retiro:

- Existencia inicial: Cantidad, Costo unitario, Monto total.
- Entrada: Fecha, Cantidad, Costo unitario, Monto.
- Autoconsumo: Fecha, Cantidad, Monto.
- Donaciones: Fecha, Cantidad, Monto.
- Salida: Cantidad, Monto.
- Existencia final: Cantidad, Costo unitario, Monto total.

Una salida de inventario se clasifica por su motivo: "Autoconsumo", "Donación" o, en cualquier otro caso, Salida. El formulario de movimientos ofrece esos motivos como botones. El cálculo de dominio (`inventory-book.mjs`) acepta el movimiento `Donación` y sigue rechazando `Retiro`.

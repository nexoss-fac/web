# Expense classification specification (initial)

## Hierarchy

Use the hierarchy **Partida Egresos > Cuenta Gastos > subaccounts**. Initial subaccounts under Cuenta Gastos:

- Sueldos empleados
- Sueldos directores
- Tributos pagados
- Indemnizaciones laborales
- Depreciaciones y amortizaciones
- Intereses
- Traslados
- Pérdidas
- Reservas
- Arrendamientos
- Transporte
- Honorarios profesionales
- Reparaciones
- Publicidad comercial
- Seguros
- Investigación
- Representación
- Personal
- Bancos
- Servicios públicos
- Servicios privados

The exact accounting meaning and placement of each item should be confirmed by the organization and its accounting adviser. Keep classification configuration versioned/auditable; define whether company-specific accounts can be added before implementation.

## Expense record (proposed minimum)

Company, supplier, date, description/reference, Partida Egresos, Cuenta Gastos, subaccount, amount, currency, exchange rate, rate effective date/source, attachment reference if enabled, creator, and timestamps. Store original currency and amount as entered; define conversion/rounding rules before calculating totals.

## Reports

Provide filters and groupings by supplier, year, month, and day. Reports should show selected date basis, currency basis, applied exchange-rate policy, and company. Enforce authorization on both report queries and generated downloads. Reconcile totals to underlying records and preserve traceability.

No tax-compliance, deductibility, or statutory-reporting claim is made by this specification.

The Phase 1 report helper groups synthetic expense records by supplier, calendar day, and currency, while preserving voucher, rate, subaccount, and supporting-document references on each record. It does not convert currency or generate downloadable files; the browser prototype is not yet wired to it.


## Implementación (Patentadoc)

- Partida **Egresos** > Cuenta **Gastos** > 21 subcuentas, en el orden de la norma (`src/domain/expenseChart.ts`). Los menús desplegables usan ese orden y permiten cambiar a alfabético.
- El asiento contable de un gasto usa partida `Egresos`, cuenta `Gastos` y la subcuenta elegida; la descripción va en la glosa.
- Gastos guardados con las categorías anteriores se muestran con su equivalente: Alquiler de Local = Arrendamientos, Nómina y Sueldos = Sueldos empleados, Servicios Públicos = Servicios públicos, Fletes y Transporte = Transporte, Publicidad y Redes Sociales = Publicidad comercial, Mantenimiento y Reparaciones = Reparaciones, Impuestos y Tasas Municipales = Tributos pagados, Comisiones y Gastos Bancarios = Bancos.
- Sin equivalente (quedan como "Sin clasificar" hasta que se decida su cuenta): Compra de Mercancía / Proveedores (es inventario, no gasto), Empaques, Bolsas y Cajas, y Otros Gastos Operativos.

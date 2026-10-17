# Functional scope and current limits

## Product direction

NEXOSS carries forward the working MAKD V27 application flows as a local independent copy, then extends them toward a multi-company business administration system. Inherited modules include product inventory, point of sale, layaways, cash closing, expenses, bank reconciliation, accounting, and reports. The initial NEXOSS design also calls for a company-aware inventory book and supplier expense reports; these should be validated against the inherited workflows before treating them as complete.

## Multi-company access

- A user may belong to one or more companies.
- Each business operation must be scoped to an active company authorized by a server-verified membership and role.
- Company-specific categories, suppliers, settings, sequences, reports, files, and audit history must remain isolated.
- A browser-supplied company selector is only a request; it never grants authorization.

The current app does not satisfy these requirements yet. It retains one local store and legacy single-database API patterns. See `architecture-security.md` and the acceptance checklist in `docs/legacy-v27/arquitectura/`.

## Inventory and expenses

- Inventory categories start with Mercancía, Materia prima, Productos en proceso, and Productos terminados. Bienes muebles e inmuebles belong in a separate fixed-assets register; company-specific categories require tenant ownership.
- The inventory book should present Inicio/Inicial, Entrada, Salida, Autoconsumo, and Existencia. It must not add a separate Retiros column; reconcile the inherited report before release.
- Expense classification follows Partida Egresos > Cuenta Gastos > subaccounts, with supplier and date filters.
- Preserve the original amount, currency, applicable exchange-rate metadata, and traceability; calculation and accounting rules need review.

## Reports and audit

Reports require company authorization, explicit date and currency basis, filters, and traceability to source records. Auditable changes need actor, timestamp, company, action, record ID, and appropriate before/after values.

## Local-only boundaries

Use synthetic data only. No production deployment, real payment verification, cloud integration, data migration from V27, or claim of tax compliance is included. The V27 source folder and its existing data remain separate and unchanged.

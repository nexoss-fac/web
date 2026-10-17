# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status and hard rules

NEXOSS is a multi-company (multi-tenant) point-of-sale / accounting app (ventas, inventario, apartados, cierre de caja, gastos, conciliación bancaria, contabilidad, reportes, carpeta fiscal) for Venezuelan businesses. It is a **local demo, not production-ready** (`npm run audit:multiempresa` reports "NO LISTO PARA USO COMERCIAL MULTIEMPRESA"). From README and `docs/INSTRUCCIONES_PARA_CODEX.md`:

- Use only fictitious data. Do not deploy, publish, or connect real services/databases (Neon, BDV, webhooks, production). Do not add credentials or set `DATABASE_URL` / `CONTROL_PLANE_DATABASE_URL`, and do not run migrations against shared databases.
- The source project `makd-shop-v27-fundacion-multiempresa` is read-only reference material; never edit or connect it.
- Do not claim tax, legal, or accounting compliance.
- Inventory book columns are fixed: Inicial, Entrada, Salida, Autoconsumo (and Donaciones), Existencia final. **No "Retiros" column.**
- Leave open decisions about valuation, exchange rates, rounding, closings, and corrections to the owner and their advisor.
- At the end of each phase, summarize **in Spanish** what changed, what was verified, its limits, and the next concrete step.
- `CAMBIOS.md` and `REVISION.md` are the running changelog / review notes, including known pending issues. Read them before large changes. `docs/roadmap.md` holds the plan.

## Commands

Node.js 22+ is required. The shell is Windows PowerShell 5.1, so chain commands with `;` instead of `&&`.

- `npm run dev`: runs `server.ts` directly with `node --experimental-strip-types` (Express + Vite middleware, http://127.0.0.1:3000). Use only TS syntax that type stripping supports (no `enum`, no parameter properties, no namespaces).
- `npm run lint`: `tsc --noEmit` (the only lint/typecheck).
- `npm run build`: `vite build`, then esbuild bundles `server.ts` to `dist/server.cjs`. `npm start` runs it, but the server deliberately refuses to start with `NODE_ENV=production` (`server/productionRuntime.ts`).
- `npm run test:multiempresa`: main test suite (`node:test`). New test files must be **added explicitly to the list in `package.json`** because there is no glob.
- `npm run test:auth`: Firebase auth middleware tests.
- Single test file: `node --experimental-strip-types --test server/sales/saleTotals.test.ts` (add `--test-name-pattern "<name>"` to filter).
- `npm run test:multiempresa:postgres` needs `CONTROL_PLANE_TEST_DATABASE_URL` and has never been run. Don't run it without explicit instruction.
- `npm run migrate:control-plane`: guarded by DB name `nexoss_control_plane` plus `CONFIRM_CONTROL_PLANE_MIGRATION`. See README; don't run it unprompted.

Local Firebase Auth Emulator setup uses temporary PowerShell env vars documented in `docs/implementation-multiempresa-local.md` and `docs/authentication-local.md`.

## Architecture

**Single process.** `server.ts` (~2,100 lines, monolithic) is both the API and, in dev, the Vite host (`createViteServer` in middleware mode; in non-dev it serves `dist/`). It listens only on `127.0.0.1`. Some routes have been extracted to `server/routes/` (for example `salesRoutes.ts`) and to domain helpers in `server/sales`, `server/inventory`, `server/mail`, and `server/notify`. Continue that extraction instead of growing `server.ts`.

**Request pipeline (order in `server.ts` matters):**
1. Public routes come first: `/api/health` and `/api/public/fiscal-board/:companyId/:token` (fiscal QR bearer link, token is hash-compared).
2. `app.use('/api', requireFirebaseAuth)` (`server/auth/firebaseAuth.ts`) verifies the Firebase ID token and sets `req.firebaseIdentity`.
3. Platform/onboarding routes (`/api/platform/...`: register company, invitations, central admin) need identity but no tenant.
4. `app.use('/api', createCompanyAccessMiddleware(...))` (`server/multiempresa/companyAccess.ts`) validates the **untrusted** `X-Company-Id` header against membership, company status, role, and subscription. Every operational route is registered after this. Role-gate routes with `requireTenantRole(...)` (for example `adminOnly`). The role/permission table lives in `companyAccess.ts`.
5. A catch-all `/api` 404 prevents API misses from falling through to the SPA.

New operational routes must be registered after step 4 and must read the company from the validated request context, never from the body or header directly.

**Control plane vs. tenant data.**
- The control plane (companies, members, invitations, plans, subscriptions, audit) defaults to local JSON via `server/multiempresa/platformStore.ts` (`NEXOSS_MULTIEMPRESA_MODE=local-demo`). `NEXOSS_PLATFORM_STORAGE=postgres` switches to `PostgresControlPlaneRepository` (opt-in, not integration-tested). SQL migrations are in `db/migrations/control-plane/` and `db/migrations/tenant/`. `database/control-plane.sql` is a legacy, divergent file.
- Tenant operational data is stored as JSON under `server/data/tenants/<companyId>/` (`tenantFileStore.ts`, `tenantDataFiles()`), with the fiscal board in `fiscalBoardStore.ts`. Responses for non-admin roles are trimmed by `sanitizeStoreForTenantRole` in `server.ts`.
- Legacy Neon access (`server/db.ts`, `getNeonSql()`) is a global DB **without `company_id`**, so it has no tenant isolation. Keep it disabled.
- `api/index.ts` plus `server/app.ts` is the old Vercel/Neon entry point with no auth. It now returns 410. Don't revive it.

**Frontend.** React 19 + Tailwind 4 + `motion` + `recharts`; `@/` aliases the repo root. `src/context/StoreContext.tsx` (~2,300 lines) is the central state store and holds most client business logic, while `App.tsx` routes between module screens in `src/components/<module>/`. `installFirebaseApiAuthFetch()` (`src/services/firebaseApiAuth.ts`) monkey-patches `window.fetch` to attach the Bearer token and `X-Company-Id` (from `localStorage` key `nexoss_active_company_id`) to same-origin `/api/` calls. Code calls plain `fetch` and gets auth automatically. Browser caches are keyed per company. Admin/Cajera PINs are UI-only and grant no server permissions.

**Domain logic** that must match between screen, Excel, and PDF (inventory book layout, expense chart of accounts "Patentadoc", fiscal calendar/board, industries) lives in `src/domain/` and has its own tests there.

**Env flags worth knowing:** `VITE_NEXOSS_LOCAL_ONLY=true` blocks client calls to BCV, Google Sheets, GitHub, and webhooks. `VITE_NEXOSS_ALLOW_BCV=true` re-allows only the BCV rate. `NEXOSS_SALE_TOTALS=warn` makes server-side sale-total validation log instead of reject. `LOG_LEVEL` controls `server/logger.ts`. `NEXOSS_PLATFORM_ADMIN_UIDS` lists central admins. `VITE_*` values are public browser config, so never put secrets in them. See `.env.example` and `.env.multiempresa.example`.

## Known pitfalls

- Money is stored as JS `number` (float). `server/money.ts` exists. Use it for new arithmetic and round to 2 decimals.
- JSON stores have no concurrency control, and client-sent `updatedProducts` can overwrite stock decrements.
- Voiding a sale restores stock but not `accounts.saldo`.
- Vite's watcher ignores `server/`, `docs/`, and `tests/` so that data writes don't reload the page. Keep that when touching dev-server config.

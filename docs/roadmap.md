# Roadmap

## 0. Independent local port

- Copy the established V27 UI, workflows, server code, static assets, and multi-company design into NEXOSS.
- Exclude V27 records, private environment files, and external identity configuration.
- Disable automatic external requests and give NEXOSS its own browser-storage namespace.
- Keep the V27 source folder unchanged.

## 1. Verify the inherited workflows locally

- Install dependencies from an offline/local source where available.
- Run type checking, the tenant resolver unit tests, the readiness audit, and a local browser smoke check.
- Fix regressions introduced by the port and keep integration variables empty.
- Review V27-derived behavior and replace store-specific defaults with company configuration.

## 2. Connect the multi-company boundary

- [x] Verify Firebase ID tokens in Express before `/api` routes.
- [x] Add local-demo registration, owner membership, onboarding, invitations, roles, plans, subscriptions and platform-admin endpoints/UI.
- [x] Check membership, company status, role, plan/module access and expiration for commercial routes.
- [x] Scope the local JSON server store and browser cache by company UUID; add negative authorization tests.
- [ ] Replace the local file-backed control plane with a PostgreSQL control plane and one PostgreSQL database per company.
- [ ] Add a real server-side secret provider, tenant connection health checks/provisioning, backup/restore and concurrency-safe repositories.
- [ ] Add E2E denials for every route, export, file and asynchronous job before considering a commercial test.
- [ ] Choose and integrate a payment provider before enabling automatic renewals.

This phase is implemented only as an isolated local demo. The multiempresa audit intentionally continues to fail commercial readiness.

## 3. Validate operations and finance

- Confirm exchange-rate, rounding, inventory valuation, correction, and period-closing rules.
- Reconcile imports, exports, balances, sales, layaways, and accounting using synthetic records.
- Validate backup/restore and access reviews before considering a controlled test environment.

## 4. Release readiness

- Select and configure isolated staging infrastructure only after a separate security review.
- Obtain separate explicit authorization before connecting external accounts, using real data, or deploying.

No roadmap phase authorizes edits to MAKD V27 or access to its production systems.

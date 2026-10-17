# NEXOSS

NEXOSS now carries forward the local application source from `makd-shop-v27-fundacion-multiempresa` as an independent working copy. The V27 folder is the read-only source of the port; do not edit it from this project.

## Inherited application

The React/Vite interface and local API include point of sale, product inventory, layaways, cash closing, expenses, bank reconciliation, accounting, and reports. The copied source keeps the established workflows and calculations as a starting point. Data files and environment configuration were not copied; this project starts without the V27 business records.

## Multi-company status

The current local implementation adds verified Firebase identity, company membership/roles, an onboarding flow, plans/subscriptions and a central admin UI. Operational JSON and browser cache are scoped per company. The control-plane schema and PostgreSQL repository are implemented, and the platform endpoints now have an opt-in PostgreSQL branch, but no real PostgreSQL integration test has been run. The default backend is still local JSON; operational APIs, tenant authorization, and fiscal QR data are not yet wired to PostgreSQL or Cloud Storage. The readiness audit still reports **NO LISTO PARA USO COMERCIAL MULTIEMPRESA**. Do not use real data or deploy it.

## Google Cloud production preparation

Google Cloud is the intended permanent hosting target, using the existing Firebase project for Auth. This is a target architecture only: no cloud resources have been created, no credentials have been added, and this version is deliberately blocked from starting with `NODE_ENV=production`. Its company control plane and operational/fiscal data still use local JSON; the PostgreSQL control-plane repository is not wired to API routes, tenant database resolution is not integrated, and uploaded fiscal documents are stored in the JSON payload rather than private object storage.

Before deployment, migrate and test the control plane and all company-scoped operations on PostgreSQL; integrate private document storage; configure Firebase Auth production domains and server-side Firebase Admin using the Cloud Run service identity (Application Default Credentials, no downloaded service-account key); store database and bucket configuration in Secret Manager; and complete backup/restore, authorization-isolation, and public-QR revocation tests. The intended infrastructure is Cloud Run, Cloud SQL for PostgreSQL, private Cloud Storage, and Secret Manager with a dedicated least-privilege service account. Do not deploy this version or expose the local `.env`/Auth Emulator.

The explicit control-plane migration command is `npm run migrate:control-plane`. It only accepts a PostgreSQL database whose name is exactly `nexoss_control_plane`, requires `CONFIRM_CONTROL_PLANE_MIGRATION=nexoss_control_plane`, serializes concurrent runs, records checksums, and never logs the connection URL. For a local migration rehearsal, create that empty database and connect through Cloud SQL Auth Proxy; keep both variables in the current PowerShell process and do not paste credentials in chat:

```powershell
$env:CONTROL_PLANE_DATABASE_URL = 'postgresql://USER:PASSWORD@127.0.0.1:5432/nexoss_control_plane'
$env:CONFIRM_CONTROL_PLANE_MIGRATION = 'nexoss_control_plane'
npm run migrate:control-plane
Remove-Item Env:CONTROL_PLANE_DATABASE_URL
Remove-Item Env:CONFIRM_CONTROL_PLANE_MIGRATION
```

This migration prepares only the central identity/company/plan schema and its initial trial plan. It does not migrate operational records or fiscal attachments, connect the tenant authorization middleware to PostgreSQL, or make the application deployable. Although platform endpoints have an opt-in PostgreSQL code path, do not enable it for normal use until the tenant middleware and operational persistence have also migrated and real PostgreSQL integration tests pass.

## Local development

Requires Node.js 22+ and the dependencies in `package.json`. For the isolated Auth Emulator flow, use the temporary PowerShell variables in [`docs/implementation-multiempresa-local.md`](docs/implementation-multiempresa-local.md); they do not require editing `.env`. The `VITE_FIREBASE_*` values are public browser configuration; never put service-account private keys in `VITE_*` variables. Firebase Admin uses `FIREBASE_AUTH_EMULATOR_HOST` in local mode. Do not set production credentials or any database URL.

The browser can sign in with Google or email/password through Firebase Authentication and attaches its ID token and selected company ID to same-origin API requests. Express verifies the token, then checks membership, company status, role and subscription before operational routes. Missing/invalid identity receives HTTP 401; missing membership or an unavailable subscription is denied. `/api/health` remains public. Invitations require individual acceptance by the matching verified email, expire after seven days and can be revoked by a company owner/admin; this project does not send invitation mail.

Admin/Cajera PINs remain only local UI behavior and do not grant server-side permissions. The local demo uses a JSON control plane and tenant folders under `server/data`; it has no encryption at rest, concurrency controls or PostgreSQL isolation. Do not put real company records here.

The fiscal folder's public QR is a bearer link: anyone who obtains it can view the compliance board and download only documents explicitly marked for publication. Owners/admins can revoke or replace it. This local demo uses tenant JSON files and a localhost URL; outside inspectors cannot reach localhost, and the local storage is not suitable for production. Deploy an HTTPS service with persistent, access-controlled storage and have a Venezuelan tax professional validate the applicable checklist before using it for official inspections.

The initial national fiscal reference list is deliberately limited to taxpayer duties in Article 155(1), (2), and (6) of the *Código Orgánico Tributario*, Official Gazette No. 6,507 Extraordinario (29 February 2020) ([official TSJ archive copy](https://historico.tsj.gob.ve/gaceta/febrero/29022020/29022020-6507.pdf)). These cover keeping tax books/records, applicable tax-register enrollment, and producing declarations/supporting records and merchandise-origin evidence when lawfully requested. They are not represented as items that must be publicly posted. The company-entered statuses are not authority-certified; applicability and any separate posting requirements require professional and municipal validation.

The local store is disposable demonstration data. It is not a backup or tenant-isolated database. Do not connect Neon, BDV, webhooks, production, or MAKD V27. Do not deploy this copy.

## Verification

Run `npm run test:auth` for the Firebase middleware tests, `npm run test:multiempresa` for tenant and membership tests, and `npm run build` for the production bundle. These checks do not prove end-to-end tenant isolation: the local demo partitions JSON files by authorized company UUID, but production still requires a PostgreSQL control plane and isolated tenant databases. Keep the readiness audit's commercial-use blockers until that infrastructure and negative cross-tenant tests exist.

For the Firebase local setup and emulator variables, see [docs/authentication-local.md](docs/authentication-local.md).
# Implementación multiempresa local

El flujo local de identidad, registro, onboarding, membresías, planes y aislamiento de datos se describe en [`docs/implementation-multiempresa-local.md`](docs/implementation-multiempresa-local.md). Es un entorno de demostración con JSON por empresa; no está habilitado para producción ni para datos reales.

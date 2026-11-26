-- Store company-scoped permissions configured by administrators for collector memberships.
BEGIN;

ALTER TABLE company_memberships
  ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMIT;

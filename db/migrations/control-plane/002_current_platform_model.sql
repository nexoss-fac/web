-- Additive alignment for control-plane databases created with migration 001.
-- Run only against the dedicated control-plane database.

BEGIN;

ALTER TABLE platform_companies
  ALTER COLUMN country_code TYPE TEXT USING rtrim(country_code::text),
  ADD COLUMN IF NOT EXISTS address TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS logo_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS fiscal JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS workspace JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE company_memberships
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

ALTER TABLE company_invitations
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS accepted_by_user_id UUID REFERENCES platform_users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;

ALTER TABLE company_usage_periods
  ADD COLUMN IF NOT EXISTS warehouses INTEGER NOT NULL DEFAULT 0 CHECK (warehouses >= 0);

ALTER TABLE platform_audit_events
  ADD COLUMN IF NOT EXISTS resource_type TEXT NOT NULL DEFAULT 'platform';

CREATE INDEX IF NOT EXISTS platform_companies_status_updated_idx
  ON platform_companies(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS company_memberships_company_role_idx
  ON company_memberships(company_id, role, status);
CREATE INDEX IF NOT EXISTS company_invitations_company_expiry_idx
  ON company_invitations(company_id, expires_at) WHERE status = 'pending';

COMMIT;

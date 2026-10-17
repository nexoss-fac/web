-- MAKD Gestión Empresarial
-- Ejecutar SOLO en una base de datos central nueva (CONTROL_PLANE_DATABASE_URL).
-- No ejecutar en la base operativa actual de MAKD SHOP.

BEGIN;

CREATE TABLE IF NOT EXISTS platform_companies (
  id UUID PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  legal_name TEXT NOT NULL,
  trade_name TEXT,
  rif TEXT,
  country_code TEXT NOT NULL DEFAULT 'VE',
  state_region TEXT,
  municipality TEXT,
  economic_activity TEXT,
  address TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  logo_url TEXT NOT NULL DEFAULT '',
  fiscal JSONB NOT NULL DEFAULT '{}'::jsonb,
  workspace JSONB NOT NULL DEFAULT '{}'::jsonb,
  onboarding_step SMALLINT NOT NULL DEFAULT 2 CHECK (onboarding_step BETWEEN 2 AND 5),
  status TEXT NOT NULL DEFAULT 'onboarding'
    CHECK (status IN ('onboarding', 'active', 'suspended', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (length(trim(legal_name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS platform_companies_rif_unique
  ON platform_companies (upper(regexp_replace(rif, '[^A-Za-z0-9]', '', 'g')))
  WHERE rif IS NOT NULL AND trim(rif) <> '';

-- auth_subject proviene del proveedor de identidad verificado por el servidor.
-- No se guardan contraseñas ni hashes de contraseña en esta tabla.
CREATE TABLE IF NOT EXISTS platform_users (
  id UUID PRIMARY KEY,
  auth_provider TEXT NOT NULL,
  auth_subject TEXT NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('invited', 'active', 'blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (auth_provider, auth_subject),
  CHECK (length(trim(email)) > 3)
);

CREATE TABLE IF NOT EXISTS company_memberships (
  company_id UUID NOT NULL REFERENCES platform_companies(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES platform_users(id) ON DELETE RESTRICT,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'accountant', 'auditor', 'supervisor', 'cashier')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('invited', 'active', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, user_id)
);
CREATE INDEX IF NOT EXISTS company_memberships_user_idx ON company_memberships(user_id, status);

CREATE TABLE IF NOT EXISTS company_invitations (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES platform_companies(id) ON DELETE RESTRICT,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'accountant', 'auditor', 'supervisor', 'cashier')),
  invited_by_user_id UUID NOT NULL REFERENCES platform_users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_by_user_id UUID REFERENCES platform_users(id) ON DELETE RESTRICT,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS company_invitations_email_idx ON company_invitations(lower(email), status);
CREATE UNIQUE INDEX IF NOT EXISTS company_invitations_pending_unique_idx
  ON company_invitations(company_id, lower(email)) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS platform_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  billing_interval TEXT NOT NULL CHECK (billing_interval IN ('month', 'year')),
  max_users INTEGER NOT NULL CHECK (max_users > 0),
  max_products INTEGER NOT NULL CHECK (max_products > 0),
  max_branches INTEGER NOT NULL CHECK (max_branches > 0),
  max_warehouses INTEGER NOT NULL DEFAULT 1 CHECK (max_warehouses > 0),
  modules JSONB NOT NULL DEFAULT '[]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS company_subscriptions (
  company_id UUID PRIMARY KEY REFERENCES platform_companies(id) ON DELETE RESTRICT,
  plan_id TEXT NOT NULL REFERENCES platform_plans(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('trialing', 'active', 'past_due', 'suspended', 'canceled')),
  billing_provider TEXT,
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (current_period_end > current_period_start)
);
CREATE INDEX IF NOT EXISTS company_subscriptions_status_idx ON company_subscriptions(status, current_period_end);

CREATE TABLE IF NOT EXISTS company_usage_periods (
  company_id UUID NOT NULL REFERENCES platform_companies(id) ON DELETE RESTRICT,
  period_start DATE NOT NULL,
  active_users INTEGER NOT NULL DEFAULT 0 CHECK (active_users >= 0),
  products INTEGER NOT NULL DEFAULT 0 CHECK (products >= 0),
  branches INTEGER NOT NULL DEFAULT 0 CHECK (branches >= 0),
  warehouses INTEGER NOT NULL DEFAULT 0 CHECK (warehouses >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, period_start)
);

-- encrypted_connection_secret debe contener ciphertext autenticado o una referencia
-- a un secreto externo. Nunca guardar aquí una URL en texto plano.
CREATE TABLE IF NOT EXISTS tenant_database_connections (
  company_id UUID PRIMARY KEY REFERENCES platform_companies(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL DEFAULT 'neon' CHECK (provider IN ('neon', 'postgres_other')),
  region TEXT,
  secret_reference TEXT,
  encrypted_connection_secret TEXT,
  encryption_key_version TEXT,
  status TEXT NOT NULL DEFAULT 'provisioning'
    CHECK (status IN ('provisioning', 'ready', 'degraded', 'disabled')),
  schema_version TEXT,
  provisioned_at TIMESTAMPTZ,
  last_health_check_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (secret_reference IS NOT NULL AND encrypted_connection_secret IS NULL)
    OR (secret_reference IS NULL AND encrypted_connection_secret IS NOT NULL)
    OR (status = 'provisioning' AND secret_reference IS NULL AND encrypted_connection_secret IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS platform_audit_events (
  id UUID PRIMARY KEY,
  actor_user_id UUID REFERENCES platform_users(id) ON DELETE SET NULL,
  company_id UUID REFERENCES platform_companies(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL DEFAULT 'platform',
  resource_id TEXT,
  request_id TEXT,
  outcome TEXT NOT NULL DEFAULT 'success' CHECK (outcome IN ('success', 'denied', 'failure')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (length(trim(action)) > 0)
);
CREATE INDEX IF NOT EXISTS platform_audit_company_time_idx
  ON platform_audit_events(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS platform_audit_actor_time_idx
  ON platform_audit_events(actor_user_id, created_at DESC);

COMMIT;

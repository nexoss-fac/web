-- Acceso de firmas contables a empresas clientes. Los datos operativos permanecen en cada tenant.
CREATE TABLE IF NOT EXISTS company_accounting_firm_grants (
  id UUID PRIMARY KEY,
  firm_company_id UUID NOT NULL REFERENCES platform_companies(id) ON DELETE CASCADE,
  client_company_id UUID NOT NULL REFERENCES platform_companies(id) ON DELETE CASCADE,
  scopes TEXT[] NOT NULL DEFAULT ARRAY['journal_read','ledger_read','reports_read']::TEXT[],
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','active','rejected','revoked')),
  requested_by_user_id UUID NOT NULL REFERENCES platform_users(id),
  decided_by_user_id UUID REFERENCES platform_users(id),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  CHECK (firm_company_id <> client_company_id),
  UNIQUE (firm_company_id, client_company_id)
);
CREATE INDEX IF NOT EXISTS idx_accounting_firm_grants_firm_status
  ON company_accounting_firm_grants (firm_company_id, status);
CREATE INDEX IF NOT EXISTS idx_accounting_firm_grants_client_status
  ON company_accounting_firm_grants (client_company_id, status);

-- Impide permisos vacíos o valores de scope que el backend no reconoce.
-- Se añade de forma idempotente para instalaciones donde la tabla ya exista.
DO $nexoss$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'company_accounting_firm_grants_scopes_valid'
      AND conrelid = 'company_accounting_firm_grants'::regclass
  ) THEN
    ALTER TABLE company_accounting_firm_grants
      ADD CONSTRAINT company_accounting_firm_grants_scopes_valid
      CHECK (
        cardinality(scopes) > 0
        AND scopes <@ ARRAY[
          'journal_read', 'ledger_read', 'purchases_read', 'sales_read',
          'expenses_read', 'reports_read', 'reconciliation_write',
          'journal_write', 'tax_read', 'closures_write'
        ]::TEXT[]
      );
  END IF;
END $nexoss$;

CREATE TABLE IF NOT EXISTS accounting_firm_access_audit (
  id UUID PRIMARY KEY,
  grant_id UUID REFERENCES company_accounting_firm_grants(id) ON DELETE SET NULL,
  firm_company_id UUID NOT NULL REFERENCES platform_companies(id) ON DELETE CASCADE,
  client_company_id UUID NOT NULL REFERENCES platform_companies(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES platform_users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_accounting_firm_audit_client
  ON accounting_firm_access_audit (client_company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_accounting_firm_audit_firm
  ON accounting_firm_access_audit (firm_company_id, created_at DESC);

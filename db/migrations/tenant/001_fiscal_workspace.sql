-- MAKD Gestión Empresarial — ejecutar una vez en la base independiente de cada empresa.
-- La migración no configura por sí sola el control de acceso ni el almacenamiento de archivos.

BEGIN;

CREATE TABLE IF NOT EXISTS fiscal_obligations (
  id UUID PRIMARY KEY,
  agency_code TEXT NOT NULL,
  agency_name TEXT NOT NULL,
  jurisdiction_level TEXT NOT NULL CHECK (jurisdiction_level IN ('national', 'state', 'municipal', 'labor', 'other')),
  jurisdiction_name TEXT,
  obligation_code TEXT,
  title TEXT NOT NULL,
  tax_period TEXT,
  due_date DATE,
  amount NUMERIC(18,2),
  currency_code CHAR(3) NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_preparation', 'prepared', 'submitted', 'paid', 'verified', 'overdue', 'not_applicable')),
  responsible_user_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (length(trim(title)) > 0),
  CHECK (amount IS NULL OR amount >= 0)
);
CREATE INDEX IF NOT EXISTS fiscal_obligations_due_idx ON fiscal_obligations(status, due_date);
CREATE INDEX IF NOT EXISTS fiscal_obligations_agency_period_idx ON fiscal_obligations(agency_code, tax_period);

CREATE TABLE IF NOT EXISTS fiscal_documents (
  id UUID PRIMARY KEY,
  document_type TEXT NOT NULL,
  title TEXT NOT NULL,
  issuing_agency TEXT,
  document_number TEXT,
  issued_at DATE,
  expires_at DATE,
  tax_period TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'expired', 'superseded', 'rejected', 'archived')),
  storage_object_key TEXT NOT NULL,
  original_filename TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  sha256_hex CHAR(64),
  related_obligation_id UUID REFERENCES fiscal_obligations(id) ON DELETE SET NULL,
  uploaded_by_user_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (length(trim(title)) > 0),
  CHECK (size_bytes IS NULL OR size_bytes >= 0),
  CHECK (sha256_hex IS NULL OR sha256_hex ~ '^[a-fA-F0-9]{64}$')
);
CREATE INDEX IF NOT EXISTS fiscal_documents_expiry_idx ON fiscal_documents(status, expires_at);
CREATE INDEX IF NOT EXISTS fiscal_documents_type_idx ON fiscal_documents(document_type, created_at DESC);

CREATE TABLE IF NOT EXISTS fiscal_events (
  id UUID PRIMARY KEY,
  obligation_id UUID REFERENCES fiscal_obligations(id) ON DELETE SET NULL,
  document_id UUID REFERENCES fiscal_documents(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'prepared', 'submitted', 'payment_recorded', 'payment_verified', 'document_uploaded', 'status_changed', 'note')),
  previous_status TEXT,
  new_status TEXT,
  agency_reference TEXT,
  amount NUMERIC(18,2),
  currency_code CHAR(3) NOT NULL DEFAULT 'USD',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_user_id UUID,
  evidence_document_id UUID REFERENCES fiscal_documents(id) ON DELETE SET NULL,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CHECK (amount IS NULL OR amount >= 0)
);
CREATE INDEX IF NOT EXISTS fiscal_events_obligation_time_idx ON fiscal_events(obligation_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS tenant_audit_events (
  id UUID PRIMARY KEY,
  actor_user_id UUID,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  request_id TEXT,
  outcome TEXT NOT NULL DEFAULT 'success' CHECK (outcome IN ('success', 'denied', 'failure')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS tenant_audit_resource_time_idx ON tenant_audit_events(resource_type, resource_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tenant_audit_actor_time_idx ON tenant_audit_events(actor_user_id, created_at DESC);

COMMIT;

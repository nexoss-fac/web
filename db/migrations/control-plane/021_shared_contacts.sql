-- Directorio universal de terceros. Los campos compartidos contienen solo identidad comercial/fiscal.
-- Notas, saldos, precios, condiciones y movimientos viven en la relación privada de cada empresa.
CREATE TABLE IF NOT EXISTS platform_shared_contacts (
  id UUID PRIMARY KEY,
  document_normalized TEXT,
  document_display VARCHAR(60) NOT NULL DEFAULT '',
  name VARCHAR(180) NOT NULL,
  surname VARCHAR(180) NOT NULL DEFAULT '',
  trade_name VARCHAR(180) NOT NULL DEFAULT '',
  phone VARCHAR(60) NOT NULL DEFAULT '',
  email VARCHAR(254) NOT NULL DEFAULT '',
  fiscal_address TEXT NOT NULL DEFAULT '',
  country_code VARCHAR(3) NOT NULL DEFAULT '',
  created_by_uid VARCHAR(128) NOT NULL,
  updated_by_uid VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Permite varios contactos sin RIF, pero impide duplicar un documento normalizado.
CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_shared_contacts_document
  ON platform_shared_contacts (document_normalized)
  WHERE document_normalized IS NOT NULL AND document_normalized <> '';
CREATE INDEX IF NOT EXISTS idx_platform_shared_contacts_name
  ON platform_shared_contacts (lower(name), lower(surname));
CREATE INDEX IF NOT EXISTS idx_platform_shared_contacts_trade_name
  ON platform_shared_contacts (lower(trade_name));

CREATE TABLE IF NOT EXISTS company_shared_contact_relations (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES platform_companies(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES platform_shared_contacts(id) ON DELETE CASCADE,
  contact_type TEXT NOT NULL CHECK (contact_type IN ('cliente', 'proveedor')),
  private_notes TEXT NOT NULL DEFAULT '',
  created_by_uid VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, contact_id, contact_type)
);

CREATE INDEX IF NOT EXISTS idx_shared_contact_relations_company_type
  ON company_shared_contact_relations (company_id, contact_type, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_shared_contact_relations_contact
  ON company_shared_contact_relations (contact_id);

-- No se migran automáticamente registros históricos: requieren conciliación de duplicados.

CREATE TABLE IF NOT EXISTS master_documents (
  procedure_id TEXT PRIMARY KEY,
  document_code TEXT NOT NULL,
  document_type TEXT NOT NULL,
  sector TEXT NOT NULL,
  document_number INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  revision TEXT NOT NULL,
  elaborator TEXT NOT NULL DEFAULT '',
  elaboration_date TEXT NOT NULL DEFAULT '',
  approver TEXT NOT NULL DEFAULT '',
  approval_date TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  equipment_code TEXT NOT NULL DEFAULT '',
  document_original_location TEXT NOT NULL DEFAULT '',
  document_public_location TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS document_number_sequences (
  document_type TEXT NOT NULL,
  sector TEXT NOT NULL,
  next_number INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (document_type, sector)
);

CREATE INDEX IF NOT EXISTS idx_master_documents_code ON master_documents (document_code);
CREATE INDEX IF NOT EXISTS idx_master_documents_status ON master_documents (status);
CREATE INDEX IF NOT EXISTS idx_master_documents_sector_type ON master_documents (sector, document_type);

ALTER TABLE master_documents ADD COLUMN IF NOT EXISTS document_original_location TEXT NOT NULL DEFAULT '';
ALTER TABLE master_documents ADD COLUMN IF NOT EXISTS document_public_location TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS procedure_configuration (
  configuration_id INTEGER PRIMARY KEY CHECK (configuration_id = 1),
  document_types JSONB NOT NULL,
  sectors JSONB NOT NULL,
  quality_fields JSONB NOT NULL,
  cover JSONB NOT NULL DEFAULT '{"imageData":"","overlayPosition":"center","overlayX":0.5,"overlayY":0.5}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE procedure_configuration ADD COLUMN IF NOT EXISTS cover JSONB NOT NULL DEFAULT '{"imageData":"","overlayPosition":"center","overlayX":0.5,"overlayY":0.5}'::jsonb;

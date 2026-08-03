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

CREATE TABLE IF NOT EXISTS procedure_documents (
  procedure_id TEXT PRIMARY KEY,
  content JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS document_number_sequences (
  document_type TEXT NOT NULL,
  sector TEXT NOT NULL,
  sector_prefix TEXT NOT NULL DEFAULT '',
  next_number INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (document_type, sector, sector_prefix)
);

ALTER TABLE document_number_sequences ADD COLUMN IF NOT EXISTS sector_prefix TEXT NOT NULL DEFAULT '';
ALTER TABLE document_number_sequences DROP CONSTRAINT IF EXISTS document_number_sequences_pkey;
ALTER TABLE document_number_sequences ADD CONSTRAINT document_number_sequences_pkey PRIMARY KEY (document_type, sector, sector_prefix);

CREATE TABLE IF NOT EXISTS procedure_number_reservations (
  procedure_id TEXT NOT NULL,
  document_type TEXT NOT NULL,
  sector TEXT NOT NULL,
  sector_prefix TEXT NOT NULL DEFAULT '',
  document_number INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (procedure_id, document_type, sector, sector_prefix)
);

CREATE INDEX IF NOT EXISTS idx_procedure_number_reservations_lookup
  ON procedure_number_reservations (document_type, sector, sector_prefix, document_number);

CREATE INDEX IF NOT EXISTS idx_master_documents_code ON master_documents (document_code);
CREATE INDEX IF NOT EXISTS idx_master_documents_status ON master_documents (status);
CREATE INDEX IF NOT EXISTS idx_master_documents_sector_type ON master_documents (sector, document_type);
CREATE UNIQUE INDEX IF NOT EXISTS uq_master_documents_type_sector_prefix_number
  ON master_documents (
    document_type,
    sector,
    (COALESCE(substring(split_part(document_code, '_', 2) from '^[A-Z]+'), '')),
    document_number
  )
  WHERE document_number > 0;

ALTER TABLE master_documents ADD COLUMN IF NOT EXISTS document_original_location TEXT NOT NULL DEFAULT '';
ALTER TABLE master_documents ADD COLUMN IF NOT EXISTS document_public_location TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS procedure_configuration (
  configuration_id INTEGER PRIMARY KEY CHECK (configuration_id = 1),
  document_types JSONB NOT NULL,
  sectors JSONB NOT NULL,
  quality_fields JSONB NOT NULL,
  cover JSONB NOT NULL DEFAULT '{"imageData":"","overlayPosition":"center","overlayX":0.5,"overlayY":0.5}'::jsonb,
  nonconformity JSONB NOT NULL DEFAULT '{"origins":[],"sections":[],"maxEvidenceImages":10}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE procedure_configuration ADD COLUMN IF NOT EXISTS cover JSONB NOT NULL DEFAULT '{"imageData":"","overlayPosition":"center","overlayX":0.5,"overlayY":0.5}'::jsonb;
ALTER TABLE procedure_configuration ADD COLUMN IF NOT EXISTS nonconformity JSONB NOT NULL DEFAULT '{"origins":[],"sections":[],"maxEvidenceImages":10}'::jsonb;

CREATE TABLE IF NOT EXISTS app_users (
  user_id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('quality', 'editor', 'manager')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_role_check;
ALTER TABLE app_users ADD CONSTRAINT app_users_role_check CHECK (role IN ('quality', 'editor', 'manager'));

CREATE TABLE IF NOT EXISTS document_audit_log (
  audit_id BIGSERIAL PRIMARY KEY,
  procedure_id TEXT,
  action TEXT NOT NULL,
  actor_username TEXT NOT NULL DEFAULT 'qualidade',
  actor_role TEXT NOT NULL DEFAULT 'quality',
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_audit_procedure ON document_audit_log (procedure_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_audit_created ON document_audit_log (created_at DESC);

CREATE TABLE IF NOT EXISTS nonconformity_documents (
  nonconformity_id TEXT PRIMARY KEY,
  document_code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Aberta',
  content JSONB NOT NULL,
  created_by TEXT NOT NULL DEFAULT 'qualidade',
  updated_by TEXT NOT NULL DEFAULT 'qualidade',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nonconformity_sequences (
  sequence_key TEXT PRIMARY KEY,
  next_number INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_nonconformity_status ON nonconformity_documents (status);
CREATE INDEX IF NOT EXISTS idx_nonconformity_updated ON nonconformity_documents (updated_at DESC);

CREATE TABLE IF NOT EXISTS action_plan_documents (
  plan_id TEXT PRIMARY KEY,
  document_code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Rascunho',
  content JSONB NOT NULL,
  created_by TEXT NOT NULL DEFAULT 'qualidade',
  updated_by TEXT NOT NULL DEFAULT 'qualidade',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS action_plan_sequences (
  sequence_key TEXT PRIMARY KEY,
  next_number INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_action_plan_status ON action_plan_documents (status);
CREATE INDEX IF NOT EXISTS idx_action_plan_updated ON action_plan_documents (updated_at DESC);

CREATE TABLE IF NOT EXISTS metrology_instruments (
  instrument_id TEXT PRIMARY KEY,
  document_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  situation TEXT NOT NULL DEFAULT 'Liberado',
  content JSONB NOT NULL,
  created_by TEXT NOT NULL DEFAULT 'qualidade',
  updated_by TEXT NOT NULL DEFAULT 'qualidade',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS instrument_sequences (
  sequence_key TEXT PRIMARY KEY,
  next_number INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_metrology_instruments_situation ON metrology_instruments (situation);
CREATE INDEX IF NOT EXISTS idx_metrology_instruments_updated ON metrology_instruments (updated_at DESC);

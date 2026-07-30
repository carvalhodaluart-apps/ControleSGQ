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

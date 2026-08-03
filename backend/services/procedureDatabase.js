const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const { Pool } = require("pg");
const { hasProcedureContent, normalizeProcedure } = require("./procedureRules");
const { ensureProcedureConfiguration } = require("./procedureConfiguration");

const SCHEMA_PATH = path.resolve(__dirname, "..", "database", "schema.sql");
const DRAFTS_PATH = path.resolve(__dirname, "..", "dados_procedimentos", "rascunhos");
let pool;

function getPool() {
  if (pool) return pool;
  if (!process.env.DATABASE_URL) {
    const error = new Error("DATABASE_URL não configurada para o PostgreSQL.");
    error.status = 503;
    throw error;
  }
  const useSsl = process.env.DATABASE_SSL === "true" || /neon\.tech|sslmode=require/i.test(process.env.DATABASE_URL);
  pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: useSsl ? { rejectUnauthorized: false } : false });
  return pool;
}

function getDatabasePool() {
  return getPool();
}

function getRevisionData(procedure) {
  const rows = Array.isArray(procedure.revision) ? procedure.revision.slice(1) : [];
  const row = [...rows].reverse().find((item) => String(item?.[0] || "").trim()) || [];
  return {
    revision: String(row[0] || "00"),
    elaborationDate: String(row[1] || ""),
    elaborator: String(row[3] || ""),
    approver: String(row[4] || ""),
  };
}

function metadataFromProcedure(procedure) {
  const revision = getRevisionData(procedure);
  return {
    procedureId: procedure.procedureId,
    documentCode: procedure.documentCode,
    documentType: procedure.qualityInfo?.documentType || "",
    sector: procedure.qualityInfo?.area || "",
    documentNumber: Number(procedure.documentNumber || 0),
    title: procedure.title || "",
    revision: revision.revision,
    elaborator: revision.elaborator,
    elaborationDate: revision.elaborationDate,
    approver: revision.approver,
    approvalDate: procedure.qualityInfo?.approvalDate || "",
    status: procedure.documentStatus || "Em elaboração",
    equipmentCode: procedure.equipmentCode || "",
    documentOriginalLocation: procedure.documentOriginalLocation || "",
    documentPublicLocation: procedure.documentPublicLocation || "",
  };
}

async function upsertMasterDocument(procedure) {
  const normalized = normalizeProcedure(procedure);
  const data = metadataFromProcedure(normalized);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      INSERT INTO master_documents
        (procedure_id, document_code, document_type, sector, document_number, title, revision, elaborator, elaboration_date, approver, approval_date, status, equipment_code, document_original_location, document_public_location)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      ON CONFLICT (procedure_id) DO UPDATE SET
        document_code = EXCLUDED.document_code, document_type = EXCLUDED.document_type,
        sector = EXCLUDED.sector, document_number = EXCLUDED.document_number,
        title = EXCLUDED.title, revision = EXCLUDED.revision, elaborator = EXCLUDED.elaborator,
        elaboration_date = EXCLUDED.elaboration_date, approver = EXCLUDED.approver,
        approval_date = EXCLUDED.approval_date, status = EXCLUDED.status,
        equipment_code = EXCLUDED.equipment_code,
        document_original_location = COALESCE(NULLIF(EXCLUDED.document_original_location, ''), master_documents.document_original_location),
        document_public_location = COALESCE(NULLIF(EXCLUDED.document_public_location, ''), master_documents.document_public_location),
        updated_at = NOW()
    `, Object.values(data));
    if (data.documentNumber > 0) {
      const sectorPrefix = String(normalized.documentCodeMiddle || "").match(/^[A-Z]+/)?.[0] || "";
      await updateSequence(client, data.documentType, data.sector, sectorPrefix, data.documentNumber + 1);
    }
    await client.query("COMMIT");
    return data;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function updateSequence(client, documentType, sector, sectorPrefix, nextNumber) {
  await client.query(`
    INSERT INTO document_number_sequences (document_type, sector, sector_prefix, next_number)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (document_type, sector, sector_prefix) DO UPDATE
    SET next_number = GREATEST(document_number_sequences.next_number, EXCLUDED.next_number)
  `, [documentType, sector, sectorPrefix, nextNumber]);
}

async function resetSequenceFromMasterDocuments(client, documentType, sector, sectorPrefix = "") {
  if (!documentType || !sector) return;
  const result = await client.query(`
    SELECT COALESCE(MAX(document_number) + 1, 1) AS "nextNumber"
    FROM master_documents
    WHERE document_type = $1
      AND sector = $2
      AND document_number > 0
      AND COALESCE(substring(split_part(document_code, '_', 2) from '^[A-Z]+'), '') = $3
  `, [documentType, sector, sectorPrefix || ""]);
  await client.query(`
    INSERT INTO document_number_sequences (document_type, sector, sector_prefix, next_number)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (document_type, sector, sector_prefix) DO UPDATE
    SET next_number = EXCLUDED.next_number
  `, [documentType, sector, sectorPrefix || "", Number(result.rows[0]?.nextNumber || 1)]);
}

async function reserveNextDocumentNumberWithClient(client, documentType, sector, sectorPrefix = "") {
  const result = await client.query(`
      INSERT INTO document_number_sequences (document_type, sector, sector_prefix, next_number)
      VALUES (
        $1,
        $2,
        $3,
        COALESCE((
          SELECT MAX(document_number) + 2
          FROM master_documents
          WHERE document_type = $1
            AND sector = $2
            AND document_number > 0
            AND COALESCE(substring(split_part(document_code, '_', 2) from '^[A-Z]+'), '') = $3
        ), 2)
      )
      ON CONFLICT (document_type, sector, sector_prefix) DO UPDATE
      SET next_number = document_number_sequences.next_number + 1
      RETURNING next_number - 1 AS reserved_number
    `, [documentType, sector, sectorPrefix]);
  return String(result.rows[0].reserved_number).padStart(4, "0");
}

async function reserveNextDocumentNumber(documentType, sector, sectorPrefix = "") {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const reservedNumber = await reserveNextDocumentNumberWithClient(client, documentType, sector, sectorPrefix);
    await client.query("COMMIT");
    return reservedNumber;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function rememberDocumentNumberReservation(procedureId, documentType, sector, sectorPrefix, documentNumber) {
  if (!procedureId || !documentType || !sector || Number(documentNumber) <= 0) return;
  await getPool().query(`
    INSERT INTO procedure_number_reservations
      (procedure_id, document_type, sector, sector_prefix, document_number)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (procedure_id, document_type, sector, sector_prefix) DO NOTHING
  `, [procedureId, documentType, sector, sectorPrefix || "", Number(documentNumber)]);
}

async function reserveDocumentNumberForProcedure(procedureId, documentType, sector, sectorPrefix = "") {
  if (!procedureId) throw new Error("Identificador do procedimento obrigatorio.");
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query(`
      SELECT document_number AS "documentNumber"
      FROM procedure_number_reservations
      WHERE procedure_id = $1 AND document_type = $2 AND sector = $3 AND sector_prefix = $4
      FOR UPDATE
    `, [procedureId, documentType, sector, sectorPrefix || ""]);
    if (existing.rows.length) {
      await client.query("COMMIT");
      return String(existing.rows[0].documentNumber).padStart(4, "0");
    }
    const reservedNumber = await reserveNextDocumentNumberWithClient(client, documentType, sector, sectorPrefix);
    await client.query(`
      INSERT INTO procedure_number_reservations
        (procedure_id, document_type, sector, sector_prefix, document_number)
      VALUES ($1, $2, $3, $4, $5)
    `, [procedureId, documentType, sector, sectorPrefix || "", Number(reservedNumber)]);
    await client.query("COMMIT");
    return reservedNumber;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function getMasterDocument(procedureId) {
  const result = await getPool().query(`
    SELECT document_code AS "documentCode", document_type AS "documentType", sector, document_number AS "documentNumber"
    FROM master_documents
    WHERE procedure_id = $1
  `, [procedureId]);
  return result.rows[0] || null;
}

async function listMasterDocuments() {
  const result = await getPool().query(`
    SELECT procedure_id AS "procedureId", document_code AS "documentCode", title,
      revision, elaborator, elaboration_date AS "elaborationDate", approver,
      approval_date AS "approvalDate", status, document_type AS "documentType", sector,
      equipment_code AS "equipmentCode", document_original_location AS "documentOriginalLocation",
      document_public_location AS "documentPublicLocation"
    FROM master_documents
    ORDER BY document_code, title
  `);
  return result.rows;
}

async function listDraftDocuments() {
  const result = await getPool().query(`
    SELECT procedure_id AS "procedureId", document_code AS "documentCode", title,
      document_number AS "documentNumber", document_type AS "documentType", sector,
      equipment_code AS "equipmentCode", updated_at AS "updatedAt"
    FROM master_documents
    WHERE status = 'Em elaboração'
    ORDER BY updated_at DESC, document_code, title
  `);
  return result.rows;
}

async function updateMasterDocumentLocations(procedureId, locations) {
  const result = await getPool().query(`
    UPDATE master_documents
    SET document_original_location = $2, document_public_location = $3, updated_at = NOW()
    WHERE procedure_id = $1
    RETURNING procedure_id AS "procedureId", document_original_location AS "documentOriginalLocation",
      document_public_location AS "documentPublicLocation"
  `, [procedureId, locations.documentOriginalLocation, locations.documentPublicLocation]);
  if (!result.rows.length) {
    const error = new Error("Documento não encontrado.");
    error.status = 404;
    throw error;
  }
  return result.rows[0];
}

async function deleteMasterDocument(procedureId) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const affected = [];
    const master = await client.query(`
      DELETE FROM master_documents
      WHERE procedure_id = $1
      RETURNING document_type AS "documentType", sector,
        COALESCE(substring(split_part(document_code, '_', 2) from '^[A-Z]+'), '') AS "sectorPrefix"
    `, [procedureId]);
    affected.push(...master.rows);
    const reservations = await client.query(`
      DELETE FROM procedure_number_reservations
      WHERE procedure_id = $1
      RETURNING document_type AS "documentType", sector, sector_prefix AS "sectorPrefix"
    `, [procedureId]);
    affected.push(...reservations.rows);
    for (const item of new Map(affected.map((row) => [`${row.documentType}|${row.sector}|${row.sectorPrefix || ""}`, row])).values()) {
      await resetSequenceFromMasterDocuments(client, item.documentType, item.sector, item.sectorPrefix);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function migrateDrafts() {
  if (!fs.existsSync(DRAFTS_PATH)) return;
  const files = (await fsp.readdir(DRAFTS_PATH)).filter((file) => file.endsWith(".json"));
  for (const file of files) {
    try {
      const procedure = JSON.parse(await fsp.readFile(path.join(DRAFTS_PATH, file), "utf8"));
      if (procedure.procedureId) {
        const normalized = normalizeProcedure(procedure);
        await getPool().query(`
          INSERT INTO procedure_documents (procedure_id, content)
          VALUES ($1, $2::jsonb)
          ON CONFLICT (procedure_id) DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()
        `, [normalized.procedureId, JSON.stringify(normalized)]);
        if (hasProcedureContent(normalized)) await upsertMasterDocument(normalized);
        else await deleteMasterDocument(normalized.procedureId);
      }
    } catch (error) {
      console.warn(`Não foi possível migrar ${file} para a lista mestra: ${error.message}`);
    }
  }
}

async function synchronizeDocumentNumberSequences() {
  await getPool().query(`
    DELETE FROM procedure_number_reservations AS reservations
    WHERE NOT EXISTS (
      SELECT 1 FROM master_documents AS documents
      WHERE documents.procedure_id = reservations.procedure_id
    )
  `);
  await getPool().query(`
    UPDATE master_documents
    SET document_code = split_part(document_code, '_', 1) || '_' ||
      COALESCE(substring(split_part(document_code, '_', 2) from '^[A-Z]+'), '') ||
      LPAD(document_number::text, 4, '0') || '_' ||
      COALESCE(split_part(document_code, '_', 3), '00')
    WHERE document_number > 0
      AND array_length(string_to_array(document_code, '_'), 1) = 3
  `);
  await getPool().query(`
    UPDATE document_number_sequences AS sequences
    SET next_number = COALESCE((
      SELECT MAX(document_number) + 1
      FROM master_documents
      WHERE document_type = sequences.document_type AND sector = sequences.sector
        AND COALESCE(substring(split_part(document_code, '_', 2) from '^[A-Z]+'), '') = sequences.sector_prefix
    ), 1)
  `);
  await getPool().query(`
    INSERT INTO document_number_sequences (document_type, sector, sector_prefix, next_number)
    SELECT document_type, sector,
      COALESCE(substring(split_part(document_code, '_', 2) from '^[A-Z]+'), ''),
      MAX(document_number) + 1
    FROM master_documents
    WHERE document_number > 0 AND document_code <> ''
    GROUP BY document_type, sector, COALESCE(substring(split_part(document_code, '_', 2) from '^[A-Z]+'), '')
    ON CONFLICT (document_type, sector, sector_prefix) DO UPDATE SET next_number = EXCLUDED.next_number
  `);
}

async function initDatabase() {
  const schema = await fsp.readFile(SCHEMA_PATH, "utf8");
  await getPool().query(schema);
  await ensureProcedureConfiguration();
  await migrateDrafts();
  await synchronizeDocumentNumberSequences();
}

function databaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

module.exports = { databaseConfigured, deleteMasterDocument, getDatabasePool, getMasterDocument, initDatabase, listDraftDocuments, listMasterDocuments, rememberDocumentNumberReservation, reserveDocumentNumberForProcedure, reserveNextDocumentNumber, updateMasterDocumentLocations, upsertMasterDocument };

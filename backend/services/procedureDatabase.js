const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const { Pool } = require("pg");
const { normalizeProcedure } = require("./procedureRules");

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
  };
}

async function upsertMasterDocument(procedure) {
  const data = metadataFromProcedure(normalizeProcedure(procedure));
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      INSERT INTO master_documents
        (procedure_id, document_code, document_type, sector, document_number, title, revision, elaborator, elaboration_date, approver, approval_date, status, equipment_code)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT (procedure_id) DO UPDATE SET
        document_code = EXCLUDED.document_code, document_type = EXCLUDED.document_type,
        sector = EXCLUDED.sector, document_number = EXCLUDED.document_number,
        title = EXCLUDED.title, revision = EXCLUDED.revision, elaborator = EXCLUDED.elaborator,
        elaboration_date = EXCLUDED.elaboration_date, approver = EXCLUDED.approver,
        approval_date = EXCLUDED.approval_date, status = EXCLUDED.status,
        equipment_code = EXCLUDED.equipment_code, updated_at = NOW()
    `, Object.values(data));
    if (data.documentNumber > 0) await updateSequence(client, data.documentType, data.sector, data.documentNumber + 1);
    await client.query("COMMIT");
    return data;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function updateSequence(client, documentType, sector, nextNumber) {
  await client.query(`
    INSERT INTO document_number_sequences (document_type, sector, next_number)
    VALUES ($1, $2, $3)
    ON CONFLICT (document_type, sector) DO UPDATE
    SET next_number = GREATEST(document_number_sequences.next_number, EXCLUDED.next_number)
  `, [documentType, sector, nextNumber]);
}

async function reserveNextDocumentNumber(documentType, sector) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(`
      INSERT INTO document_number_sequences (document_type, sector, next_number)
      VALUES ($1, $2, 2)
      ON CONFLICT (document_type, sector) DO UPDATE
      SET next_number = document_number_sequences.next_number + 1
      RETURNING next_number - 1 AS allocated_number
    `, [documentType, sector]);
    await client.query("COMMIT");
    return String(result.rows[0].allocated_number).padStart(4, "0");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function listMasterDocuments() {
  const result = await getPool().query(`
    SELECT procedure_id AS "procedureId", document_code AS "documentCode", title,
      revision, elaborator, elaboration_date AS "elaborationDate", approver,
      approval_date AS "approvalDate", status, document_type AS "documentType", sector,
      equipment_code AS "equipmentCode"
    FROM master_documents
    ORDER BY document_code, title
  `);
  return result.rows;
}

async function deleteMasterDocument(procedureId) {
  await getPool().query("DELETE FROM master_documents WHERE procedure_id = $1", [procedureId]);
}

async function migrateDrafts() {
  if (!fs.existsSync(DRAFTS_PATH)) return;
  const files = (await fsp.readdir(DRAFTS_PATH)).filter((file) => file.endsWith(".json"));
  for (const file of files) {
    try {
      const procedure = JSON.parse(await fsp.readFile(path.join(DRAFTS_PATH, file), "utf8"));
      if (procedure.procedureId) await upsertMasterDocument(procedure);
    } catch (error) {
      console.warn(`Não foi possível migrar ${file} para a lista mestra: ${error.message}`);
    }
  }
}

async function initDatabase() {
  const schema = await fsp.readFile(SCHEMA_PATH, "utf8");
  await getPool().query(schema);
  await migrateDrafts();
}

function databaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

module.exports = { databaseConfigured, deleteMasterDocument, initDatabase, listMasterDocuments, reserveNextDocumentNumber, upsertMasterDocument };

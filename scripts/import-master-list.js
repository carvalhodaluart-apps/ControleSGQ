const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://controle_sgq:controle_sgq_dev@127.0.0.1:5432/controle_sgq";
const SCHEMA_PATH = path.resolve(__dirname, "..", "backend", "database", "schema.sql");
const DATA_PATH = path.resolve(__dirname, "..", "backend", "database", "master-list-import.json");

function getRows() {
  const rows = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  if (!Array.isArray(rows) || !rows.length) throw new Error("Nenhum registro de lista mestra encontrado.");
  return rows;
}

async function importMasterList() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();
  const rows = getRows();
  let imported = 0;
  try {
    await client.query(fs.readFileSync(SCHEMA_PATH, "utf8"));
    await client.query("BEGIN");
    for (const row of rows) {
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
      `, [
        row.procedureId, row.documentCode, row.documentType, row.sector, row.documentNumber,
        row.title, row.revision, row.elaborator, row.elaborationDate, row.approver,
        row.approvalDate, row.status, row.equipmentCode, row.documentOriginalLocation, row.documentPublicLocation,
      ]);
      if (row.documentNumber > 0 && row.documentType && row.sector) {
        await client.query(`
          INSERT INTO document_number_sequences (document_type, sector, next_number)
          VALUES ($1, $2, $3)
          ON CONFLICT (document_type, sector) DO UPDATE
          SET next_number = GREATEST(document_number_sequences.next_number, EXCLUDED.next_number)
        `, [row.documentType, row.sector, Number(row.documentNumber) + 1]);
      }
      imported += 1;
    }
    await client.query("COMMIT");
    console.log(`Lista mestra importada: ${imported} registros.`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

importMasterList().catch((error) => {
  console.error(`Falha ao importar a lista mestra: ${error.message}`);
  process.exitCode = 1;
});

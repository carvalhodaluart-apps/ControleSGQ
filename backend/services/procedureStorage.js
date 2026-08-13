const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const { getDatabasePool } = require("./procedureDatabase");
const { getLocalDirectories, persistEmbeddedAssets, persistProcedureVersion, safeName, writeAtomic } = require("./localFiles");
const sharedStorage = require("./sharedProcedureStorage");

const STORAGE_ROOT = process.env.APP_FILES_DIR
  ? getLocalDirectories().drafts
  : path.resolve(__dirname, "..", "dados_procedimentos", "rascunhos");

function getProcedurePath(procedureId) {
  return path.join(STORAGE_ROOT, `${safeName(procedureId)}.json`);
}

function toIso(value) {
  const rawValue = typeof value === "string" ? value.trim() : value;
  const sqliteTimestamp = typeof rawValue === "string"
    && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(rawValue);
  const date = value instanceof Date
    ? value
    : new Date(sqliteTimestamp ? `${rawValue.replace(" ", "T")}Z` : rawValue);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

async function ensureStorage() {
  await fsp.mkdir(STORAGE_ROOT, { recursive: true });
}

async function saveProcedure(procedure, options = {}) {
  if (sharedStorage.isConfigured()) {
    const saved = await sharedStorage.saveProcedure(procedure, options.expectedUpdatedAt ?? procedure.updatedAt ?? null);
    Object.assign(procedure, saved);
    return procedure;
  }
  await ensureStorage();
  const content = { ...procedure };
  const isLocalDatabase = String(process.env.DATABASE_DRIVER || "").toLowerCase() === "sqlite";
  const expectedUpdatedAt = options.expectedUpdatedAt ?? content.updatedAt ?? null;
  const allowVersionMismatch = options.allowVersionMismatch === true || isLocalDatabase;
  const versionPredicate = isLocalDatabase
    ? "strftime('%Y-%m-%dT%H:%M:%fZ', procedure_documents.updated_at) = strftime('%Y-%m-%dT%H:%M:%fZ', $4)"
    : "date_trunc('milliseconds', procedure_documents.updated_at) = $4::timestamptz";
  const updatedAtExpression = isLocalDatabase ? "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')" : "NOW()";
  delete content.updatedAt;
  const result = await getDatabasePool().query(`
    INSERT INTO procedure_documents (procedure_id, content)
    VALUES ($1, $2::jsonb)
    ON CONFLICT (procedure_id) DO UPDATE SET content = EXCLUDED.content, updated_at = ${updatedAtExpression}
      WHERE $3::boolean OR $4::timestamptz IS NULL OR ${versionPredicate}
    RETURNING updated_at AS "updatedAt"
  `, [procedure.procedureId, JSON.stringify(content), allowVersionMismatch, expectedUpdatedAt]);
  if (!result.rows.length) {
    const error = new Error("O procedimento foi alterado em outra janela. Recarregue antes de salvar.");
    error.status = 409;
    throw error;
  }
  procedure.updatedAt = toIso(result.rows[0].updatedAt);
  const filePath = getProcedurePath(procedure.procedureId);
  try {
    await writeAtomic(filePath, `${JSON.stringify(procedure, null, 2)}\n`);
    await persistEmbeddedAssets(procedure);
    await persistProcedureVersion(procedure);
  } catch (error) {
    console.warn(`N\u00e3o foi poss\u00edvel atualizar o espelho local do procedimento: ${error.message}`);
  }
  return procedure;
}

async function loadProcedure(procedureId) {
  if (sharedStorage.isConfigured()) return sharedStorage.loadProcedure(procedureId);
  const result = await getDatabasePool().query("SELECT content, updated_at AS \"updatedAt\" FROM procedure_documents WHERE procedure_id = $1", [String(procedureId || "")]);
  if (result.rows[0]?.content) return { ...result.rows[0].content, updatedAt: toIso(result.rows[0].updatedAt) };
  const filePath = getProcedurePath(procedureId);
  try {
    const content = await fsp.readFile(filePath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function deleteProcedure(procedureId) {
  if (sharedStorage.isConfigured()) return sharedStorage.deleteProcedure(procedureId);
  await getDatabasePool().query("DELETE FROM procedure_documents WHERE procedure_id = $1", [String(procedureId || "")]);
  try {
    await fsp.unlink(getProcedurePath(procedureId));
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    console.warn(`N\u00e3o foi poss\u00edvel remover o espelho local do procedimento: ${error.message}`);
    return false;
  }
}

function storageExists() {
  return sharedStorage.isConfigured() ? fs.existsSync(sharedStorage.getSharedRoot()) : fs.existsSync(STORAGE_ROOT);
}

module.exports = { deleteProcedure, loadProcedure, saveProcedure, storageExists };

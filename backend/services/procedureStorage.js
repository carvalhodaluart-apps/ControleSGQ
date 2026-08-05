const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const { getDatabasePool } = require("./procedureDatabase");

const STORAGE_ROOT = path.resolve(__dirname, "..", "dados_procedimentos", "rascunhos");

function safeName(value) {
  return String(value || "procedimento")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "procedimento";
}

function getProcedurePath(procedureId) {
  return path.join(STORAGE_ROOT, `${safeName(procedureId)}.json`);
}

async function ensureStorage() {
  await fsp.mkdir(STORAGE_ROOT, { recursive: true });
}

async function saveProcedure(procedure) {
  await ensureStorage();
  const content = { ...procedure };
  const expectedUpdatedAt = content.updatedAt || null;
  delete content.updatedAt;
  const result = await getDatabasePool().query(`
    INSERT INTO procedure_documents (procedure_id, content)
    VALUES ($1, $2::jsonb)
    ON CONFLICT (procedure_id) DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()
      WHERE $3::timestamptz IS NULL OR date_trunc('milliseconds', procedure_documents.updated_at) = $3::timestamptz
    RETURNING updated_at AS "updatedAt"
  `, [procedure.procedureId, JSON.stringify(content), expectedUpdatedAt]);
  if (!result.rows.length) {
    const error = new Error("O procedimento foi alterado em outra janela. Recarregue antes de salvar.");
    error.status = 409;
    throw error;
  }
  procedure.updatedAt = result.rows[0].updatedAt.toISOString();
  const filePath = getProcedurePath(procedure.procedureId);
  const temporaryPath = `${filePath}.tmp`;
  try {
    await fsp.writeFile(temporaryPath, `${JSON.stringify(procedure, null, 2)}\n`, "utf8");
    await fsp.rename(temporaryPath, filePath);
  } catch (error) {
    console.warn(`N\u00e3o foi poss\u00edvel atualizar o espelho local do procedimento: ${error.message}`);
  }
  return procedure;
}

async function loadProcedure(procedureId) {
  const result = await getDatabasePool().query("SELECT content, updated_at AS \"updatedAt\" FROM procedure_documents WHERE procedure_id = $1", [String(procedureId || "")]);
  if (result.rows[0]?.content) return { ...result.rows[0].content, updatedAt: result.rows[0].updatedAt.toISOString() };
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
  return fs.existsSync(STORAGE_ROOT);
}

module.exports = { deleteProcedure, loadProcedure, saveProcedure, storageExists };

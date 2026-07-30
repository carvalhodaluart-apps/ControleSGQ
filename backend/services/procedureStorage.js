const fs = require("fs");
const fsp = fs.promises;
const path = require("path");

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
  const filePath = getProcedurePath(procedure.procedureId);
  const temporaryPath = `${filePath}.tmp`;
  await fsp.writeFile(temporaryPath, `${JSON.stringify(procedure, null, 2)}\n`, "utf8");
  await fsp.rename(temporaryPath, filePath);
  return procedure;
}

async function loadProcedure(procedureId) {
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
  try {
    await fsp.unlink(getProcedurePath(procedureId));
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function storageExists() {
  return fs.existsSync(STORAGE_ROOT);
}

module.exports = { deleteProcedure, loadProcedure, saveProcedure, storageExists };

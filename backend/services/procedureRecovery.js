const fs = require("fs");
const path = require("path");
const { getLocalDirectories, safeName, writeAtomic } = require("./localFiles");
const { packEmbeddedAssets, unpackEmbeddedAssets } = require("./procedurePayloadAssets");

function isLocalMode() {
  return String(process.env.DATABASE_DRIVER || "").toLowerCase() === "sqlite";
}

function recoveryPath(procedureId) {
  return path.join(getLocalDirectories().recovery, `${safeName(procedureId)}.json`);
}

async function saveProcedureRecovery(procedure) {
  if (!isLocalMode() || !procedure?.procedureId) return { saved: false };
  const snapshot = { procedureId: procedure.procedureId, savedAt: new Date().toISOString(), procedure: packEmbeddedAssets(procedure) };
  const filePath = recoveryPath(procedure.procedureId);
  await writeAtomic(filePath, `${JSON.stringify(snapshot, null, 2)}\n`);
  return { saved: true, savedAt: snapshot.savedAt };
}

async function loadProcedureRecovery(procedureId) {
  if (!isLocalMode() || !procedureId) return null;
  try {
    const snapshot = JSON.parse(await fs.promises.readFile(recoveryPath(procedureId), "utf8"));
    if (snapshot?.procedure) snapshot.procedure = unpackEmbeddedAssets(snapshot.procedure);
    return snapshot;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function deleteProcedureRecovery(procedureId) {
  if (!isLocalMode() || !procedureId) return false;
  try {
    await fs.promises.unlink(recoveryPath(procedureId));
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

module.exports = { deleteProcedureRecovery, loadProcedureRecovery, saveProcedureRecovery };

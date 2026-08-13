let sharedProcedureLockToken = "";
let sharedLockHeartbeat = null;

function getProcedureLockHeaders() {
  return sharedProcedureLockToken ? { "X-Procedure-Lock": sharedProcedureLockToken } : {};
}

async function acquireProcedureEditingLock() {
  if (!editMode || !activeProcedure?.procedureId) return;
  const result = await apiRequest("/api/procedures/lock", { method: "POST", body: JSON.stringify({ procedureId: activeProcedure.procedureId }) });
  if (!result.configured || !result.acquired) return;
  sharedProcedureLockToken = result.lockToken || "";
  clearInterval(sharedLockHeartbeat);
  sharedLockHeartbeat = setInterval(() => {
    if (!sharedProcedureLockToken || !activeProcedure?.procedureId) return;
    apiRequest("/api/procedures/lock/heartbeat", {
      method: "POST",
      headers: getProcedureLockHeaders(),
      body: JSON.stringify({ procedureId: activeProcedure.procedureId }),
    }).catch((error) => updateSaveState("error", error.message || "Sessão de edição expirada"));
  }, 30000);
}

async function releaseProcedureEditingLock() {
  if (!sharedProcedureLockToken || !activeProcedure?.procedureId) return;
  const token = sharedProcedureLockToken;
  sharedProcedureLockToken = "";
  clearInterval(sharedLockHeartbeat);
  await fetch(`/api/procedures/lock?id=${encodeURIComponent(activeProcedure.procedureId)}`, {
    method: "DELETE",
    keepalive: true,
    headers: { Authorization: `Bearer ${qualityToken}`, "X-Procedure-Lock": token },
  }).catch(() => {});
}

window.addEventListener("pagehide", () => { releaseProcedureEditingLock(); });

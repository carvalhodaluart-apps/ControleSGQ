(() => {
  const DATABASE_NAME = "controle-sgq-recovery";
  const STORE_NAME = "snapshots";
  let saveTimer = null;
  let recoveryCheckStarted = false;
  const RECOVERY_IDLE_DELAY = 7000;
  const SMALL_RECOVERY_LIMIT = 1500000;

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Nao foi possivel abrir a recuperacao local."));
    });
  }

  async function storeGet(key) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async function storeSet(key, value) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(value, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async function storeDelete(key) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  function snapshotKey(procedure) { return String(procedure?.procedureId || ""); }
  function snapshotProcedure(procedure) { return typeof createProcedureSaveSnapshot === "function" ? createProcedureSaveSnapshot(procedure) : cloneData(procedure); }

  async function saveSnapshot(procedure) {
    const procedureId = snapshotKey(procedure);
    if (!procedureId || procedure?.documentStatus === "Publicado") return;
    const snapshot = { procedureId, savedAt: new Date().toISOString(), procedure: window.ProcedurePayloadAssets.packProcedure(snapshotProcedure(procedure)) };
    const serialized = JSON.stringify(snapshot);
    try {
      if (serialized.length <= SMALL_RECOVERY_LIMIT) localStorage.setItem(`controle-sgq-recovery:${procedureId}`, serialized);
      else localStorage.removeItem(`controle-sgq-recovery:${procedureId}`);
    } catch (_error) { /* IndexedDB remains the primary local fallback. */ }
    await storeSet(procedureId, snapshot);
    if (!qualityToken) return;
    await fetch("/api/procedures/recovery", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${qualityToken}` }, body: JSON.stringify({ procedure: snapshot.procedure }) }).catch(() => {});
  }

  function schedule(procedure) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveSnapshot(procedure).catch(() => {}), RECOVERY_IDLE_DELAY);
  }

  async function clear(procedure) {
    const procedureId = snapshotKey(procedure);
    if (!procedureId) return;
    localStorage.removeItem(`controle-sgq-recovery:${procedureId}`);
    await storeDelete(procedureId).catch(() => {});
    if (qualityToken) await fetch(`/api/procedures/recovery?id=${encodeURIComponent(procedureId)}`, { method: "DELETE", headers: { Authorization: `Bearer ${qualityToken}` } }).catch(() => {});
  }

  async function getRemote(procedureId) {
    if (!qualityToken) return null;
    try {
      const response = await fetch(`/api/procedures/recovery?id=${encodeURIComponent(procedureId)}`, { headers: { Authorization: `Bearer ${qualityToken}` }, cache: "no-store" });
      return response.ok ? (await response.json()).recovery || null : null;
    } catch (_error) { return null; }
  }

  async function checkForRecovery() {
    if (recoveryCheckStarted || !activeProcedure?.procedureId) return;
    recoveryCheckStarted = true;
    const procedureId = snapshotKey(activeProcedure);
    let browserLocal = null;
    try { browserLocal = JSON.parse(localStorage.getItem(`controle-sgq-recovery:${procedureId}`) || "null"); } catch (_error) { browserLocal = null; }
    const [local, remote] = await Promise.all([storeGet(procedureId).catch(() => null), getRemote(procedureId)]);
    const recovery = [browserLocal, local, remote].filter(Boolean).sort((first, second) => String(second.savedAt || "").localeCompare(String(first.savedAt || "")))[0];
    if (!recovery?.procedure) return;
    recovery.procedure = window.ProcedurePayloadAssets.unpackProcedure(recovery.procedure);
    if (JSON.stringify(recovery.procedure) === JSON.stringify(activeProcedure)) return;
    const choice = await showConfirmDialog({
      title: "Foi encontrada uma edi\u00e7\u00e3o n\u00e3o salva",
      message: `Existe uma c\u00f3pia de recupera\u00e7\u00e3o criada em ${new Date(recovery.savedAt).toLocaleString("pt-BR")}. Ela pode conter altera\u00e7\u00f5es mais recentes do que a \u00faltima vers\u00e3o salva. Escolha qual vers\u00e3o deseja abrir:`,
      confirmLabel: "Abrir c\u00f3pia recuperada",
      alternativeLabel: "Excluir c\u00f3pia",
      cancelLabel: "Abrir vers\u00e3o salva",
      cancelResult: "saved",
      variant: "primary",
    });
    if (choice === true) {
      activeProcedure = recovery.procedure;
      normalizeProcedure(activeProcedure);
      renderProcedure(activeProcedure);
      markProcedureChanged();
      await saveProcedure();
    } else if (choice === "alternative" || choice === "saved") await clear(activeProcedure);
  }

  window.localProcedureRecovery = { schedule, markDurable: clear, discard: clear, checkForRecovery };
  window.addEventListener("pagehide", () => {
    if (!activeProcedure?.procedureId || activeProcedure?.documentStatus === "Publicado") return;
    const snapshot = { procedureId: activeProcedure.procedureId, savedAt: new Date().toISOString(), procedure: window.ProcedurePayloadAssets.packProcedure(snapshotProcedure(activeProcedure)) };
    try {
      const serialized = JSON.stringify(snapshot);
      if (serialized.length <= SMALL_RECOVERY_LIMIT) localStorage.setItem(`controle-sgq-recovery:${snapshot.procedureId}`, serialized);
      else localStorage.removeItem(`controle-sgq-recovery:${snapshot.procedureId}`);
    } catch (_error) { /* IndexedDB is not available during pagehide in every browser. */ }
    if (!qualityToken) return;
    fetch("/api/procedures/recovery", {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${qualityToken}` },
      body: JSON.stringify({ procedure: snapshot.procedure }),
    }).catch(() => {});
  });
})();

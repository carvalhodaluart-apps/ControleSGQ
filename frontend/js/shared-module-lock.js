(function initSharedModuleLock() {
  const tokenKey = "procedure-quality-token";
  let moduleName = "";
  let recordId = "";
  let token = "";
  let heartbeatTimer = null;

  function endpoint() {
    return moduleName === "nao-conformidades" ? "nonconformities" : moduleName === "planos-acao" ? "action-plans" : "instruments";
  }

  async function request(path, options = {}) {
    const auth = sessionStorage.getItem(tokenKey) || "";
    const response = await fetch(`/api/${endpoint()}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${auth}` } : {}), ...(options.headers || {}) },
      keepalive: Boolean(options.keepalive),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(data.error || "Nao foi possivel reservar este registro."); error.status = response.status; throw error; }
    return data;
  }

  function clearHeartbeat() {
    if (heartbeatTimer) window.clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  async function release() {
    clearHeartbeat();
    if (!moduleName || !recordId || !token) return;
    const currentModule = moduleName;
    const currentId = recordId;
    const currentToken = token;
    moduleName = ""; recordId = ""; token = "";
    try {
      const auth = sessionStorage.getItem(tokenKey) || "";
      await fetch(`/api/${currentModule === "nao-conformidades" ? "nonconformities" : currentModule === "planos-acao" ? "action-plans" : "instruments"}/${encodeURIComponent(currentId)}/lock`, {
        method: "DELETE", keepalive: true,
        headers: { Authorization: `Bearer ${auth}`, "X-Module-Lock": currentToken },
      });
    } catch (_error) { /* A expiracao natural do bloqueio cobre quedas inesperadas. */ }
  }

  async function acquire(nextModule, nextId) {
    await release();
    if (!nextModule || !nextId) return { configured: false, acquired: false };
    const data = await request(`/${encodeURIComponent(nextId)}/lock`, { method: "POST" });
    moduleName = nextModule;
    recordId = String(nextId);
    token = data.lockToken || "";
    heartbeatTimer = window.setInterval(async () => {
      if (!moduleName || !recordId || !token) return;
      try { await request(`/${encodeURIComponent(recordId)}/lock/heartbeat`, { method: "POST", headers: { "X-Module-Lock": token } }); }
      catch (_error) { clearHeartbeat(); }
    }, 30_000);
    return data;
  }

  function headers() { return token ? { "X-Module-Lock": token } : {}; }

  window.SharedModuleLock = { acquire, headers, release };
  window.addEventListener("pagehide", () => { release(); });
})();

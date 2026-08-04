(function () {
  const DB_NAME = "controle-sgq-secure-folder";
  const STORE_NAME = "handles";
  const HANDLE_KEY = "procedure-json-folder";

  function isSupported() {
    return typeof window.showDirectoryPicker === "function" && typeof window.indexedDB !== "undefined";
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Nao foi possivel abrir as permissoes locais."));
    });
  }

  async function storeGet(key) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error("Nao foi possivel ler a pasta segura."));
    });
  }

  async function storeSet(key, value) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(value, key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error("Nao foi possivel salvar a pasta segura."));
    });
  }

  async function storeDelete(key) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error || new Error("Nao foi possivel remover a pasta segura."));
    });
  }

  function safeName(value) {
    return String(value || "procedimento")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "procedimento";
  }

  function getProcedureFileName(procedureOrId) {
    if (typeof procedureOrId === "string") return `${safeName(procedureOrId)}.json`;
    const id = safeName(procedureOrId?.procedureId || procedureOrId?.documentCode || "procedimento");
    const label = safeName(procedureOrId?.documentCode || procedureOrId?.equipmentCode || "procedimento");
    return label && label !== id ? `${label}__${id}.json` : `${id}.json`;
  }

  async function getDirectoryHandle() {
    if (!isSupported()) return null;
    return storeGet(HANDLE_KEY);
  }

  async function requestPermission(handle, mode = "readwrite") {
    if (!handle) return "denied";
    const options = { mode };
    if (await handle.queryPermission(options) === "granted") return "granted";
    return handle.requestPermission(options);
  }

  async function selectFolder() {
    if (!isSupported()) throw new Error("Este navegador nao permite selecionar uma pasta fixa.");
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    if (await requestPermission(handle, "readwrite") !== "granted") throw new Error("Permissao de escrita negada.");
    await storeSet(HANDLE_KEY, handle);
    return getStatus();
  }

  async function getStatus() {
    if (!isSupported()) return { supported: false, configured: false, permission: "unsupported", name: "" };
    const handle = await getDirectoryHandle();
    if (!handle) return { supported: true, configured: false, permission: "missing", name: "" };
    return {
      supported: true,
      configured: true,
      permission: await handle.queryPermission({ mode: "readwrite" }),
      name: handle.name || "Pasta selecionada",
    };
  }

  async function testAccess() {
    const handle = await getDirectoryHandle();
    if (!handle) throw new Error("Nenhuma pasta segura configurada.");
    if (await requestPermission(handle, "readwrite") !== "granted") throw new Error("Permissao de escrita negada.");
    const testName = ".controle-sgq-teste.txt";
    const file = await handle.getFileHandle(testName, { create: true });
    const writable = await file.createWritable();
    await writable.write(`Teste de acesso ${new Date().toISOString()}\n`);
    await writable.close();
    await handle.removeEntry(testName).catch(() => {});
    return getStatus();
  }

  async function forgetFolder() {
    await storeDelete(HANDLE_KEY);
    return getStatus();
  }

  async function writeProcedureJson(procedure) {
    const handle = await getDirectoryHandle();
    if (!handle) return { saved: false, reason: "missing-folder" };
    if (await requestPermission(handle, "readwrite") !== "granted") return { saved: false, reason: "permission-denied" };
    const fileName = getProcedureFileName(procedure);
    const file = await handle.getFileHandle(fileName, { create: true });
    const writable = await file.createWritable();
    await writable.write(`${JSON.stringify(procedure, null, 2)}\n`);
    await writable.close();
    return { saved: true, fileName, folderName: handle.name || "" };
  }

  async function readProcedureJson(procedureId) {
    const handle = await getDirectoryHandle();
    if (!handle) return { found: false, reason: "missing-folder" };
    if (await requestPermission(handle, "readwrite") !== "granted") return { found: false, reason: "permission-denied" };
    const safeId = safeName(procedureId);
    try {
      const file = await handle.getFileHandle(getProcedureFileName(procedureId));
      return { found: true, procedure: JSON.parse(await (await file.getFile()).text()) };
    } catch (error) {
      if (error.name !== "NotFoundError") throw error;
    }
    for await (const entry of handle.values()) {
      const name = String(entry.name || "").toLowerCase();
      if (entry.kind !== "file" || (!name.endsWith(`${safeId}.json`) && !name.endsWith(`__${safeId}.json`))) continue;
      const procedure = JSON.parse(await (await entry.getFile()).text());
      if (safeName(procedure?.procedureId) === safeId) return { found: true, procedure };
    }
    return { found: false, reason: "not-found" };
  }

  window.secureProcedureFolder = {
    isSupported,
    selectFolder,
    getStatus,
    testAccess,
    forgetFolder,
    writeProcedureJson,
    readProcedureJson,
    getProcedureFileName,
  };
}());

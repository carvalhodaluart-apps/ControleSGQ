const crypto = require("crypto");
const fs = require("fs");
const fsp = fs.promises;
const os = require("os");
const path = require("path");
const { safeName, writeAtomic } = require("./localFiles");

const LOCK_TTL_MS = 90 * 1000;

const MODULE_DEFINITIONS = {
  procedimentos: { directory: "procedimentos", history: "procedimentos", idField: "procedureId" },
  "nao-conformidades": { directory: "nao-conformidades", history: "nao-conformidades", idField: "nonconformityId" },
  "planos-acao": { directory: "planos-acao", history: "planos-acao", idField: "planId" },
  instrumentos: { directory: "instrumentos", history: "instrumentos", idField: "instrumentId" },
};

function dataUriParts(value) {
  const match = String(value || "").match(/^data:(image\/(png|jpeg|webp)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) return null;
  return { mime: match[1].toLowerCase(), extension: match[2] === "jpeg" ? "jpg" : match[2] || "pdf", data: Buffer.from(match[3], "base64") };
}

function getSharedRoot() {
  return String(process.env.APP_SHARED_PROCEDURE_DIR || "").trim();
}

function isConfigured() {
  return Boolean(getSharedRoot());
}

function getDirectories() {
  const root = getSharedRoot();
  return {
    root,
    procedures: path.join(root, "procedimentos"),
    locks: path.join(root, "bloqueios"),
    history: path.join(root, "historico", "procedimentos"),
    assets: path.join(root, "arquivos"),
    sequences: path.join(root, "controle-sequencias.json"),
    users: path.join(root, "usuarios.json"),
    configuration: path.join(root, "configuracao.json"),
    modules: Object.fromEntries(Object.entries(MODULE_DEFINITIONS).map(([name, definition]) => [name, path.join(root, definition.directory)])),
  };
}

async function ensureSharedDirectories() {
  if (!isConfigured()) return null;
  const directories = getDirectories();
  await Promise.all([directories.root, directories.procedures, directories.locks, directories.history, directories.assets, ...Object.values(directories.modules)].map((directory) => fsp.mkdir(directory, { recursive: true })));
  return directories;
}

function getModuleDefinition(moduleName) {
  const definition = MODULE_DEFINITIONS[String(moduleName || "")];
  if (!definition) throw Object.assign(new Error("Modulo compartilhado invalido."), { status: 400 });
  return definition;
}

function modulePath(moduleName, recordId) {
  const definition = getModuleDefinition(moduleName);
  return path.join(getDirectories().modules[moduleName], `${safeName(recordId)}.json`);
}

function moduleLockPath(moduleName, recordId) {
  return path.join(getDirectories().locks, `${safeName(moduleName)}-${safeName(recordId)}.lock`);
}

async function listModuleRecords(moduleName) {
  if (!isConfigured()) return [];
  const definition = getModuleDefinition(moduleName);
  const directories = await ensureSharedDirectories();
  const entries = await fsp.readdir(directories.modules[moduleName], { withFileTypes: true });
  const records = [];
  for (const entry of entries.filter((item) => item.isFile() && item.name.endsWith(".json"))) {
    const record = await readJson(path.join(directories.modules[moduleName], entry.name));
    if (record?.[definition.idField]) records.push(record);
  }
  return records;
}

async function loadModuleRecord(moduleName, recordId) {
  if (!isConfigured()) return null;
  await ensureSharedDirectories();
  return readJson(modulePath(moduleName, recordId));
}

async function saveModuleRecord(moduleName, record, expectedUpdatedAt = null) {
  if (!isConfigured()) return record;
  const definition = getModuleDefinition(moduleName);
  const recordId = record?.[definition.idField];
  if (!recordId) throw Object.assign(new Error("Registro sem identificador."), { status: 400 });
  await ensureSharedDirectories();
  const current = await loadModuleRecord(moduleName, recordId);
  if (expectedUpdatedAt && current?.updatedAt && String(expectedUpdatedAt) !== String(current.updatedAt)) {
    const error = new Error("Este registro foi alterado em outra estacao. Recarregue antes de salvar.");
    error.status = 409;
    throw error;
  }
  const saved = { ...record, updatedAt: new Date().toISOString() };
  await writeAtomic(modulePath(moduleName, recordId), `${JSON.stringify(saved, null, 2)}\n`);
  const assetFolder = path.join(getDirectories().assets, safeName(moduleName), safeName(recordId));
  const assets = new Map();
  const visit = (value) => {
    if (typeof value === "string") {
      const asset = dataUriParts(value);
      if (asset) assets.set(crypto.createHash("sha256").update(value).digest("hex"), asset);
    } else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") Object.values(value).forEach(visit);
  };
  visit(saved);
  await Promise.all([...assets.entries()].map(async ([hash, asset]) => {
    const filePath = path.join(assetFolder, `${hash}.${asset.extension}`);
    if (!fs.existsSync(filePath)) await writeAtomic(filePath, asset.data);
  }));
  const historyFolder = path.join(getDirectories().root, "historico", definition.history, safeName(recordId));
  await writeAtomic(path.join(historyFolder, `${saved.updatedAt.replace(/[:.]/g, "-")}.json`), `${JSON.stringify(saved, null, 2)}\n`);
  return saved;
}

async function deleteModuleRecord(moduleName, recordId) {
  if (!isConfigured()) return false;
  try {
    await fsp.unlink(modulePath(moduleName, recordId));
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function procedurePath(procedureId) {
  return path.join(getDirectories().procedures, `${safeName(procedureId)}.json`);
}

function lockPath(procedureId) {
  return path.join(getDirectories().locks, `${safeName(procedureId)}.lock`);
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fsp.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function listProcedures() {
  if (!isConfigured()) return [];
  const directories = await ensureSharedDirectories();
  const entries = await fsp.readdir(directories.procedures, { withFileTypes: true });
  const procedures = [];
  for (const entry of entries.filter((item) => item.isFile() && item.name.endsWith(".json"))) {
    const procedure = await readJson(path.join(directories.procedures, entry.name));
    if (procedure?.procedureId) procedures.push(procedure);
  }
  return procedures;
}

async function loadProcedure(procedureId) {
  if (!isConfigured()) return null;
  await ensureSharedDirectories();
  return readJson(procedurePath(procedureId));
}

async function saveProcedure(procedure, expectedUpdatedAt = null) {
  if (!isConfigured()) return procedure;
  await ensureSharedDirectories();
  const current = await loadProcedure(procedure.procedureId);
  if (expectedUpdatedAt && current?.updatedAt && String(expectedUpdatedAt) !== String(current.updatedAt)) {
    const error = new Error("O procedimento foi alterado em outra estação. Recarregue antes de salvar.");
    error.status = 409;
    throw error;
  }
  const saved = { ...procedure, updatedAt: new Date().toISOString() };
  await writeAtomic(procedurePath(procedure.procedureId), `${JSON.stringify(saved, null, 2)}\n`);
  const assetFolder = path.join(getDirectories().assets, safeName(procedure.procedureId));
  const assets = new Map();
  const visit = (value) => {
    if (typeof value === "string") {
      const asset = dataUriParts(value);
      if (asset) assets.set(crypto.createHash("sha256").update(value).digest("hex"), asset);
    } else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") Object.values(value).forEach(visit);
  };
  visit(saved);
  await Promise.all([...assets.entries()].map(async ([hash, asset]) => {
    const filePath = path.join(assetFolder, `${hash}.${asset.extension}`);
    if (!fs.existsSync(filePath)) await writeAtomic(filePath, asset.data);
  }));
  const historyFolder = path.join(getDirectories().history, safeName(procedure.procedureId));
  await writeAtomic(path.join(historyFolder, `${saved.updatedAt.replace(/[:.]/g, "-")}.json`), `${JSON.stringify(saved, null, 2)}\n`);
  return saved;
}

async function deleteProcedure(procedureId) {
  if (!isConfigured()) return false;
  try {
    await fsp.unlink(procedurePath(procedureId));
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function withExclusiveFile(filePath, task) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const handle = await fsp.open(filePath, "wx");
      await handle.close();
      try { return await task(); } finally { await fsp.unlink(filePath).catch(() => {}); }
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  const error = new Error("A pasta compartilhada está ocupada. Tente novamente em alguns instantes.");
  error.status = 423;
  throw error;
}

async function reserveDocumentNumber(procedureId, documentType, sector, sectorPrefix = "") {
  if (!isConfigured()) return null;
  const directories = await ensureSharedDirectories();
  return withExclusiveFile(path.join(directories.locks, "numeracao.lock"), async () => {
    const data = await readJson(directories.sequences) || { reservations: {} };
    const key = `${procedureId}|${documentType}|${sector}|${sectorPrefix}`;
    if (data.reservations[key]) return String(data.reservations[key]).padStart(4, "0");
    const procedures = await listProcedures();
    const used = procedures
      .filter((item) => item.qualityInfo?.documentType === documentType && item.qualityInfo?.area === sector && String(item.documentCodeMiddle || "").startsWith(sectorPrefix))
      .map((item) => Number(item.documentNumber || 0));
    const reserved = Object.entries(data.reservations)
      .filter(([reservationKey]) => reservationKey.includes(`|${documentType}|${sector}|${sectorPrefix}`))
      .map(([, number]) => Number(number));
    const number = Math.max(0, ...used, ...reserved) + 1;
    data.reservations[key] = number;
    await writeAtomic(directories.sequences, `${JSON.stringify(data, null, 2)}\n`);
    return String(number).padStart(4, "0");
  });
}

async function rememberDocumentNumber(procedureId, documentType, sector, sectorPrefix, documentNumber) {
  if (!isConfigured() || !procedureId || Number(documentNumber) <= 0) return;
  const directories = await ensureSharedDirectories();
  await withExclusiveFile(path.join(directories.locks, "numeracao.lock"), async () => {
    const data = await readJson(directories.sequences) || { reservations: {} };
    data.reservations[`${procedureId}|${documentType}|${sector}|${sectorPrefix || ""}`] ||= Number(documentNumber);
    await writeAtomic(directories.sequences, `${JSON.stringify(data, null, 2)}\n`);
  });
}

async function listUsers() {
  if (!isConfigured()) return [];
  await ensureSharedDirectories();
  return (await readJson(getDirectories().users)) || [];
}

async function saveUsers(users) {
  await writeAtomic(getDirectories().users, `${JSON.stringify(users, null, 2)}\n`);
  return users;
}

async function upsertUser(user) {
  const users = await listUsers();
  const index = users.findIndex((item) => item.username === user.username);
  if (index >= 0) users[index] = { ...users[index], ...user, updatedAt: new Date().toISOString() };
  else users.push({ ...user, createdAt: user.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() });
  await saveUsers(users);
  return users.find((item) => item.username === user.username);
}

async function updateUser(userId, values) {
  const users = await listUsers();
  const user = users.find((item) => String(item.userId) === String(userId));
  if (!user) return null;
  Object.assign(user, values, { updatedAt: new Date().toISOString() });
  await saveUsers(users);
  return user;
}

async function getConfiguration() {
  if (!isConfigured()) return null;
  await ensureSharedDirectories();
  return readJson(getDirectories().configuration);
}

async function saveConfiguration(configuration) {
  if (!isConfigured()) return configuration;
  await ensureSharedDirectories();
  await writeAtomic(getDirectories().configuration, `${JSON.stringify({ ...configuration, updatedAt: new Date().toISOString() }, null, 2)}\n`);
  return getConfiguration();
}

function lockDescription(lock) {
  return `${lock.displayName || lock.username || "Outro usuário"} está editando este procedimento desde ${new Date(lock.acquiredAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.`;
}

async function readLock(procedureId) {
  return readJson(lockPath(procedureId));
}

async function acquireLock(procedureId, user) {
  if (!isConfigured()) return { configured: false, acquired: false };
  if (!String(procedureId || "").trim()) throw Object.assign(new Error("Identificador do procedimento obrigatorio."), { status: 400 });
  await ensureSharedDirectories();
  const filePath = lockPath(procedureId);
  const now = Date.now();
  const lock = {
    procedureId: String(procedureId),
    username: user.username || "usuario",
    displayName: user.displayName || user.username || "Usuário",
    machine: os.hostname(),
    acquiredAt: new Date(now).toISOString(),
    expiresAt: new Date(now + LOCK_TTL_MS).toISOString(),
    token: crypto.randomBytes(24).toString("hex"),
  };
  try {
    const handle = await fsp.open(filePath, "wx");
    await handle.writeFile(`${JSON.stringify(lock, null, 2)}\n`);
    await handle.close();
    return { configured: true, acquired: true, lockToken: lock.token, expiresAt: lock.expiresAt };
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const existing = await readLock(procedureId);
    if (existing && Date.parse(existing.expiresAt) > now) {
      const conflict = new Error(lockDescription(existing));
      conflict.status = 423;
      conflict.lock = { displayName: existing.displayName, username: existing.username, acquiredAt: existing.acquiredAt, expiresAt: existing.expiresAt };
      throw conflict;
    }
    await fsp.unlink(filePath).catch(() => {});
    return acquireLock(procedureId, user);
  }
}

async function assertLock(procedureId, user, token) {
  if (!isConfigured()) return;
  const lock = await readLock(procedureId);
  if (!lock || Date.parse(lock.expiresAt) <= Date.now()) {
    const error = new Error("A sessão de edição expirou. Volte para a lista e abra o procedimento novamente.");
    error.status = 423;
    throw error;
  }
  if (lock.token !== token || lock.username !== user.username) {
    const error = new Error(lockDescription(lock));
    error.status = 423;
    throw error;
  }
}

async function refreshLock(procedureId, user, token) {
  await assertLock(procedureId, user, token);
  const lock = await readLock(procedureId);
  lock.expiresAt = new Date(Date.now() + LOCK_TTL_MS).toISOString();
  await writeAtomic(lockPath(procedureId), `${JSON.stringify(lock, null, 2)}\n`);
  return { acquired: true, expiresAt: lock.expiresAt };
}

async function releaseLock(procedureId, user, token) {
  if (!isConfigured()) return { released: false };
  const lock = await readLock(procedureId);
  if (!lock || lock.token !== token || lock.username !== user.username) return { released: false };
  await fsp.unlink(lockPath(procedureId)).catch(() => {});
  return { released: true };
}

function genericLockDescription(lock) {
  return `${lock.displayName || lock.username || "Outro usuario"} esta editando este registro desde ${new Date(lock.acquiredAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.`;
}

async function getModuleLock(moduleName, recordId) {
  if (!isConfigured()) return null;
  const filePath = moduleLockPath(moduleName, recordId);
  const lock = await readJson(filePath);
  if (!lock || Date.parse(lock.expiresAt) <= Date.now()) {
    if (lock) await fsp.unlink(filePath).catch(() => {});
    return null;
  }
  return lock;
}

async function acquireModuleLock(moduleName, recordId, user) {
  if (!isConfigured()) return { configured: false, acquired: false };
  getModuleDefinition(moduleName);
  if (!String(recordId || "").trim()) throw Object.assign(new Error("Identificador do registro obrigatorio."), { status: 400 });
  await ensureSharedDirectories();
  const filePath = moduleLockPath(moduleName, recordId);
  const now = Date.now();
  const lock = {
    module: moduleName,
    recordId: String(recordId),
    username: user.username || "usuario",
    displayName: user.displayName || user.username || "Usuario",
    machine: os.hostname(),
    acquiredAt: new Date(now).toISOString(),
    expiresAt: new Date(now + LOCK_TTL_MS).toISOString(),
    token: crypto.randomBytes(24).toString("hex"),
  };
  try {
    const handle = await fsp.open(filePath, "wx");
    await handle.writeFile(`${JSON.stringify(lock, null, 2)}\n`);
    await handle.close();
    return { configured: true, acquired: true, lockToken: lock.token, expiresAt: lock.expiresAt };
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const existing = await getModuleLock(moduleName, recordId);
    if (existing) {
      const conflict = new Error(genericLockDescription(existing));
      conflict.status = 423;
      conflict.lock = { displayName: existing.displayName, username: existing.username, machine: existing.machine, acquiredAt: existing.acquiredAt, expiresAt: existing.expiresAt };
      throw conflict;
    }
    return acquireModuleLock(moduleName, recordId, user);
  }
}

async function assertModuleLock(moduleName, recordId, user, token) {
  if (!isConfigured()) return;
  const lock = await getModuleLock(moduleName, recordId);
  if (!lock) throw Object.assign(new Error("A sessao de edicao expirou. Volte para a lista e abra o registro novamente."), { status: 423 });
  if (lock.token !== token || lock.username !== user.username) throw Object.assign(new Error(genericLockDescription(lock)), { status: 423 });
}

async function refreshModuleLock(moduleName, recordId, user, token) {
  await assertModuleLock(moduleName, recordId, user, token);
  const lock = await getModuleLock(moduleName, recordId);
  lock.expiresAt = new Date(Date.now() + LOCK_TTL_MS).toISOString();
  await writeAtomic(moduleLockPath(moduleName, recordId), `${JSON.stringify(lock, null, 2)}\n`);
  return { acquired: true, expiresAt: lock.expiresAt };
}

async function releaseModuleLock(moduleName, recordId, user, token) {
  if (!isConfigured()) return { released: false };
  const lock = await getModuleLock(moduleName, recordId);
  if (!lock || lock.token !== token || lock.username !== user.username) return { released: false };
  await fsp.unlink(moduleLockPath(moduleName, recordId)).catch(() => {});
  return { released: true };
}

async function reserveModuleCode(moduleName, prefix) {
  if (!isConfigured()) return null;
  const directories = await ensureSharedDirectories();
  return withExclusiveFile(path.join(directories.locks, "numeracao.lock"), async () => {
    const data = await readJson(directories.sequences) || { reservations: {}, modules: {} };
    const escapedPrefix = prefix.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
    const pattern = new RegExp(`^${escapedPrefix}(\\d+)$`);
    const records = await listModuleRecords(moduleName);
    const used = records.map((record) => Number(String(record.documentCode || "").match(pattern)?.[1] || 0));
    const next = Math.max(Number(data.modules?.[moduleName] || 0), ...used) + 1;
    data.modules = data.modules || {};
    data.modules[moduleName] = next;
    await writeAtomic(directories.sequences, `${JSON.stringify(data, null, 2)}\n`);
    return `${prefix}${String(next).padStart(4, "0")}`;
  });
}

module.exports = { acquireLock, acquireModuleLock, assertLock, assertModuleLock, deleteModuleRecord, deleteProcedure, ensureSharedDirectories, getConfiguration, getModuleLock, getSharedRoot, isConfigured, listModuleRecords, listProcedures, listUsers, loadModuleRecord, loadProcedure, refreshLock, refreshModuleLock, releaseLock, releaseModuleLock, rememberDocumentNumber, reserveDocumentNumber, reserveModuleCode, saveConfiguration, saveModuleRecord, saveProcedure, updateUser, upsertUser };

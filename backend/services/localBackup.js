const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const { createDatabaseBackup } = require("./databaseBackup");
const { ensureLocalDataDirectories, getLocalDirectories, safeName, writeAtomic } = require("./localFiles");

const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_LIMIT = 45;
let backupTimer = null;
let backupInProgress = null;

function isLocalMode() {
  return String(process.env.DATABASE_DRIVER || "").toLowerCase() === "sqlite";
}

function timestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

async function listJsonFiles(directory) {
  try {
    return (await fsp.readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
      .map((entry) => entry.name);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function pruneHistory() {
  const directories = getLocalDirectories();
  const files = await listJsonFiles(directories.historyBackups);
  const ordered = await Promise.all(files.map(async (name) => ({ name, time: (await fsp.stat(path.join(directories.historyBackups, name))).mtimeMs })));
  ordered.sort((a, b) => b.time - a.time);
  await Promise.all(ordered.slice(HISTORY_LIMIT).map((entry) => fsp.unlink(path.join(directories.historyBackups, entry.name))));
}

async function writeLocalBackup(reason = "diario") {
  if (!isLocalMode()) return null;
  if (backupInProgress) return backupInProgress;
  backupInProgress = (async () => {
    const directories = await ensureLocalDataDirectories();
    const backup = await createDatabaseBackup({ includeUserCredentials: true });
    backup.metadata = { ...(backup.metadata || {}), automatic: true, reason };
    const filename = `controle-sgq-${safeName(reason)}-${timestamp()}.json`;
    const payload = `${JSON.stringify(backup, null, 2)}\n`;
    await writeAtomic(path.join(directories.historyBackups, filename), payload);
    if (reason === "diario") await writeAtomic(path.join(directories.dailyBackups, filename), payload);
    await writeAtomic(path.join(directories.backups, "ultimo.json"), payload);
    await pruneHistory();
    return { filename, reason, createdAt: backup.createdAt, path: path.join(directories.historyBackups, filename) };
  })().finally(() => { backupInProgress = null; });
  return backupInProgress;
}

async function shouldCreateDailyBackup() {
  const files = await listJsonFiles(getLocalDirectories().dailyBackups);
  if (!files.length) return true;
  const stats = await Promise.all(files.map((name) => fsp.stat(path.join(getLocalDirectories().dailyBackups, name))));
  return Date.now() - Math.max(...stats.map((stat) => stat.mtimeMs)) >= DAY_MS;
}

async function createDailyBackupIfDue() {
  if (await shouldCreateDailyBackup()) return writeLocalBackup("diario");
  return null;
}

function startLocalBackupScheduler() {
  if (!isLocalMode() || backupTimer) return;
  createDailyBackupIfDue().catch((error) => console.warn(`Nao foi possivel criar o backup automatico: ${error.message}`));
  backupTimer = setInterval(() => {
    createDailyBackupIfDue().catch((error) => console.warn(`Nao foi possivel criar o backup automatico: ${error.message}`));
  }, DAY_MS);
  backupTimer.unref?.();
}

function stopLocalBackupScheduler() {
  if (!backupTimer) return;
  clearInterval(backupTimer);
  backupTimer = null;
}

async function listLocalBackups() {
  if (!isLocalMode()) return [];
  const directory = getLocalDirectories().historyBackups;
  const files = await listJsonFiles(directory);
  const backups = await Promise.all(files.map(async (name) => {
    const stat = await fsp.stat(path.join(directory, name));
    return { name, size: stat.size, updatedAt: stat.mtime.toISOString() };
  }));
  return backups.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

module.exports = { createDailyBackupIfDue, listLocalBackups, startLocalBackupScheduler, stopLocalBackupScheduler, writeLocalBackup };

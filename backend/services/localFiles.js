const crypto = require("crypto");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const { packEmbeddedAssets } = require("./procedurePayloadAssets");

const DEFAULT_PROCEDURE_VERSION_LIMIT = 10;

function getProcedureVersionLimit() {
  const configured = Number.parseInt(process.env.PROCEDURE_VERSION_LIMIT, 10);
  return Number.isInteger(configured) && configured >= 3 && configured <= 100
    ? configured
    : DEFAULT_PROCEDURE_VERSION_LIMIT;
}

function getFilesRoot() {
  return process.env.APP_FILES_DIR || path.resolve(__dirname, "..", "dados_procedimentos");
}

function getLocalDirectories() {
  const root = getFilesRoot();
  return {
    root,
    drafts: path.join(root, "json", "rascunhos"),
    json: path.join(root, "json"),
    images: path.join(root, "imagens"),
    pdfs: path.join(root, "pdfs"),
    packages: path.join(root, "pacotes"),
    recovery: path.join(root, "recuperacao"),
    versions: path.join(root, "historico", "procedimentos"),
    backups: path.join(root, "backups"),
    dailyBackups: path.join(root, "backups", "diarios"),
    historyBackups: path.join(root, "backups", "historico"),
  };
}

async function ensureLocalDataDirectories() {
  await Promise.all(Object.values(getLocalDirectories()).map((directory) => fsp.mkdir(directory, { recursive: true })));
  return getLocalDirectories();
}

function safeName(value) {
  return String(value || "procedimento")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "procedimento";
}

async function writeAtomic(filePath, content) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await fsp.writeFile(temporaryPath, content);
  await fsp.rename(temporaryPath, filePath);
}

function dataUriParts(value) {
  const match = String(value || "").match(/^data:(image\/(png|jpeg|webp)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) return null;
  return { mime: match[1].toLowerCase(), extension: match[2] === "jpeg" ? "jpg" : match[2] || "pdf", data: Buffer.from(match[3], "base64") };
}

async function persistEmbeddedAssets(procedure) {
  const directories = await ensureLocalDataDirectories();
  const procedureName = safeName(procedure?.procedureId || procedure?.documentCode);
  const assets = new Map();
  const visit = (value) => {
    if (typeof value === "string") {
      const parts = dataUriParts(value);
      if (parts) assets.set(crypto.createHash("sha256").update(value).digest("hex"), parts);
      return;
    }
    if (Array.isArray(value)) return value.forEach(visit);
    if (value && typeof value === "object") Object.values(value).forEach(visit);
  };
  visit(procedure);
  await Promise.all([...assets.entries()].map(async ([hash, asset]) => {
    const folder = asset.mime === "application/pdf" ? directories.pdfs : directories.images;
    const filePath = path.join(folder, procedureName, `${hash}.${asset.extension}`);
    if (!fs.existsSync(filePath)) await writeAtomic(filePath, asset.data);
  }));
  return assets.size;
}

async function persistProcedureVersion(procedure) {
  if (!process.env.APP_FILES_DIR || !procedure?.procedureId) return null;
  const directories = await ensureLocalDataDirectories();
  const folder = path.join(directories.versions, safeName(procedure.procedureId));
  const filename = `${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  const filePath = path.join(folder, filename);
  const storedProcedure = procedure?._embeddedAssets ? procedure : packEmbeddedAssets(procedure);
  await writeAtomic(filePath, `${JSON.stringify(storedProcedure, null, 2)}\n`);
  const entries = (await fsp.readdir(folder, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort()
    .reverse();
  await Promise.all(entries.slice(getProcedureVersionLimit()).map((entry) => fsp.unlink(path.join(folder, entry))));
  return filePath;
}

module.exports = { ensureLocalDataDirectories, getFilesRoot, getLocalDirectories, persistEmbeddedAssets, persistProcedureVersion, safeName, writeAtomic };

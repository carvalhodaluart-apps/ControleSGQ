const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { databasePath, getLocalDatabasePool } = require("./localDatabase");

let setupImportToken = "";

function isDesktopSetupSupported() {
  return String(process.env.DATABASE_DRIVER || "").toLowerCase() === "sqlite";
}

function setupFilePath() {
  return process.env.APP_SETUP_FILE || path.resolve(process.env.APP_DATA_DIR || path.resolve(__dirname, "..", "..", "data"), "setup.json");
}

function isPlaceholderPassword(value) {
  const password = String(value || "").trim();
  return !password || password === "troque-esta-senha" || password === "SENHA_DA_QUALIDADE";
}

function isConfigured() {
  if (!isDesktopSetupSupported()) return true;
  if (fs.existsSync(setupFilePath())) {
    try { if (JSON.parse(fs.readFileSync(setupFilePath(), "utf8")).configured === true) return true; } catch (_error) { /* Rebuild the marker below. */ }
  }
  return !isPlaceholderPassword(process.env.QUALITY_PASSWORD);
}

function getSetupStatus() {
  if (!isDesktopSetupSupported()) return { supported: false, configured: true, database: "postgresql" };
  let databaseReady = false;
  try {
    getLocalDatabasePool().query("SELECT 1");
    databaseReady = true;
  } catch (_error) { /* The UI will show the setup error. */ }
  return { supported: true, configured: isConfigured(), database: "sqlite", databaseReady };
}

function writeEnvironmentValues(values) {
  const envPath = process.env.APP_ENV_FILE;
  if (!envPath) throw new Error("Arquivo de configuracao local nao definido.");
  fs.mkdirSync(path.dirname(envPath), { recursive: true });
  const current = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const lines = current.split(/\r?\n/).filter(Boolean);
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`;
    const index = lines.findIndex((item) => item.startsWith(`${key}=`));
    if (index >= 0) lines[index] = line;
    else lines.push(line);
    process.env[key] = String(value);
  }
  fs.writeFileSync(envPath, `${lines.join("\n")}\n`, { mode: 0o600 });
}

function validatePassword(password) {
  if (typeof password !== "string" || password.length < 8 || password.length > 256) {
    throw Object.assign(new Error("A senha inicial deve ter entre 8 e 256 caracteres."), { status: 400 });
  }
}

async function configureDesktop({ password, displayName = "Qualidade", role = "manager", username = "" }) {
  if (!isDesktopSetupSupported()) throw Object.assign(new Error("A configuracao inicial so esta disponivel no modo desktop."), { status: 404 });
  validatePassword(password);
  if (isConfigured()) throw Object.assign(new Error("A configuracao inicial ja foi concluida."), { status: 409 });
  const name = String(displayName || "Qualidade").trim().slice(0, 120) || "Qualidade";
  const normalizedRole = String(role || "manager").trim().toLowerCase();
  if (!["manager", "editor"].includes(normalizedRole)) throw Object.assign(new Error("Escolha Gestor ou Editor."), { status: 400 });
  const normalizedUsername = String(username || "").trim().toLowerCase();
  if (normalizedRole === "editor" && !/^[a-z0-9][a-z0-9._-]{2,59}$/.test(normalizedUsername)) {
    throw Object.assign(new Error("Informe um usuario de editor com letras, numeros, ponto, hifen ou sublinhado."), { status: 400 });
  }
  writeEnvironmentValues({ QUALITY_PASSWORD: normalizedRole === "manager" ? password : "", QUALITY_DISPLAY_NAME: normalizedRole === "manager" ? name : "", SESSION_SECRET: crypto.randomBytes(48).toString("hex"), SETUP_COMPLETED: "true" });
  fs.mkdirSync(path.dirname(setupFilePath()), { recursive: true });
  if (normalizedRole === "editor") {
    const { getLocalDatabasePool } = require("./localDatabase");
    const { hashPassword } = require("./procedureAuth");
    const passwordHash = await hashPassword(password);
    await getLocalDatabasePool().query("INSERT INTO app_users (username, display_name, password_hash, role, active) VALUES (?, ?, ?, ?, 1)", [normalizedUsername, name, passwordHash, "editor"]);
  }
  fs.writeFileSync(setupFilePath(), JSON.stringify({ configured: true, role: normalizedRole, username: normalizedUsername || "qualidade", displayName: name, configuredAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
  getLocalDatabasePool().query("SELECT 1");
  setupImportToken = crypto.randomBytes(32).toString("hex");
  return { configured: true, role: normalizedRole, username: normalizedUsername || "qualidade", displayName: name, database: databasePath(), setupToken: setupImportToken };
}

function consumeSetupImportToken(token) {
  if (!setupImportToken || !token || token !== setupImportToken) return false;
  setupImportToken = "";
  return true;
}

function isSetupImportToken(token) {
  return Boolean(setupImportToken && token && token === setupImportToken);
}

module.exports = { configureDesktop, consumeSetupImportToken, getSetupStatus, isDesktopSetupSupported, isSetupImportToken };

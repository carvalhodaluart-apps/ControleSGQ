const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const { checkForUpdates } = require("./update-check.js");

let backend = null;
let mainWindow = null;
const SHARED_FOLDER_USER_NAME = "sgq-rede";

function sharedFolderConfigPath() {
  return path.join(app.getPath("userData"), "shared-folder.json");
}

function readSharedFolderPath() {
  try {
    const value = JSON.parse(fs.readFileSync(sharedFolderConfigPath(), "utf8"));
    return typeof value.path === "string" ? value.path.trim() : "";
  } catch (_error) {
    return "";
  }
}

function readSharedFolderNetworkPath() {
  try {
    const value = JSON.parse(fs.readFileSync(sharedFolderConfigPath(), "utf8"));
    return typeof value.networkPath === "string" ? value.networkPath.trim() : "";
  } catch (_error) {
    return "";
  }
}

function applySharedFolderPath(folderPath = readSharedFolderPath()) {
  process.env.APP_SHARED_PROCEDURE_DIR = String(folderPath || "").trim();
  return process.env.APP_SHARED_PROCEDURE_DIR;
}

async function inspectSharedFolder(folderPath) {
  const target = String(folderPath || "").trim();
  if (!target) return { configured: false, accessible: false, name: "", path: "" };
  await fs.promises.access(target, fs.constants.R_OK | fs.constants.W_OK);
  await Promise.all(["procedimentos", "nao-conformidades", "planos-acao", "instrumentos", "bloqueios", "historico", "arquivos"].map((name) => fs.promises.mkdir(path.join(target, name), { recursive: true })));
  return { configured: true, accessible: true, name: path.basename(target) || target, path: target };
}

async function migrateLocalProceduresToShared() {
  const database = require(path.join(projectRoot(), "backend", "services", "procedureDatabase.js"));
  const shared = require(path.join(projectRoot(), "backend", "services", "sharedProcedureStorage.js"));
  const result = await database.getDatabasePool().query('SELECT content, updated_at AS "updatedAt" FROM procedure_documents');
  let migrated = 0;
  for (const row of result.rows) {
    const procedure = typeof row.content === "string" ? JSON.parse(row.content) : row.content;
    if (!procedure?.procedureId || await shared.loadProcedure(procedure.procedureId)) continue;
    await shared.saveProcedure({ ...procedure, updatedAt: procedure.updatedAt || row.updatedAt });
    migrated += 1;
  }
  await database.getDatabasePool().query("DELETE FROM procedure_documents");
  return migrated;
}

async function migrateLocalUsersToShared() {
  const database = require(path.join(projectRoot(), "backend", "services", "procedureDatabase.js"));
  const shared = require(path.join(projectRoot(), "backend", "services", "sharedProcedureStorage.js"));
  const result = await database.getDatabasePool().query('SELECT user_id AS "userId", username, display_name AS "displayName", password_hash AS "passwordHash", role, active, created_at AS "createdAt", updated_at AS "updatedAt" FROM app_users');
  const current = await shared.listUsers();
  let migrated = 0;
  for (const user of result.rows) {
    if (current.some((item) => item.username === user.username)) continue;
    await shared.upsertUser({ ...user, userId: String(user.userId) });
    migrated += 1;
  }
  return migrated;
}

async function migrateLocalModulesToShared() {
  const database = require(path.join(projectRoot(), "backend", "services", "procedureDatabase.js"));
  const shared = require(path.join(projectRoot(), "backend", "services", "sharedProcedureStorage.js"));
  const sources = [
    { moduleName: "nao-conformidades", table: "nonconformity_documents", idField: "nonconformityId", query: 'SELECT nonconformity_id AS "nonconformityId", document_code AS "documentCode", title, status, content, updated_at AS "updatedAt" FROM nonconformity_documents' },
    { moduleName: "planos-acao", table: "action_plan_documents", idField: "planId", query: 'SELECT plan_id AS "planId", document_code AS "documentCode", title, status, content, updated_at AS "updatedAt" FROM action_plan_documents' },
    { moduleName: "instrumentos", table: "metrology_instruments", idField: "instrumentId", query: 'SELECT instrument_id AS "instrumentId", document_code AS "documentCode", name, situation, content, updated_at AS "updatedAt" FROM metrology_instruments' },
  ];
  const migrated = {};
  for (const source of sources) {
    const result = await database.getDatabasePool().query(source.query);
    let count = 0;
    for (const row of result.rows) {
      const content = typeof row.content === "string" ? JSON.parse(row.content) : row.content || {};
      const record = { ...content, ...Object.fromEntries(Object.entries(row).filter(([key]) => key !== "content")) };
      if (!record[source.idField] || await shared.loadModuleRecord(source.moduleName, record[source.idField])) continue;
      await shared.saveModuleRecord(source.moduleName, record, null);
      count += 1;
    }
    migrated[source.moduleName] = count;
  }
  return migrated;
}

async function migrateLocalQualityToShared() {
  const shared = require(path.join(projectRoot(), "backend", "services", "sharedProcedureStorage.js"));
  if (!process.env.QUALITY_PASSWORD || process.env.QUALITY_PASSWORD === "troque-esta-senha" || process.env.QUALITY_PASSWORD === "SENHA_DA_QUALIDADE") return false;
  if ((await shared.listUsers()).some((user) => user.username === "qualidade")) return false;
  const { hashPassword } = require(path.join(projectRoot(), "backend", "services", "procedureAuth.js"));
  await shared.upsertUser({ userId: "quality-admin", username: "qualidade", displayName: process.env.QUALITY_DISPLAY_NAME || "Qualidade", passwordHash: await hashPassword(process.env.QUALITY_PASSWORD), role: "manager", active: true });
  return true;
}

async function configureSharedFolderPath(folderPath, networkPath = "") {
  const status = await inspectSharedFolder(folderPath);
  const localConfiguration = await require(path.join(projectRoot(), "backend", "services", "procedureConfiguration.js")).getProcedureConfiguration();
  await fs.promises.mkdir(path.dirname(sharedFolderConfigPath()), { recursive: true });
  const resolvedNetworkPath = networkPath || (String(folderPath).startsWith("\\\\") ? folderPath : "");
  await fs.promises.writeFile(sharedFolderConfigPath(), JSON.stringify({ path: folderPath, networkPath: resolvedNetworkPath, updatedAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
  applySharedFolderPath(folderPath);
  const shared = require(path.join(projectRoot(), "backend", "services", "sharedProcedureStorage.js"));
  if (!await shared.getConfiguration()) await shared.saveConfiguration(localConfiguration);
  return { ...status, networkPath: resolvedNetworkPath, migrated: await migrateLocalProceduresToShared(), modulesMigrated: await migrateLocalModulesToShared(), usersMigrated: await migrateLocalUsersToShared(), qualityMigrated: await migrateLocalQualityToShared() };
}

function runElevatedHostSetup(folderPath, password) {
  const tempRoot = fs.mkdtempSync(path.join(app.getPath("temp"), "controle-sgq-host-"));
  const configPath = path.join(tempRoot, "config.json");
  const scriptPath = path.join(tempRoot, "configure.ps1");
  const script = `param([string]$ConfigPath)
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  $arguments = @('-NoProfile','-ExecutionPolicy','Bypass','-File',$PSCommandPath,'-ConfigPath',$ConfigPath)
  $elevated = Start-Process powershell.exe -Verb RunAs -Wait -PassThru -ArgumentList $arguments
  exit $elevated.ExitCode
}
$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
$root = [string]$config.folderPath
$shareName = [string]$config.shareName
$userName = [string]$config.userName
$userPassword = ConvertTo-SecureString ([string]$config.password) -AsPlainText -Force
New-Item -ItemType Directory -Path $root -Force | Out-Null
$localUser = Get-LocalUser -Name $userName -ErrorAction SilentlyContinue
if ($null -eq $localUser) {
  New-LocalUser -Name $userName -Password $userPassword -AccountNeverExpires -PasswordNeverExpires -UserMayNotChangePassword -Description 'Acesso do Controle SGQ a pasta compartilhada' | Out-Null
} else {
  Set-LocalUser -Name $userName -Password $userPassword -PasswordNeverExpires $true
}
$account = \"$env:COMPUTERNAME\\$userName\"
icacls $root /inheritance:e | Out-Null
icacls $root /grant \"\${account}:(OI)(CI)M\" /T /C | Out-Null
$share = Get-SmbShare -Name $shareName -ErrorAction SilentlyContinue
if ($null -ne $share -and $share.Path -ne $root) { throw \"Ja existe um compartilhamento chamado $shareName em outra pasta.\" }
if ($null -eq $share) { New-SmbShare -Name $shareName -Path $root -ChangeAccess $account -Description 'Dados compartilhados do Controle SGQ' | Out-Null }
Enable-NetFirewallRule -DisplayGroup 'File and Printer Sharing' -ErrorAction SilentlyContinue | Out-Null
exit 0
`;
  fs.writeFileSync(configPath, JSON.stringify({ folderPath, shareName: "ControleSGQ", userName: SHARED_FOLDER_USER_NAME, password }, null, 2), { mode: 0o600 });
  fs.writeFileSync(scriptPath, script, { encoding: "utf8", mode: 0o600 });
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath, "-ConfigPath", configPath], { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      fs.rmSync(tempRoot, { recursive: true, force: true });
      if (code !== 0) reject(new Error(stderr.trim() || "O Windows nao autorizou a configuracao da pasta central."));
      else resolve();
    });
  });
}

ipcMain.handle("shared-folder:status", async () => {
  const folderPath = applySharedFolderPath();
  try { return { ...(await inspectSharedFolder(folderPath)), networkPath: readSharedFolderNetworkPath() }; } catch (error) { return { configured: Boolean(folderPath), accessible: false, name: path.basename(folderPath) || folderPath, path: folderPath, networkPath: readSharedFolderNetworkPath(), error: error.message }; }
});

ipcMain.handle("shared-folder:select", async () => {
  const result = await dialog.showOpenDialog(mainWindow, { title: "Selecionar pasta compartilhada", properties: ["openDirectory", "createDirectory"] });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  const folderPath = result.filePaths[0];
  return configureSharedFolderPath(folderPath);
});

ipcMain.handle("shared-folder:create-host", async (_event, options = {}) => {
  const password = String(options.password || "");
  if (password.length < 8) throw new Error("A senha da pasta deve ter pelo menos 8 caracteres.");
  const folderPath = "C:\\ControleSGQCompartilhado";
  await runElevatedHostSetup(folderPath, password);
  return configureSharedFolderPath(folderPath, `\\\\${os.hostname()}\\ControleSGQ`);
});

ipcMain.handle("shared-folder:test", async () => ({ ...(await inspectSharedFolder(applySharedFolderPath())), networkPath: readSharedFolderNetworkPath() }));

ipcMain.handle("shared-folder:forget", async () => {
  applySharedFolderPath("");
  await fs.promises.unlink(sharedFolderConfigPath()).catch(() => {});
  return { configured: false, accessible: false, name: "", path: "" };
});

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
}

function projectRoot() {
  return path.resolve(__dirname, "..");
}

function desktopEnvironmentPath() {
  if (!app.isPackaged) return path.join(projectRoot(), ".env.local");
  return path.join(app.getPath("userData"), ".env.local");
}

function ensureEnvironmentPath() {
  const envPath = desktopEnvironmentPath();
  if (!app.isPackaged || fs.existsSync(envPath)) return envPath;
  const examplePath = path.join(process.resourcesPath, ".env.example");
  if (fs.existsSync(examplePath)) fs.copyFileSync(examplePath, envPath);
  return envPath;
}

function createMainWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 980,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#f4f7fb",
    icon: path.join(__dirname, "icon.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (!target.startsWith(url)) shell.openExternal(target);
    return { action: "deny" };
  });
  mainWindow.webContents.session.on("will-download", (_event, item) => {
    const filename = item.getFilename() || "arquivo";
    const extension = path.extname(filename).toLowerCase();
    const directory = extension === ".json" ? "json"
      : extension === ".pdf" ? "pdfs"
        : extension === ".zip" ? "pacotes" : "exportacoes";
    const targetDirectory = path.join(process.env.APP_FILES_DIR, directory);
    fs.mkdirSync(targetDirectory, { recursive: true });
    item.setSavePath(path.join(targetDirectory, filename));
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("closed", () => { mainWindow = null; });
  mainWindow.loadURL(url);
}

async function startDesktop() {
  process.env.NODE_ENV = process.env.NODE_ENV || "desktop";
  process.env.APP_HOST = "127.0.0.1";
  process.env.PORT = "0";
  process.env.APP_ENV_FILE = ensureEnvironmentPath();
  process.env.APP_DATA_DIR = app.getPath("userData");
  process.env.APP_FILES_DIR = path.join(app.getPath("userData"), "arquivos");
  process.env.APP_SETUP_FILE = path.join(app.getPath("userData"), "setup.json");
  applySharedFolderPath();
  process.env.DATABASE_DRIVER = "sqlite";
  process.env.SQLITE_DATABASE_PATH = path.join(app.getPath("userData"), "controle-sgq.sqlite");

  try {
    await require(path.join(projectRoot(), "backend", "services", "localFiles.js")).ensureLocalDataDirectories();
    const serverModule = require(path.join(projectRoot(), "backend", "server.js"));
    backend = await serverModule.startServer({ port: 0, host: "127.0.0.1" });
    require(path.join(projectRoot(), "backend", "services", "localBackup.js")).startLocalBackupScheduler();
    createMainWindow(`${backend.url}/index.html`);
    setTimeout(() => checkForUpdates({
      currentVersion: app.getVersion(),
      ownerWindow: mainWindow,
    }), 4000);
  } catch (error) {
    console.error("Falha ao iniciar o aplicativo desktop:", error);
    await dialog.showMessageBox({
      type: "error",
      title: "Não foi possível iniciar o Controle SGQ",
      message: "O aplicativo não conseguiu iniciar o banco de dados local.",
      detail: `${error.message}\n\nVerifique os dados locais e tente novamente.`,
    });
    app.quit();
  }
}

async function closeBackend() {
  if (!backend?.server) return;
  await new Promise((resolve) => backend.server.close(resolve));
  require(path.join(projectRoot(), "backend", "services", "localBackup.js")).stopLocalBackupScheduler();
  backend = null;
}

if (gotSingleInstanceLock) {
  app.whenReady().then(startDesktop);
  app.on("window-all-closed", async () => {
    await closeBackend();
    if (process.platform !== "darwin") app.quit();
  });
  app.on("before-quit", closeBackend);
  app.on("activate", () => {
    if (!mainWindow && backend) createMainWindow(`${backend.url}/index.html`);
  });
}

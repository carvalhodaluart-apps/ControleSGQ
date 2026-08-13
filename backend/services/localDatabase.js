const fs = require("fs");
const path = require("path");
const initSqlJs = require("sql.js");

const SCHEMA_PATH = path.resolve(__dirname, "..", "database", "schema.sqlite.sql");

function getSqlWasmPath() {
  const localPath = path.resolve(__dirname, "..", "..", "node_modules", "sql.js", "dist", "sql-wasm.wasm");
  const unpackedPath = process.resourcesPath
    ? path.join(process.resourcesPath, "app.asar.unpacked", "node_modules", "sql.js", "dist", "sql-wasm.wasm")
    : null;
  return unpackedPath && fs.existsSync(unpackedPath) ? unpackedPath : localPath;
}

const WASM_PATH = getSqlWasmPath();
const JSON_COLUMNS = new Set([
  "content",
  "details",
  "document_types",
  "documentTypes",
  "sectors",
  "quality_fields",
  "qualityFields",
  "cover",
  "nonconformity",
]);

let database;
let sqlRuntime;
let inTransaction = false;

function databasePath() {
  return process.env.SQLITE_DATABASE_PATH
    || path.resolve(process.env.APP_DATA_DIR || path.resolve(__dirname, "..", "..", "data"), "controle-sgq.sqlite");
}

function getDatabase() {
  if (!database) throw new Error("Banco SQLite ainda nao foi inicializado.");
  return database;
}

function parseJsonRows(rows) {
  return rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => {
    if (!JSON_COLUMNS.has(key) || typeof value !== "string") return [key, value];
    try { return [key, JSON.parse(value)]; } catch (_error) { return [key, value]; }
  })));
}

function normalizeValue(value) {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value && typeof value === "object") return JSON.stringify(value);
  return value;
}

function translateSql(sql, params) {
  let translated = String(sql || "")
    .replace(/NOW\(\)\s*-\s*INTERVAL\s+'(\d+)\s+(seconds?|minutes?|hours?|days?)'/gi, (_match, amount, unit) => `datetime('now', '-${amount} ${unit}')`)
    .replace(/\$(\d+)::date\s*\+\s*INTERVAL\s+'1 day'/gi, (_match, index) => `datetime($${index}, '+1 day')`)
    .replace(/date_trunc\('milliseconds',\s*([^)]+)\)/gi, "$1")
    .replace(/::[a-zA-Z_][a-zA-Z0-9]*/g, "")
    .replace(/IS NOT DISTINCT FROM/gi, "IS")
    .replace(/\bNOW\(\)/gi, "CURRENT_TIMESTAMP")
    .replace(/\bILIKE\b/gi, "LIKE")
    .replace(/\bTRUE\b/gi, "1")
    .replace(/\bFALSE\b/gi, "0")
    .replace(/\s+FOR UPDATE\b/gi, "");
  const orderedParams = [];
  let hasNumberedParams = false;
  translated = translated.replace(/\$(\d+)/g, (_match, index) => {
    hasNumberedParams = true;
    orderedParams.push(normalizeValue(params[Number(index) - 1]));
    return "?";
  });
  if (!hasNumberedParams) orderedParams.push(...params.map(normalizeValue));
  return { sql: translated, params: orderedParams };
}

function runStatement(sql, params) {
  getDatabase().run(sql, params);
  return getDatabase().getRowsModified();
}

function readStatement(sql, params) {
  const statement = getDatabase().prepare(sql);
  const rows = [];
  try {
    statement.bind(params);
    while (statement.step()) rows.push(statement.getAsObject());
    return parseJsonRows(rows);
  } finally {
    statement.free();
  }
}

function persistDatabase() {
  if (!database) return;
  const filePath = databasePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, Buffer.from(database.export()));
}

function refreshSequence(sequenceTable, documentTable, prefix) {
  const rows = readStatement(`SELECT document_code FROM ${documentTable}`, []);
  const next = rows.reduce((highest, row) => Math.max(highest, Number(String(row.document_code || "").match(new RegExp(`^${prefix}(\\d+)$`))?.[1] || 0) + 1), 1);
  runStatement(`INSERT INTO ${sequenceTable} (sequence_key, next_number) VALUES (?, ?) ON CONFLICT (sequence_key) DO UPDATE SET next_number = excluded.next_number`, [prefix.replace("-", ""), next]);
  if (!inTransaction) persistDatabase();
  return { rows: [], rowCount: 1, command: "WRITE" };
}

function executeQuery(sql, params = []) {
  const source = String(sql || "").trim();
  if (/^BEGIN\b/i.test(source)) {
    const rowCount = runStatement("BEGIN", []);
    inTransaction = true;
    return { rows: [], rowCount, command: "WRITE" };
  }
  if (/^ROLLBACK\b/i.test(source)) {
    const rowCount = runStatement("ROLLBACK", []);
    inTransaction = false;
    return { rows: [], rowCount, command: "WRITE" };
  }
  if (/^COMMIT\b/i.test(source)) {
    const rowCount = runStatement("COMMIT", []);
    inTransaction = false;
    persistDatabase();
    return { rows: [], rowCount, command: "WRITE" };
  }
  const truncate = source.match(/^TRUNCATE\s+(.+?)\s+RESTART\s+IDENTITY(?:\s+CASCADE)?$/is);
  if (truncate) {
    const tables = truncate[1].split(",").map((table) => table.trim()).filter((table) => /^[a-z_][a-z0-9_]*$/i.test(table));
    for (const table of tables) runStatement(`DELETE FROM ${table}`, []);
    if (!inTransaction) persistDatabase();
    return { rows: [], rowCount: 0, command: "TRUNCATE" };
  }
  if (/^INSERT INTO action_plan_sequences[\s\S]*SUBSTRING\(document_code FROM/i.test(source)) return refreshSequence("action_plan_sequences", "action_plan_documents", "PAC-");
  if (/^INSERT INTO instrument_sequences[\s\S]*SUBSTRING\(document_code FROM/i.test(source)) return refreshSequence("instrument_sequences", "metrology_instruments", "INS-");
  if (/pg_get_serial_sequence|\bsetval\s*\(/i.test(source)) return { rows: [], rowCount: 1, command: "SELECT" };
  const translated = translateSql(source, params);
  const isRead = /^(SELECT|WITH|PRAGMA|EXPLAIN)\b/i.test(translated.sql) || /\bRETURNING\b/i.test(translated.sql);
  if (isRead) {
    const rows = readStatement(translated.sql, translated.params);
    return { rows, rowCount: rows.length, command: "SELECT" };
  }
  const rowCount = runStatement(translated.sql, translated.params);
  if (!inTransaction) persistDatabase();
  const lastInsertId = readStatement("SELECT last_insert_rowid() AS lastInsertId", [])[0]?.lastInsertId;
  return { rows: [], rowCount, command: "WRITE", lastInsertId };
}

function createClient() {
  return { query: (sql, params) => executeQuery(sql, params), release: () => {} };
}

function getLocalDatabasePool() {
  getDatabase();
  return { query: (sql, params) => executeQuery(sql, params), connect: async () => createClient(), end: () => closeLocalDatabase() };
}

async function initLocalDatabase() {
  if (!sqlRuntime) sqlRuntime = await initSqlJs({ locateFile: () => WASM_PATH });
  const filePath = databasePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const data = fs.existsSync(filePath) ? fs.readFileSync(filePath) : null;
  database = data ? new sqlRuntime.Database(data) : new sqlRuntime.Database();
  database.run(fs.readFileSync(SCHEMA_PATH, "utf8"));
  inTransaction = false;
  persistDatabase();
  return { path: filePath };
}

function closeLocalDatabase() {
  if (!database) return;
  if (inTransaction) {
    database.run("ROLLBACK");
    inTransaction = false;
  }
  persistDatabase();
  database.close();
  database = null;
}

module.exports = { closeLocalDatabase, databasePath, getLocalDatabasePool, initLocalDatabase };

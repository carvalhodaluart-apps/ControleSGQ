const path = require("path");

// Keep the standalone local command aligned with the Electron desktop mode.
process.env.DATABASE_DRIVER = process.env.DATABASE_DRIVER || "sqlite";
process.env.SQLITE_DATABASE_PATH = process.env.SQLITE_DATABASE_PATH
  || path.resolve(process.env.APP_DATA_DIR || path.join(__dirname, "..", "dados_locais"), "controle-sgq.sqlite");

const { startServer } = require(path.join(__dirname, "..", "backend", "server.js"));

startServer().catch(() => { process.exitCode = 1; });

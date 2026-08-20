const fs = require("fs");
const path = require("path");

function loadLocalEnvironment() {
  if (process.env.RENDER || process.env.NODE_ENV === "production") return;

  const envPath = process.env.APP_ENV_FILE || path.resolve(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || Object.prototype.hasOwnProperty.call(process.env, match[1])) continue;

    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

loadLocalEnvironment();

const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const procedureRoutes = require("./routes/procedures");
const configurationRoutes = require("./routes/configuration");
const adminRoutes = require("./routes/admin");
const nonconformityRoutes = require("./routes/nonconformities");
const actionPlanRoutes = require("./routes/actionPlans");
const instrumentRoutes = require("./routes/instruments");
const { initDatabase } = require("./services/procedureDatabase");
const { assertSessionSecret } = require("./services/procedureAuth");
const { publicErrorMessage } = require("./services/httpResponse");

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.APP_HOST || (process.env.RENDER ? "0.0.0.0" : "127.0.0.1");
const FRONTEND_DIR = path.resolve(__dirname, "..", "frontend");

if (process.env.RENDER || process.env.TRUST_PROXY === "true") app.set("trust proxy", 1);

const qualityAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Muitas tentativas de autenticacao. Aguarde alguns minutos." },
});
const heavyApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 12,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Muitas solicitacoes pesadas. Aguarde alguns instantes." },
});
const adminActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Muitas acoes administrativas. Aguarde alguns minutos." },
});
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 240,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Muitas solicita\u00e7\u00f5es. Aguarde alguns instantes." },
});

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      frameSrc: ["'self'", "blob:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
    },
  },
}));
app.use("/api/procedures/auth", express.json({ limit: process.env.AUTH_JSON_BODY_LIMIT || "32kb" }));
app.use("/api/procedures", express.json({ limit: process.env.PROCEDURE_JSON_BODY_LIMIT || "100mb" }));
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "50mb" }));
app.use("/api", apiLimiter);
app.use("/api/procedures/auth", qualityAuthLimiter);
app.use(["/api/procedures/export-pdf", "/api/procedures/export-bundle"], heavyApiLimiter);
app.use(["/api/admin/backup", "/api/admin/restore"], adminActionLimiter);
app.use("/api/procedures", procedureRoutes);
app.use("/api/configuration", configurationRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/nonconformities", nonconformityRoutes);
app.use("/api/action-plans", actionPlanRoutes);
app.use("/api/instruments", instrumentRoutes);
app.use("/api", (_req, res) => res.status(404).json({ error: "Rota da API n\u00e3o encontrada." }));

app.use((error, _req, res, next) => {
  if (res.headersSent) return next(error);
  res.status(error.status || 500).json({ error: publicErrorMessage(error) });
});

app.use(express.static(FRONTEND_DIR));

app.get("*", (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

async function startServer({ port = PORT, host = HOST } = {}) {
  try {
    assertSessionSecret();
    await initDatabase();
    const server = await new Promise((resolve, reject) => {
      const instance = app.listen(port, host, () => resolve(instance));
      instance.once("error", reject);
    });
    const address = server.address();
    const actualPort = typeof address === "object" && address ? address.port : port;
    console.log(`Criador de procedimentos rodando em http://${host}:${actualPort}`);
    return { app, server, host, port: actualPort, url: `http://${host}:${actualPort}` };
  } catch (error) {
    console.error(`Não foi possível iniciar o banco local: ${error.message}`);
    throw error;
  }
}

if (require.main === module) {
  startServer().catch(() => { process.exitCode = 1; });
}

module.exports = { app, startServer };

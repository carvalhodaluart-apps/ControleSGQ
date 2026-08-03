const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const procedureRoutes = require("./routes/procedures");
const configurationRoutes = require("./routes/configuration");
const adminRoutes = require("./routes/admin");
const nonconformityRoutes = require("./routes/nonconformities");
const actionPlanRoutes = require("./routes/actionPlans");
const instrumentRoutes = require("./routes/instruments");
const { initDatabase } = require("./services/procedureDatabase");

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.APP_HOST || (process.env.RENDER ? "0.0.0.0" : "127.0.0.1");
const FRONTEND_DIR = path.resolve(__dirname, "..", "frontend");
const qualityAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Muitas tentativas de autenticação. Aguarde alguns minutos." },
});

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "25mb" }));
app.use("/api/procedures/auth", qualityAuthLimiter);
app.use("/api/procedures", procedureRoutes);
app.use("/api/configuration", configurationRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/nonconformities", nonconformityRoutes);
app.use("/api/action-plans", actionPlanRoutes);
app.use("/api/instruments", instrumentRoutes);

app.use((error, _req, res, next) => {
  if (res.headersSent) return next(error);
  res.status(error.status || 500).json({ error: error.message || "Erro interno." });
});

app.use(express.static(FRONTEND_DIR));

app.get("*", (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

async function startServer() {
  try {
    await initDatabase();
    app.listen(PORT, HOST, () => {
      console.log(`Criador de procedimentos rodando em http://${HOST}:${PORT}`);
    });
  } catch (error) {
    console.error(`Não foi possível iniciar o PostgreSQL: ${error.message}`);
    process.exitCode = 1;
  }
}

startServer();

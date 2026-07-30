const express = require("express");
const path = require("path");
const procedureRoutes = require("./routes/procedures");
const { initDatabase } = require("./services/procedureDatabase");

const app = express();
const PORT = process.env.PORT || 3000;
const FRONTEND_DIR = path.resolve(__dirname, "..", "frontend");

app.use(express.json({ limit: "100mb" }));
app.use("/api/procedures", procedureRoutes);
app.use(express.static(FRONTEND_DIR));

app.get("*", (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

async function startServer() {
  try {
    await initDatabase();
    app.listen(PORT, () => {
      console.log(`Criador de procedimentos rodando em http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error(`Não foi possível iniciar o PostgreSQL: ${error.message}`);
    process.exitCode = 1;
  }
}

startServer();

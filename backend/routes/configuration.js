const express = require("express");
const { requireQuality } = require("../services/procedureAuth");
const {
  getProcedureConfiguration,
  saveProcedureConfiguration,
} = require("../services/procedureConfiguration");

const router = express.Router();

function handleError(res, error) {
  res.status(error.status || 500).json({ error: error.message || "Erro interno." });
}

router.get("/", requireQuality, async (_req, res) => {
  try {
    res.json({ configuration: await getProcedureConfiguration() });
  } catch (error) {
    handleError(res, error);
  }
});

router.put("/", requireQuality, async (req, res) => {
  try {
    res.json({ configuration: await saveProcedureConfiguration(req.body?.configuration || req.body) });
  } catch (error) {
    handleError(res, error);
  }
});

module.exports = router;

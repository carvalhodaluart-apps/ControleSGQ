const express = require("express");
const { getRequestUser, requireProcedureEditor, requireQuality } = require("../services/procedureAuth");
const { recordAudit } = require("../services/procedureAudit");
const {
  getProcedureConfiguration,
  saveProcedureConfiguration,
} = require("../services/procedureConfiguration");

const router = express.Router();

function handleError(res, error) {
  res.status(error.status || 500).json({ error: error.message || "Erro interno." });
}

router.get("/", requireProcedureEditor, async (_req, res) => {
  try {
    res.json({ configuration: await getProcedureConfiguration() });
  } catch (error) {
    handleError(res, error);
  }
});

router.put("/", requireQuality, async (req, res) => {
  try {
    const configuration = await saveProcedureConfiguration(req.body?.configuration || req.body);
    await recordAudit({ action: "configuration-updated", user: getRequestUser(req) });
    res.json({ configuration });
  } catch (error) {
    handleError(res, error);
  }
});

module.exports = router;

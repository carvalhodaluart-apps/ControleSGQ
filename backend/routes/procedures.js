const express = require("express");
const {
  createBlankProcedure,
  getPublicationDate,
  normalizeProcedure,
  STATUS_DRAFT,
  STATUS_PUBLISHED,
} = require("../services/procedureRules");
const { createQualitySession, requireQuality } = require("../services/procedureAuth");
const { deleteProcedure, loadProcedure, saveProcedure, storageExists } = require("../services/procedureStorage");
const { createProcedurePdf } = require("../services/procedurePdf");
const { createProcedureBundle } = require("../services/procedureBundle");

const router = express.Router();

function handleError(res, error) {
  res.status(error.status || 500).json({ error: error.message || "Erro interno." });
}

function getProcedureBody(req) {
  return req.body?.procedure || req.body;
}

function createProcedureId() {
  return `rascunho-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function markStatus(procedure, status) {
  procedure.documentStatus = status;
  procedure.qualityInfo.status = status;
  if (status !== STATUS_PUBLISHED) procedure.qualityInfo.approvalDate = "";
  return procedure;
}

router.get("/health", (_req, res) => {
  res.json({ ok: true, storage: storageExists() ? "files" : "files-not-created" });
});

router.post("/auth/quality", (req, res) => {
  try {
    res.json(createQualitySession(req.body?.password));
  } catch (error) {
    handleError(res, error);
  }
});

router.post("/new", async (req, res) => {
  try {
    const procedure = createBlankProcedure({ ...(req.body || {}), procedureId: createProcedureId() });
    await saveProcedure(procedure);
    res.status(201).json({ procedure });
  } catch (error) {
    handleError(res, error);
  }
});

router.post("/import", async (req, res) => {
  try {
    const procedure = normalizeProcedure(getProcedureBody(req));
    procedure.procedureId = procedure.procedureId || createProcedureId();
    markStatus(procedure, STATUS_DRAFT);
    await saveProcedure(procedure);
    res.status(201).json({ procedure });
  } catch (error) {
    handleError(res, error);
  }
});

router.get("/load", requireQuality, async (req, res) => {
  try {
    const stored = await loadProcedure(req.query.id);
    if (!stored) return res.status(404).json({ error: "Procedimento não encontrado." });
    res.json({ procedure: normalizeProcedure(stored) });
  } catch (error) {
    handleError(res, error);
  }
});

router.post("/save", requireQuality, async (req, res) => {
  try {
    const procedure = markStatus(normalizeProcedure(getProcedureBody(req)), STATUS_DRAFT);
    await saveProcedure(procedure);
    res.json({ ok: true, procedure });
  } catch (error) {
    handleError(res, error);
  }
});

router.post("/publish", requireQuality, async (req, res) => {
  try {
    const procedure = markStatus(normalizeProcedure(getProcedureBody(req)), STATUS_PUBLISHED);
    procedure.qualityInfo.approvalDate = getPublicationDate();
    await saveProcedure(procedure);
    res.json({ ok: true, procedure });
  } catch (error) {
    handleError(res, error);
  }
});

router.delete("/delete", requireQuality, async (req, res) => {
  try {
    await deleteProcedure(req.query.id || req.body?.procedureId);
    res.json({ ok: true });
  } catch (error) {
    handleError(res, error);
  }
});

router.post("/export-json", requireQuality, (req, res) => {
  try {
    res.json({ procedure: normalizeProcedure(getProcedureBody(req)) });
  } catch (error) {
    handleError(res, error);
  }
});

router.post("/export-pdf", requireQuality, async (req, res) => {
  try {
    const procedure = normalizeProcedure(getProcedureBody(req));
    const pdf = await createProcedurePdf(procedure);
    const filename = `${procedure.documentCode || procedure.equipmentCode || "procedimento"}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(pdf);
  } catch (error) {
    handleError(res, error);
  }
});

router.post("/export-bundle", requireQuality, async (req, res) => {
  try {
    const procedure = normalizeProcedure(getProcedureBody(req));
    if (procedure.documentStatus !== STATUS_PUBLISHED) {
      return res.status(400).json({ error: "O pacote só pode ser gerado para um procedimento publicado." });
    }
    const pdf = await createProcedurePdf(procedure);
    const bundle = createProcedureBundle(procedure, pdf);
    const filename = `${procedure.documentCode || procedure.equipmentCode || "procedimento"}.zip`;
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(bundle);
  } catch (error) {
    return handleError(res, error);
  }
});

module.exports = router;

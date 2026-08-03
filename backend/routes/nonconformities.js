const express = require("express");
const { getRequestUser, requireManager, requireProcedureEditor } = require("../services/procedureAuth");
const { recordAudit } = require("../services/procedureAudit");
const { createBlankNonconformity, validateNonconformity } = require("../services/nonconformityRules");
const { createNonconformity, deleteNonconformity, getNonconformity, listNonconformities, updateNonconformity } = require("../services/nonconformityDatabase");
const { createNonconformityPdf } = require("../services/nonconformityPdf");
const { getProcedureConfiguration } = require("../services/procedureConfiguration");

const router = express.Router();

function handleError(res, error) {
  res.status(error.status || 500).json({ error: error.message || "Erro interno." });
}

router.get("/", requireProcedureEditor, async (_req, res) => {
  try { res.json({ nonconformities: await listNonconformities() }); } catch (error) { handleError(res, error); }
});

router.get("/new", requireProcedureEditor, (req, res) => {
  res.json({ nonconformity: createBlankNonconformity(getRequestUser(req).displayName) });
});

router.get("/configuration", requireProcedureEditor, async (_req, res) => {
  try {
    const configuration = await getProcedureConfiguration();
    res.json({ configuration: configuration.nonconformity });
  } catch (error) { handleError(res, error); }
});

router.get("/:id/pdf", requireProcedureEditor, async (req, res) => {
  try {
    const nonconformity = await getNonconformity(req.params.id);
    if (!nonconformity) return res.status(404).json({ error: "Não conformidade não encontrada." });
    const pdf = await createNonconformityPdf({
      ...nonconformity,
      generatedAt: new Date().toISOString().slice(0, 10),
      generatedBy: getRequestUser(req).displayName,
    }, await getProcedureConfiguration());
    const filename = `${nonconformity.documentCode || "nao-conformidade"}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(pdf);
  } catch (error) { handleError(res, error); }
});

router.get("/:id", requireProcedureEditor, async (req, res) => {
  try {
    const nonconformity = await getNonconformity(req.params.id);
    if (!nonconformity) return res.status(404).json({ error: "Não conformidade não encontrada." });
    res.json({ nonconformity });
  } catch (error) { handleError(res, error); }
});

router.post("/", requireProcedureEditor, async (req, res) => {
  try {
    const settings = (await getProcedureConfiguration()).nonconformity;
    const options = { origins: settings.origins.filter((item) => item.active).map((item) => item.label), sections: settings.sections.filter((item) => item.active).map((item) => item.key), maxEvidenceImages: settings.maxEvidenceImages };
    const content = validateNonconformity(req.body?.nonconformity || req.body, options);
    const nonconformity = await createNonconformity(content, getRequestUser(req));
    await recordAudit({ action: "nonconformity-created", user: getRequestUser(req), details: { documentCode: nonconformity.documentCode } });
    res.status(201).json({ nonconformity });
  } catch (error) { handleError(res, error); }
});

router.put("/:id", requireProcedureEditor, async (req, res) => {
  try {
    const settings = (await getProcedureConfiguration()).nonconformity;
    const options = { origins: settings.origins.filter((item) => item.active).map((item) => item.label), sections: settings.sections.filter((item) => item.active).map((item) => item.key), maxEvidenceImages: settings.maxEvidenceImages };
    const content = validateNonconformity({ ...(req.body?.nonconformity || req.body), nonconformityId: req.params.id }, options);
    const nonconformity = await updateNonconformity(req.params.id, content, getRequestUser(req));
    await recordAudit({ action: "nonconformity-updated", user: getRequestUser(req), details: { documentCode: nonconformity.documentCode, status: nonconformity.status } });
    res.json({ nonconformity });
  } catch (error) { handleError(res, error); }
});

router.delete("/:id", requireManager, async (req, res) => {
  try {
    await deleteNonconformity(req.params.id);
    await recordAudit({ action: "nonconformity-deleted", user: getRequestUser(req), details: { nonconformityId: req.params.id } });
    res.json({ ok: true });
  } catch (error) { handleError(res, error); }
});

module.exports = router;

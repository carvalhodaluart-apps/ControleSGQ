const express = require("express");
const { getRequestUser, requireManager, requireProcedureEditor } = require("../services/procedureAuth");
const { recordAudit } = require("../services/procedureAudit");
const { createBlankNonconformity, validateNonconformity } = require("../services/nonconformityRules");
const { createNonconformity, deleteNonconformity, getNonconformity, listNonconformities, updateNonconformity } = require("../services/nonconformityDatabase");
const { createNonconformityPdf } = require("../services/nonconformityPdf");
const { getProcedureConfiguration } = require("../services/procedureConfiguration");
const { sendError } = require("../services/httpResponse");
const sharedStorage = require("../services/sharedProcedureStorage");

const router = express.Router();

function handleError(res, error) {
  sendError(res, error);
}

async function assertSharedLock(req, id) {
  if (sharedStorage.isConfigured()) await sharedStorage.assertModuleLock("nao-conformidades", id, getRequestUser(req), req.get("X-Module-Lock"));
}

router.get("/", requireProcedureEditor, async (_req, res) => {
  try { res.json({ nonconformities: await listNonconformities() }); } catch (error) { handleError(res, error); }
});

router.get("/new", requireProcedureEditor, (req, res) => {
  res.json({ nonconformity: createBlankNonconformity(getRequestUser(req).displayName) });
});

router.post("/:id/lock", requireProcedureEditor, async (req, res) => {
  try { res.json(await sharedStorage.acquireModuleLock("nao-conformidades", req.params.id, getRequestUser(req))); } catch (error) { handleError(res, error); }
});
router.post("/:id/lock/heartbeat", requireProcedureEditor, async (req, res) => {
  try { res.json(await sharedStorage.refreshModuleLock("nao-conformidades", req.params.id, getRequestUser(req), req.get("X-Module-Lock"))); } catch (error) { handleError(res, error); }
});
router.delete("/:id/lock", requireProcedureEditor, async (req, res) => {
  try { res.json(await sharedStorage.releaseModuleLock("nao-conformidades", req.params.id, getRequestUser(req), req.get("X-Module-Lock"))); } catch (error) { handleError(res, error); }
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
    await assertSharedLock(req, req.params.id);
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
    await assertSharedLock(req, req.params.id);
    await deleteNonconformity(req.params.id);
    await recordAudit({ action: "nonconformity-deleted", user: getRequestUser(req), details: { nonconformityId: req.params.id } });
    res.json({ ok: true });
  } catch (error) { handleError(res, error); }
});

module.exports = router;

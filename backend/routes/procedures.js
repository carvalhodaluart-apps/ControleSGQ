const express = require("express");
const {
  createBlankProcedure,
  getPublicationDate,
  hasProcedureContent,
  normalizeProcedure,
  STATUS_DRAFT,
  STATUS_PUBLISHED,
  validateProcedurePayload,
} = require("../services/procedureRules");
const { createQualitySession, createUserSession, getRequestUser, requireProcedureEditor, requireQuality } = require("../services/procedureAuth");
const { recordAudit } = require("../services/procedureAudit");
const { deleteProcedure, loadProcedure, saveProcedure, storageExists } = require("../services/procedureStorage");
const { createProcedurePdf } = require("../services/procedurePdf");
const { createProcedureBundle } = require("../services/procedureBundle");
const { getProcedureConfiguration } = require("../services/procedureConfiguration");
const { sendError } = require("../services/httpResponse");
const {
  databaseConfigured,
  deleteMasterDocument,
  getDatabasePool,
  getMasterDocument,
  listDraftDocuments,
  listMasterDocuments,
  rememberDocumentNumberReservation,
  reserveDocumentNumberForProcedure,
  updateMasterDocumentLocations,
  upsertMasterDocument,
} = require("../services/procedureDatabase");

const router = express.Router();

function handleError(res, error) {
  sendError(res, error);
}

function getProcedureBody(req) {
  return validateProcedurePayload(req.body?.procedure || req.body);
}

function createProcedureId() {
  return `rascunho-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function getSectorPrefix(procedure) {
  return String(procedure.documentCodeMiddle || "").match(/^[A-Z]+/)?.[0] || "";
}

function getMasterSectorPrefix(master) {
  return String(master?.documentCode || "").split("_")[1]?.match(/^[A-Z]+/)?.[0] || "";
}

async function ensureDocumentNumber(procedure) {
  const documentType = procedure.qualityInfo.documentType;
  const sector = procedure.qualityInfo.area;
  const master = await getMasterDocument(procedure.procedureId);
  const sameClassification = master
    && master.documentType === documentType
    && master.sector === sector
    && getMasterSectorPrefix(master) === getSectorPrefix(procedure);
  if (master && Number(master.documentNumber) > 0) {
    await rememberDocumentNumberReservation(
      procedure.procedureId,
      master.documentType,
      master.sector,
      getMasterSectorPrefix(master),
      master.documentNumber,
    );
  }
  if (sameClassification && Number(master.documentNumber) > 0) {
    procedure.documentNumber = String(master.documentNumber);
    return;
  }
  if (!master && Number(procedure.documentNumber) > 0 && !String(procedure.procedureId || "").startsWith("rascunho-")) return;
  procedure.documentNumber = await reserveDocumentNumberForProcedure(
    procedure.procedureId,
    documentType,
    sector,
    getSectorPrefix(procedure),
  );
}

function markStatus(procedure, status) {
  procedure.documentStatus = status;
  procedure.qualityInfo.status = status;
  if (status !== STATUS_PUBLISHED) procedure.qualityInfo.approvalDate = "";
  return procedure;
}

router.get("/health", async (_req, res) => {
  try {
    if (databaseConfigured()) await getDatabasePool().query("SELECT 1");
    res.json({ ok: true, storage: storageExists() ? "files" : "files-not-created", database: databaseConfigured() ? "postgresql" : "not-configured" });
  } catch (error) {
    res.status(503).json({ ok: false, error: "Banco de dados indisponível." });
  }
});

router.get("/session", requireProcedureEditor, (req, res) => {
  res.json({ user: getRequestUser(req) });
});

router.post("/auth/quality", (req, res) => {
  try {
    res.json(createQualitySession(req.body?.password));
  } catch (error) {
    handleError(res, error);
  }
});

router.post("/auth/user", async (req, res) => {
  try {
    res.json(await createUserSession(req.body?.username, req.body?.password));
  } catch (error) {
    handleError(res, error);
  }
});

router.post("/new", requireProcedureEditor, async (req, res) => {
  try {
    validateProcedurePayload(req.body || {});
    const procedure = createBlankProcedure({ ...(req.body || {}), procedureId: createProcedureId() });
    normalizeProcedure(procedure);
    res.status(201).json({ procedure });
  } catch (error) {
    handleError(res, error);
  }
});

router.get("/drafts", requireProcedureEditor, async (_req, res) => {
  try {
    res.json({ drafts: await listDraftDocuments() });
  } catch (error) {
    handleError(res, error);
  }
});

async function validateElaborationAuthorization(procedure) {
  const missing = [];
  if (!procedure.title || procedure.title === "Novo procedimento") missing.push("nome do procedimento");
  if (!procedure.equipmentCode || procedure.equipmentCode === "NOVO") missing.push("equipamento");
  if (!procedure.qualityInfo?.documentType) missing.push("tipo de documento");
  if (!procedure.qualityInfo?.area) missing.push("setor");
  const configuration = await getProcedureConfiguration();
  configuration.qualityFields.filter((field) => field.active).forEach((field) => {
    if (!String(procedure.qualityInfo?.[field.key] || "").trim()) missing.push(field.label.toLowerCase());
  });
  if (missing.length) {
    const error = new Error(`Preencha ${missing.join(", ")} antes de autorizar a elaboração.`);
    error.status = 400;
    throw error;
  }
}

router.post("/authorize", requireProcedureEditor, async (req, res) => {
  try {
    const procedure = normalizeProcedure(getProcedureBody(req));
    await validateElaborationAuthorization(procedure);
    procedure.elaborationAuthorized = true;
    markStatus(procedure, STATUS_DRAFT);
    await ensureDocumentNumber(procedure);
    normalizeProcedure(procedure);
    await saveProcedure(procedure);
    await upsertMasterDocument(procedure);
    await recordAudit({ procedureId: procedure.procedureId, action: "elaboration-authorized", user: getRequestUser(req) });
    res.status(201).json({ ok: true, procedure });
  } catch (error) {
    handleError(res, error);
  }
});

function sameDraftIdentity(expected, received) {
  const expectedCode = String(expected.documentCode || "").trim().toUpperCase();
  const receivedCode = String(received.documentCode || "").trim().toUpperCase();
  return Boolean(expectedCode) && expectedCode === receivedCode;
}

router.post("/continue", requireProcedureEditor, async (req, res) => {
  try {
    const draftProcedureId = String(req.body?.draftProcedureId || "").trim();
    const received = normalizeProcedure(validateProcedurePayload(req.body?.procedure));
    const stored = await loadProcedure(draftProcedureId);
    const expected = stored ? normalizeProcedure(stored) : null;
    if (!expected || expected.documentStatus !== STATUS_DRAFT || expected.elaborationAuthorized !== true) {
      const error = new Error("Documento em elaboração não encontrado ou não autorizado.");
      error.status = 404;
      throw error;
    }
    if (!sameDraftIdentity(expected, received)) {
      const error = new Error("Este JSON não pertence ao documento em elaboração selecionado.");
      error.status = 400;
      throw error;
    }
    received.procedureId = expected.procedureId;
    received.elaborationAuthorized = true;
    markStatus(received, STATUS_DRAFT);
    await saveProcedure(received);
    await upsertMasterDocument(received);
    await recordAudit({ procedureId: received.procedureId, action: "draft-continued", user: getRequestUser(req) });
    res.json({ ok: true, procedure: received });
  } catch (error) {
    handleError(res, error);
  }
});

router.post("/next-number", requireProcedureEditor, async (req, res) => {
  try {
    const procedureId = String(req.body?.procedureId || "").trim();
    const documentType = String(req.body?.documentType || "Instrução de trabalho");
    const sector = String(req.body?.sector || "Produção");
    const sectorPrefix = String(req.body?.sectorPrefix || "").trim().toUpperCase();
    if (!procedureId) return res.status(400).json({ error: "Identificador do procedimento obrigatório." });
    const master = await getMasterDocument(procedureId);
    const sameClassification = master
      && master.documentType === documentType
      && master.sector === sector
      && getMasterSectorPrefix(master) === sectorPrefix
      && Number(master.documentNumber) > 0;
    const documentNumber = sameClassification
      ? String(master.documentNumber).padStart(4, "0")
      : await reserveDocumentNumberForProcedure(procedureId, documentType, sector, sectorPrefix);
    if (sameClassification) {
      await rememberDocumentNumberReservation(procedureId, documentType, sector, sectorPrefix, master.documentNumber);
    }
    res.json({ documentNumber });
  } catch (error) {
    handleError(res, error);
  }
});

router.post("/import", requireProcedureEditor, async (req, res) => {
  try {
    const procedure = normalizeProcedure(getProcedureBody(req));
    procedure.procedureId = procedure.procedureId || createProcedureId();
    procedure.elaborationAuthorized = true;
    markStatus(procedure, STATUS_DRAFT);
    if (hasProcedureContent(procedure)) {
      await ensureDocumentNumber(procedure);
      normalizeProcedure(procedure);
    }
    await saveProcedure(procedure);
    if (hasProcedureContent(procedure)) await upsertMasterDocument(procedure);
    await recordAudit({ procedureId: procedure.procedureId, action: "imported", user: getRequestUser(req) });
    res.status(201).json({ procedure });
  } catch (error) {
    handleError(res, error);
  }
});

router.get("/load", requireProcedureEditor, async (req, res) => {
  try {
    const stored = await loadProcedure(req.query.id);
    if (!stored) return res.status(404).json({ error: "Procedimento não encontrado." });
    res.json({ procedure: normalizeProcedure(stored) });
  } catch (error) {
    handleError(res, error);
  }
});

router.get("/master", requireProcedureEditor, async (_req, res) => {
  try {
    res.json({ documents: await listMasterDocuments() });
  } catch (error) {
    handleError(res, error);
  }
});

router.patch("/master/locations", requireQuality, async (req, res) => {
  try {
    const procedureId = String(req.body?.procedureId || "").trim();
    if (!procedureId) return res.status(400).json({ error: "Identificador do documento é obrigatório." });
    const locations = {
      documentOriginalLocation: String(req.body?.documentOriginalLocation || "").trim().slice(0, 1000),
      documentPublicLocation: String(req.body?.documentPublicLocation || "").trim().slice(0, 1000),
    };
    const document = await updateMasterDocumentLocations(procedureId, locations);
    await recordAudit({ procedureId, action: "locations-updated", user: getRequestUser(req), details: locations });
    res.json({ document });
  } catch (error) {
    handleError(res, error);
  }
});

router.post("/save", requireProcedureEditor, async (req, res) => {
  try {
    const procedure = markStatus(normalizeProcedure(getProcedureBody(req)), STATUS_DRAFT);
    const hasContent = hasProcedureContent(procedure);
    if (hasContent) {
      await ensureDocumentNumber(procedure);
      normalizeProcedure(procedure);
    }
    await saveProcedure(procedure);
    if (hasContent) await upsertMasterDocument(procedure);
    else await deleteMasterDocument(procedure.procedureId);
    await recordAudit({ procedureId: procedure.procedureId, action: "saved", user: getRequestUser(req), details: { hasContent } });
    res.json({ ok: true, procedure });
  } catch (error) {
    handleError(res, error);
  }
});

router.post("/publish", requireQuality, async (req, res) => {
  try {
    const procedure = markStatus(normalizeProcedure(getProcedureBody(req)), STATUS_PUBLISHED);
    if (!hasProcedureContent(procedure)) return res.status(400).json({ error: "Preencha o procedimento antes de publicar." });
    await ensureDocumentNumber(procedure);
    normalizeProcedure(procedure);
    procedure.qualityInfo.approvalDate = getPublicationDate();
    await saveProcedure(procedure);
    await upsertMasterDocument(procedure);
    await recordAudit({ procedureId: procedure.procedureId, action: "published", user: getRequestUser(req), details: { approvalDate: procedure.qualityInfo.approvalDate } });
    res.json({ ok: true, procedure });
  } catch (error) {
    handleError(res, error);
  }
});

router.delete("/delete", requireQuality, async (req, res) => {
  try {
    const procedureId = String(req.query.id || req.body?.procedureId || "").trim();
    if (!procedureId) return res.status(400).json({ error: "Identificador do procedimento obrigat\u00f3rio." });
    await deleteProcedure(procedureId);
    await deleteMasterDocument(procedureId);
    await recordAudit({ procedureId, action: "deleted", user: getRequestUser(req) });
    res.json({ ok: true });
  } catch (error) {
    handleError(res, error);
  }
});

router.post("/export-json", requireProcedureEditor, (req, res) => {
  try {
    res.json({ procedure: normalizeProcedure(getProcedureBody(req)) });
  } catch (error) {
    handleError(res, error);
  }
});

router.post("/export-pdf", requireProcedureEditor, async (req, res) => {
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
    const requestedProcedure = normalizeProcedure(getProcedureBody(req));
    const storedProcedure = await loadProcedure(requestedProcedure.procedureId);
    if (!storedProcedure) return res.status(404).json({ error: "Procedimento nao encontrado." });
    const procedure = normalizeProcedure(storedProcedure);
    if (procedure.documentStatus !== STATUS_PUBLISHED) {
      return res.status(400).json({ error: "O pacote so pode ser gerado para um procedimento publicado." });
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

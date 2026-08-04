const express = require("express");
const { getRequestUser, requireManager, requireProcedureEditor } = require("../services/procedureAuth");
const { recordAudit } = require("../services/procedureAudit");
const { createBlankInstrument, validateInstrument } = require("../services/instrumentRules");
const { createInstrument, deleteInstrument, getInstrument, listInstruments, updateInstrument } = require("../services/instrumentDatabase");
const { createInstrumentPdf } = require("../services/instrumentPdf");
const { getProcedureConfiguration } = require("../services/procedureConfiguration");
const { sendError } = require("../services/httpResponse");

const router = express.Router();
function handleError(res, error) { sendError(res, error); }
router.get("/", requireProcedureEditor, async (_req, res) => { try { res.json({ instruments: await listInstruments() }); } catch (error) { handleError(res, error); } });
router.get("/new", requireProcedureEditor, (req, res) => res.json({ instrument: createBlankInstrument(getRequestUser(req).displayName) }));
router.get("/:id/pdf", requireProcedureEditor, async (req, res) => { try { const instrument = await getInstrument(req.params.id); if (!instrument) return res.status(404).json({ error: "Instrumento não encontrado." }); const pdf = await createInstrumentPdf(instrument, await getProcedureConfiguration()); res.setHeader("Content-Type", "application/pdf"); res.setHeader("Content-Disposition", `inline; filename="${instrument.documentCode || "instrumento"}.pdf"`); res.setHeader("Cache-Control", "no-store"); res.send(pdf); } catch (error) { handleError(res, error); } });
router.get("/:id", requireProcedureEditor, async (req, res) => { try { const instrument = await getInstrument(req.params.id); if (!instrument) return res.status(404).json({ error: "Instrumento não encontrado." }); res.json({ instrument }); } catch (error) { handleError(res, error); } });
router.post("/", requireProcedureEditor, async (req, res) => { try { const instrument = await createInstrument(validateInstrument(req.body?.instrument || req.body), getRequestUser(req)); await recordAudit({ procedureId: instrument.instrumentId, action: "instrument-created", user: getRequestUser(req), details: { documentCode: instrument.documentCode } }); res.status(201).json({ instrument }); } catch (error) { handleError(res, error); } });
router.put("/:id", requireProcedureEditor, async (req, res) => { try { const instrument = await updateInstrument(req.params.id, validateInstrument({ ...(req.body?.instrument || req.body), instrumentId: req.params.id }), getRequestUser(req)); await recordAudit({ procedureId: instrument.instrumentId, action: "instrument-updated", user: getRequestUser(req), details: { documentCode: instrument.documentCode, situation: instrument.situation } }); res.json({ instrument }); } catch (error) { handleError(res, error); } });
router.delete("/:id", requireManager, async (req, res) => { try { await deleteInstrument(req.params.id); await recordAudit({ procedureId: req.params.id, action: "instrument-deleted", user: getRequestUser(req) }); res.json({ ok: true }); } catch (error) { handleError(res, error); } });
module.exports = router;

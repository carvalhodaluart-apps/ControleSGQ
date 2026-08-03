const express = require("express");
const { getRequestUser, requireManager, requireProcedureEditor } = require("../services/procedureAuth");
const { recordAudit } = require("../services/procedureAudit");
const { createBlankActionPlan, validateActionPlan } = require("../services/actionPlanRules");
const { createActionPlan, deleteActionPlan, getActionPlan, listActionPlans, updateActionPlan } = require("../services/actionPlanDatabase");
const { createActionPlanPdf } = require("../services/actionPlanPdf");
const { getProcedureConfiguration } = require("../services/procedureConfiguration");

const router = express.Router();

function handleError(res, error) { res.status(error.status || 500).json({ error: error.message || "Erro interno." }); }

router.get("/", requireProcedureEditor, async (_req, res) => {
  try { res.json({ plans: await listActionPlans() }); } catch (error) { handleError(res, error); }
});

router.get("/new", requireProcedureEditor, (req, res) => {
  res.json({ plan: createBlankActionPlan(getRequestUser(req).displayName) });
});

router.get("/:id/pdf", requireProcedureEditor, async (req, res) => {
  try {
    const plan = await getActionPlan(req.params.id);
    if (!plan) return res.status(404).json({ error: "Plano de ação não encontrado." });
    const pdf = await createActionPlanPdf(plan, await getProcedureConfiguration());
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${plan.documentCode || "plano-de-acao"}.pdf"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(pdf);
  } catch (error) { handleError(res, error); }
});

router.get("/:id", requireProcedureEditor, async (req, res) => {
  try {
    const plan = await getActionPlan(req.params.id);
    if (!plan) return res.status(404).json({ error: "Plano de ação não encontrado." });
    res.json({ plan });
  } catch (error) { handleError(res, error); }
});

router.post("/", requireProcedureEditor, async (req, res) => {
  try {
    const plan = await createActionPlan(validateActionPlan(req.body?.plan || req.body), getRequestUser(req));
    await recordAudit({ procedureId: plan.planId, action: "action-plan-created", user: getRequestUser(req), details: { documentCode: plan.documentCode } });
    res.status(201).json({ plan });
  } catch (error) { handleError(res, error); }
});

router.put("/:id", requireProcedureEditor, async (req, res) => {
  try {
    const plan = await updateActionPlan(req.params.id, validateActionPlan({ ...(req.body?.plan || req.body), planId: req.params.id }), getRequestUser(req));
    await recordAudit({ procedureId: plan.planId, action: "action-plan-updated", user: getRequestUser(req), details: { documentCode: plan.documentCode, status: plan.status } });
    res.json({ plan });
  } catch (error) { handleError(res, error); }
});

router.delete("/:id", requireManager, async (req, res) => {
  try {
    await deleteActionPlan(req.params.id);
    await recordAudit({ procedureId: req.params.id, action: "action-plan-deleted", user: getRequestUser(req) });
    res.json({ ok: true });
  } catch (error) { handleError(res, error); }
});

module.exports = router;

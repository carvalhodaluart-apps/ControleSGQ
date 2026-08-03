const PLAN_TYPES = ["Correção", "Ação corretiva", "Ação preventiva", "Melhoria", "CAPA"];
const PLAN_ORIGINS = ["Não conformidade", "Auditoria", "Calibração", "Treinamento", "Reclamação", "Risco", "Criação manual"];
const PRIORITIES = ["Baixa", "Média", "Alta", "Crítica"];
const PLAN_STATUSES = ["Rascunho", "Aberto", "Análise de causa", "Em execução", "Aguardando eficácia", "Concluído", "Reaberto"];
const ACTION_TYPES = ["Correção", "Ação corretiva", "Ação preventiva", "Melhoria"];
const ACTION_STATUSES = ["Não iniciada", "Em andamento", "Aguardando evidência", "Concluída", "Cancelada", "Atrasada"];
const EFFECTIVENESS_RESULTS = ["Eficaz", "Parcialmente eficaz", "Ineficaz", "Aguardando avaliação"];
const CAUSE_CATEGORIES = ["Método", "Mão de obra", "Máquina", "Material", "Medição", "Meio ambiente", "Gestão", "Fornecedor"];

function text(value, max = 3000) { return String(value ?? "").trim().slice(0, max); }
function date(value) { const valueText = text(value, 10); return /^\d{4}-\d{2}-\d{2}$/.test(valueText) ? valueText : ""; }
function today() { return new Date().toISOString().slice(0, 10); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function invalid(message) { return Object.assign(new Error(message), { status: 400 }); }

function normalizeAction(action = {}, index = 0) {
  const dueDate = date(action.dueDate);
  let status = ACTION_STATUSES.includes(action.status) ? action.status : "Não iniciada";
  if (dueDate && dueDate < today() && !["Concluída", "Cancelada"].includes(status)) status = "Atrasada";
  const percent = Math.max(0, Math.min(100, Number(action.completionPercent) || 0));
  return {
    actionId: text(action.actionId, 80) || `acao-${index + 1}`,
    description: text(action.description, 1800),
    type: ACTION_TYPES.includes(action.type) ? action.type : "Ação corretiva",
    responsible: text(action.responsible, 120),
    responsibleSector: text(action.responsibleSector, 120),
    dueDate,
    startDate: date(action.startDate),
    completionDate: date(action.completionDate),
    status,
    completionPercent: status === "Concluída" ? 100 : percent,
    evidence: text(action.evidence, 1800),
    comment: text(action.comment, 1800),
    estimatedCost: text(action.estimatedCost, 40),
    actualCost: text(action.actualCost, 40),
  };
}

function normalizePlan(input = {}) {
  const source = clone(input || {});
  const effectiveness = source.effectiveness || {};
  let status = PLAN_STATUSES.includes(source.status) ? source.status : "Rascunho";
  const result = EFFECTIVENESS_RESULTS.includes(effectiveness.result) ? effectiveness.result : "Aguardando avaliação";
  if (result === "Ineficaz") status = "Reaberto";
  return {
    planId: text(source.planId, 100),
    documentCode: text(source.documentCode, 40),
    title: text(source.title, 180),
    type: PLAN_TYPES.includes(source.type) ? source.type : "Ação corretiva",
    origin: PLAN_ORIGINS.includes(source.origin) ? source.origin : "Criação manual",
    sourceDocument: text(source.sourceDocument, 180),
    sector: text(source.sector, 120),
    responsible: text(source.responsible, 120),
    openingDate: date(source.openingDate) || today(),
    priority: PRIORITIES.includes(source.priority) ? source.priority : "Média",
    problemDescription: text(source.problemDescription, 5000),
    situationDescription: text(source.situationDescription, 5000),
    impact: text(source.impact, 3000),
    initialEvidence: text(source.initialEvidence, 3000),
    attachments: text(source.attachments, 2000),
    containment: text(source.containment, 4000),
    containmentDate: date(source.containmentDate),
    containmentResponsible: text(source.containmentResponsible, 120),
    causeMethod: text(source.causeMethod, 80),
    rootCause: text(source.rootCause, 5000),
    causeCategory: CAUSE_CATEGORIES.includes(source.causeCategory) ? source.causeCategory : "",
    participants: text(source.participants, 1200),
    causeEvidence: text(source.causeEvidence, 3000),
    causeAttachments: text(source.causeAttachments, 2000),
    whys: Array.isArray(source.whys) ? source.whys.slice(0, 5).map((item) => text(item, 1200)) : ["", "", "", "", ""],
    actions: Array.isArray(source.actions) ? source.actions.slice(0, 100).map(normalizeAction) : [],
    effectiveness: {
      criterion: text(effectiveness.criterion, 3000),
      responsible: text(effectiveness.responsible, 120),
      plannedDate: date(effectiveness.plannedDate),
      completedDate: date(effectiveness.completedDate),
      result,
      evidence: text(effectiveness.evidence, 3000),
      comment: text(effectiveness.comment, 3000),
      newPlanNeeded: effectiveness.newPlanNeeded === true,
    },
    closureDate: date(source.closureDate),
    closureApprover: text(source.closureApprover, 120),
    createdBy: text(source.createdBy, 120),
    updatedBy: text(source.updatedBy, 120),
    status,
  };
}

function validateActionPlan(input) {
  const value = normalizePlan(input);
  if (!value.title) throw invalid("Informe o título do plano.");
  if (!value.problemDescription && !value.situationDescription) throw invalid("Descreva o problema ou a situação encontrada.");
  if (value.status === "Concluído" && (!value.closureDate || !value.closureApprover || value.effectiveness.result === "Ineficaz")) {
    throw invalid("Para concluir, informe encerramento e uma eficácia diferente de ineficaz.");
  }
  if (value.effectiveness.result === "Ineficaz" && !value.effectiveness.newPlanNeeded) {
    throw invalid("Uma eficácia ineficaz deve indicar a necessidade de um novo plano.");
  }
  return value;
}

function createBlankActionPlan(displayName = "") {
  return normalizePlan({ openingDate: today(), responsible: displayName, createdBy: displayName, updatedBy: displayName });
}

module.exports = {
  ACTION_STATUSES,
  ACTION_TYPES,
  CAUSE_CATEGORIES,
  EFFECTIVENESS_RESULTS,
  PLAN_ORIGINS,
  PLAN_STATUSES,
  PLAN_TYPES,
  PRIORITIES,
  createBlankActionPlan,
  normalizePlan,
  validateActionPlan,
};

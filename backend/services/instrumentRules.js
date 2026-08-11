const INSTRUMENT_TYPES = ["Multímetro", "Termômetro", "Paquímetro", "Micrômetro", "Balança", "Manômetro", "Osciloscópio", "Padrão de referência", "Outro"];
const CRITICALITIES = ["Baixa", "Média", "Alta", "Crítica"];
const SITUATIONS = ["Liberado", "Próximo do vencimento", "Calibração vencida", "Em calibração", "Bloqueado", "Em manutenção", "Fora de uso", "Descartado"];
const CALIBRATION_TYPES = ["Interna", "Externa"];
const CONDITIONS = ["Conforme", "Fora da tolerância", "Danificado", "Não calibrado"];
const FINAL_RESULTS = ["Aprovado", "Aprovado com restrição", "Reprovado"];
const MAINTENANCE_TYPES = ["Manutenção preventiva", "Manutenção corretiva", "Limpeza", "Ajuste", "Verificação intermediária"];
const MAINTENANCE_RESULTS = ["Conforme", "Não conforme", "Liberado", "Bloqueado", "Pendente"];

function text(value, max = 3000) { return String(value ?? "").trim().slice(0, max); }
function date(value) { const result = text(value, 10); return /^\d{4}-\d{2}-\d{2}$/.test(result) ? result : ""; }
function today() { return new Date().toISOString().slice(0, 10); }
function addDays(value, amount) { const result = new Date(`${value}T00:00:00Z`); result.setUTCDate(result.getUTCDate() + amount); return result.toISOString().slice(0, 10); }
function clone(value) { return JSON.parse(JSON.stringify(value || {})); }
function invalid(message) { return Object.assign(new Error(message), { status: 400 }); }

function normalizeMaintenance(item = {}, index = 0) {
  return {
    maintenanceId: text(item.maintenanceId, 80) || `man-${index + 1}`,
    type: MAINTENANCE_TYPES.includes(item.type) ? item.type : "Manutenção preventiva",
    date: date(item.date), service: text(item.service, 2500), responsible: text(item.responsible, 120), result: MAINTENANCE_RESULTS.includes(item.result) ? item.result : "Pendente",
    replacedParts: text(item.replacedParts, 1500), cost: text(item.cost, 40), attachments: text(item.attachments, 1500), nextMaintenance: date(item.nextMaintenance),
  };
}

function normalizeInstrument(input = {}) {
  const source = clone(input); const planning = source.planning || {}; const calibration = source.calibration || {}; const impact = source.impactAnalysis || {};
  let situation = SITUATIONS.includes(source.situation) ? source.situation : "Liberado";
  const nextDate = date(planning.nextCalibrationDate); const preserved = ["Em calibração", "Bloqueado", "Em manutenção", "Fora de uso", "Descartado"];
  const alertDays = Math.max(0, Math.min(3650, Number(planning.alertDays) || 30));
  if (nextDate && !preserved.includes(situation)) situation = nextDate < today() ? "Calibração vencida" : nextDate <= addDays(today(), alertDays) ? "Próximo do vencimento" : situation;
  return {
    instrumentId: text(source.instrumentId, 100), documentCode: text(source.documentCode, 40), name: text(source.name, 180), type: INSTRUMENT_TYPES.includes(source.type) ? source.type : "Outro",
    assetNumber: text(source.assetNumber, 100), manufacturer: text(source.manufacturer, 120), model: text(source.model, 120), serialNumber: text(source.serialNumber, 120), sector: text(source.sector, 120), location: text(source.location, 180), responsible: text(source.responsible, 120), acquisitionDate: date(source.acquisitionDate), criticality: CRITICALITIES.includes(source.criticality) ? source.criticality : "Média", situation,
    metrology: { quantity: text(source.metrology?.quantity, 160), unit: text(source.metrology?.unit, 80), range: text(source.metrology?.range, 180), resolution: text(source.metrology?.resolution, 120), accuracy: text(source.metrology?.accuracy, 120), acceptableTolerance: text(source.metrology?.acceptableTolerance, 180), maxPermittedError: text(source.metrology?.maxPermittedError, 180), instrumentClass: text(source.metrology?.instrumentClass, 100), environmentalConditions: text(source.metrology?.environmentalConditions, 180), useProcedure: text(source.metrology?.useProcedure, 180), needsCalibration: source.metrology?.needsCalibration !== false, needsIntermediateVerification: source.metrology?.needsIntermediateVerification === true },
    planning: { frequency: text(planning.frequency, 100), lastCalibrationDate: date(planning.lastCalibrationDate), nextCalibrationDate: nextDate, alertDays, calibrationType: CALIBRATION_TYPES.includes(planning.calibrationType) ? planning.calibrationType : "Externa", labOrSupplier: text(planning.labOrSupplier, 160), sendResponsible: text(planning.sendResponsible, 120), estimatedCost: text(planning.estimatedCost, 40), needsSpecificAccreditation: planning.needsSpecificAccreditation === true, substituteInstrument: text(planning.substituteInstrument, 160) },
    calibration: { recordNumber: text(calibration.recordNumber, 100), sendDate: date(calibration.sendDate), calibrationDate: date(calibration.calibrationDate), returnDate: date(calibration.returnDate), lab: text(calibration.lab, 160), certificateNumber: text(calibration.certificateNumber, 120), certificatePdf: calibration.certificatePdf && typeof calibration.certificatePdf === "object" ? { name: text(calibration.certificatePdf.name, 180), data: sanitizePdfData(calibration.certificatePdf.data) } : { name: "", data: "" }, patterns: text(calibration.patterns, 1800), traceability: text(calibration.traceability, 1800), conditionFound: CONDITIONS.includes(calibration.conditionFound) ? calibration.conditionFound : "", resultBeforeAdjustment: text(calibration.resultBeforeAdjustment, 1200), adjustmentPerformed: calibration.adjustmentPerformed === true, resultAfterAdjustment: text(calibration.resultAfterAdjustment, 1200), measurementUncertainty: text(calibration.measurementUncertainty, 180), errorFound: text(calibration.errorFound, 180), acceptanceCriteria: text(calibration.acceptanceCriteria, 1200), finalResult: FINAL_RESULTS.includes(calibration.finalResult) ? calibration.finalResult : "", nextCalibration: date(calibration.nextCalibration), analysisResponsible: text(calibration.analysisResponsible, 120), releaseDate: date(calibration.releaseDate) },
    impactAnalysis: { period: text(impact.period, 300), lastValidCalibration: date(impact.lastValidCalibration), productsProcesses: text(impact.productsProcesses, 2500), productionOrders: text(impact.productionOrders, 1800), repeatMeasurements: impact.repeatMeasurements === true, blockProducts: impact.blockProducts === true, technicalAssessment: text(impact.technicalAssessment, 3000), decision: text(impact.decision, 2500), linkedNonconformity: text(impact.linkedNonconformity, 120), linkedActionPlan: text(impact.linkedActionPlan, 120), evidence: text(impact.evidence, 2500), approval: text(impact.approval, 120) },
    maintenances: Array.isArray(source.maintenances) ? source.maintenances.slice(0, 100).map(normalizeMaintenance) : [], createdBy: text(source.createdBy, 120), updatedBy: text(source.updatedBy, 120), updatedAt: source.updatedAt || "",
  };
}

function validateInstrument(input) {
  const value = normalizeInstrument(input);
  if (!value.name) throw invalid("Informe o nome do instrumento.");
  if (value.calibration.finalResult === "Reprovado" && (!value.impactAnalysis.technicalAssessment || !value.impactAnalysis.decision)) throw invalid("Para reprovar o instrumento, registre a análise de impacto e a decisão tomada.");
  return value;
}

function createBlankInstrument(displayName = "") { return normalizeInstrument({ responsible: displayName, createdBy: displayName, updatedBy: displayName }); }

module.exports = { CALIBRATION_TYPES, CONDITIONS, CRITICALITIES, FINAL_RESULTS, INSTRUMENT_TYPES, MAINTENANCE_RESULTS, MAINTENANCE_TYPES, SITUATIONS, createBlankInstrument, normalizeInstrument, validateInstrument };
const { sanitizePdfData } = require("./securityInputRules");

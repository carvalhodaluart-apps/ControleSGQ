function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function slugify(value) {
  return String(value || "procedimento")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "procedimento";
}

function normalizeEquipmentCode(value) {
  return String(value || "NOVO")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, "") || "NOVO";
}

function createBlockId(type) {
  return `${type || "block"}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

const STATUS_DRAFT = "Em elabora\u00e7\u00e3o";
const STATUS_PUBLISHED = "Publicado";

const DEFAULT_DOCUMENT_TYPES = [
  { key: "it", label: "Instru\u00e7\u00e3o de trabalho", prefix: "IT", active: true },
  { key: "pop", label: "Procedimento operacional padr\u00e3o", prefix: "POP", active: true },
  { key: "mbp", label: "Manual de boas pr\u00e1ticas", prefix: "MBP", active: true },
  { key: "for", label: "Formul\u00e1rio", prefix: "FOR", active: true },
  { key: "rdt", label: "Registro de desvio tempor\u00e1rio", prefix: "RDT", active: true },
  { key: "pr", label: "Procedimento", prefix: "PR", active: true },
  { key: "rg", label: "Registro", prefix: "RG", active: true },
  { key: "ma", label: "Manual", prefix: "MA", active: true },
  { key: "pl", label: "Plano", prefix: "PL", active: true },
];
const DEFAULT_SECTORS = [
  { key: "producao", label: "Produ\u00e7\u00e3o", prefix: "PR", active: true },
  { key: "qualidade", label: "Qualidade", prefix: "QL", active: true },
  { key: "engenharia", label: "Engenharia", prefix: "EN", active: true },
  { key: "manutencao", label: "Manuten\u00e7\u00e3o", prefix: "MN", active: true },
  { key: "administrativo", label: "Administrativo", prefix: "AD", active: true },
  { key: "projeto-desenvolvimento", label: "Projeto e Desenvolvimento", prefix: "PD", active: true },
  { key: "almoxarifado", label: "Almoxarifado", prefix: "AL", active: true },
  { key: "geral", label: "Geral", prefix: "GE", active: true },
];
const DEFAULT_QUALITY_FIELDS = [
  { key: "objective", label: "Objetivo", active: true },
  { key: "application", label: "Aplica\u00e7\u00e3o", active: true },
  { key: "responsibilities", label: "Responsabilidades", active: true },
  { key: "relatedDocs", label: "Materiais, sistemas ou documentos relacionados", active: true },
  { key: "records", label: "Registros gerados", active: true },
  { key: "acceptanceCriteria", label: "Crit\u00e9rios de aceita\u00e7\u00e3o", active: true },
  { key: "deviationTreatment", label: "Tratamento de desvios", active: true },
  { key: "traceability", label: "Rastreabilidade", active: true },
  { key: "retention", label: "Reten\u00e7\u00e3o de registros", active: true },
  { key: "climateConsideration", label: "Mudan\u00e7as clim\u00e1ticas", active: true },
];
const DEFAULT_COVER = {
  imageData: "",
  overlayPosition: "center",
  overlayX: 0.5,
  overlayY: 0.5,
};
let documentTypes = cloneData(DEFAULT_DOCUMENT_TYPES);
let sectors = cloneData(DEFAULT_SECTORS);

function getDefaultConfiguration() {
  return cloneData({ documentTypes: DEFAULT_DOCUMENT_TYPES, sectors: DEFAULT_SECTORS, qualityFields: DEFAULT_QUALITY_FIELDS, cover: DEFAULT_COVER });
}

function setProcedureConfiguration(configuration) {
  if (Array.isArray(configuration?.documentTypes) && configuration.documentTypes.length) documentTypes = cloneData(configuration.documentTypes);
  if (Array.isArray(configuration?.sectors) && configuration.sectors.length) sectors = cloneData(configuration.sectors);
}

function getActiveDocumentType() { return documentTypes.find((item) => item.active !== false) || documentTypes[0]; }
function getActiveSector() { return sectors.find((item) => item.active !== false) || sectors[0]; }

function sanitizeDocumentCodePart(value) {
  return String(value || "NOVO")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "NOVO";
}

function getDocumentTypeConfig(type) {
  return documentTypes.find((item) => item.label === type) || documentTypes[0];
}
function getSectorConfig(value) { return sectors.find((item) => item.label === value) || sectors.find((item) => String(value || "").startsWith(item.label)) || sectors[0]; }
function sanitizeDocumentNumber(value) { return String(value || "").replace(/\D/g, "").slice(0, 8); }

function getDocumentRevision(procedure) {
  const rows = Array.isArray(procedure.revision) ? procedure.revision.slice(1) : [];
  const lastRevision = [...rows].reverse().find((row) => String(row?.[0] || "").trim());
  return String(lastRevision?.[0] || "00").trim() || "00";
}

function formatRevisionNumber(index) {
  return String(Math.max(0, index)).padStart(2, "0");
}

function normalizeRevisionNumbers(procedure) {
  if (!Array.isArray(procedure.revision)) return;
  const columns = procedure.revision[0]?.length || 5;
  if (procedure.revision.length === 1) {
    procedure.revision.push(Array.from({ length: columns }, (_, index) => (index === 0 ? "00" : "")));
  }
  procedure.revision.slice(1).forEach((row, index) => {
    row[0] = formatRevisionNumber(index);
  });
}

function getDocumentCodeMiddle(procedure) {
  if (procedure.documentCodeMiddle) return sanitizeDocumentCodePart(procedure.documentCodeMiddle);
  const parts = String(procedure.documentCode || "").split("_").filter(Boolean);
  if (parts.length >= 3) return sanitizeDocumentCodePart(parts.slice(1, -1).join("_"));
  return "NOVO";
}
function getDocumentNumber(procedure) {
  if (Object.prototype.hasOwnProperty.call(procedure, "documentNumber")) return sanitizeDocumentNumber(procedure.documentNumber);
  const middle = getDocumentCodeMiddle(procedure);
  const sector = sectors.find((item) => middle.startsWith(item.prefix));
  return sanitizeDocumentNumber(sector ? middle.slice(sector.prefix.length) : middle);
}

function syncDocumentCode(procedure) {
  const type = getDocumentTypeConfig(procedure.qualityInfo?.documentType);
  const sector = getSectorConfig(procedure.qualityInfo?.area);
  procedure.qualityInfo.documentType = type.label;
  procedure.qualityInfo.area = sector.label;
  procedure.documentNumber = getDocumentNumber(procedure);
  procedure.documentCodeMiddle = `${sector.prefix}${procedure.documentNumber || "0000"}`;
  procedure.documentCode = `${type.prefix}_${procedure.documentCodeMiddle}_${getDocumentRevision(procedure)}`;
}

function normalizeDocumentStatus(procedure) {
  const requested = String(procedure.documentStatus || procedure.qualityInfo?.status || STATUS_DRAFT).trim();
  procedure.documentStatus = requested.toLowerCase() === STATUS_PUBLISHED.toLowerCase()
    ? STATUS_PUBLISHED
    : STATUS_DRAFT;
  procedure.qualityInfo.status = procedure.documentStatus;
  if (procedure.documentStatus !== STATUS_PUBLISHED) procedure.qualityInfo.approvalDate = "";
}

function normalizeSectionNumbers(procedure) {
  (procedure.sections || []).forEach((section, index) => {
    section.number = `${index + 1}.0`;
  });
}

function createBlankProcedure(input = {}) {
  const equipmentCode = normalizeEquipmentCode(input.equipmentCode || input.equipmentName || "NOVO");
  const title = String(input.title || "Novo procedimento").trim();
  const documentCode = String(input.documentCode || "IT_NOVO_00").trim();
  return normalizeProcedure({
    equipmentCode,
    equipmentName: String(input.equipmentName || equipmentCode).trim(),
    procedureId: slugify(input.procedureId || documentCode || title),
    procedureType: String(input.procedureType || "").trim(),
    procedureDescription: String(input.procedureDescription || "").trim(),
    documentStatus: "Em elaboração",
    title,
    documentCode,
    qualityInfo: {
      objective: "",
      application: "",
      responsibilities: "",
      relatedDocs: "",
      records: "",
      acceptanceCriteria: "",
      deviationTreatment: "",
      traceability: "",
      retention: "",
      climateConsideration: "",
    },
    revision: [
      ["Rev.", "Data", "Alterações", "Elaboração", "Aprovação"],
      ["00", "", "", "", ""],
    ],
    sections: [],
  });
}

function clearUntouchedBlankQualityInfo(procedure) {
  if (procedure.title !== "Novo procedimento" || procedure.sections?.some(sectionHasContent)) return;
  const info = procedure.qualityInfo || {};
  const templateStarts = [
    ["objective", "Orientar a montagem"], ["application", "Aplic"],
    ["responsibilities", "Operador executa"], ["relatedDocs", "Procedimento de controle"],
    ["records", "Registro de montagem"], ["acceptanceCriteria", "Montagem conclu"],
    ["deviationTreatment", "Desvios devem"], ["traceability", "Manter v"],
    ["retention", "Reter os registros"], ["climateConsideration", "N"],
  ];
  if (!templateStarts.every(([key, prefix]) => String(info[key] || "").startsWith(prefix))) return;
  templateStarts.forEach(([key]) => { info[key] = ""; });
}

function normalizeProcedure(input) {
  if (!input || typeof input !== "object") {
    throw new Error("Procedimento inválido.");
  }

  const procedure = cloneData(input);
  procedure.equipmentCode = normalizeEquipmentCode(procedure.equipmentCode || procedure.equipmentName);
  procedure.equipmentName = String(procedure.equipmentName || procedure.equipmentCode).trim();
  procedure.title = String(procedure.title || "Novo procedimento").trim();
  procedure.documentCode = String(procedure.documentCode || "IT_NOVO_00").trim();
  procedure.procedureId = slugify(procedure.procedureId || procedure.documentCode || procedure.title);
  procedure.procedureType = String(procedure.procedureType || "").trim();
  procedure.procedureDescription = String(procedure.procedureDescription || "").trim();
  procedure.documentStatus = String(procedure.documentStatus || procedure.qualityInfo?.status || STATUS_DRAFT).trim();

  procedure.revision = Array.isArray(procedure.revision) && procedure.revision.length
    ? procedure.revision
    : [["Rev.", "Data", "Alterações", "Elaboração", "Aprovação"], ["00", "", "", "", ""]];
  normalizeRevisionNumbers(procedure);

  procedure.qualityInfo = {
    documentType: getActiveDocumentType().label,
    status: "Em elaboração",
    area: getActiveSector().label,
    executionOwner: "Operador de montagem",
    objective: `Orientar a montagem do equipamento ${procedure.equipmentName} com sequência padronizada, materiais identificados e pontos de atenção.`,
    application: `Aplicável à montagem interna do equipamento ${procedure.equipmentName}.`,
    responsibilities: "Operador executa a montagem; líder ou qualidade verifica; responsável do SGQ aprova alterações do documento.",
    relatedDocs: "Procedimento de controle de documentos; registros de inspeção e teste aplicáveis.",
    records: "Registro de montagem, inspeção e liberação do equipamento.",
    acceptanceCriteria: "Montagem concluída conforme etapas, materiais corretos, conexões verificadas e aprovação nos testes aplicáveis.",
    deviationTreatment: "Desvios devem ser registrados, segregados quando aplicável e tratados conforme controle de não conformidade.",
    traceability: "Manter vínculo entre número de série ou lote, revisão do procedimento, registros de montagem e responsável pela execução.",
    retention: "Reter os registros conforme tabela de retenção definida pelo SGQ.",
    climateConsideration: "Não identificado impacto direto no procedimento. Reavaliar quando houver alteração de material, processo, fornecedor, armazenamento ou condição ambiental relevante.",
    approvalDate: "",
    ...(procedure.qualityInfo || {}),
  };
  clearUntouchedBlankQualityInfo(procedure);
  normalizeDocumentStatus(procedure);
  syncDocumentCode(procedure);

  procedure.sections = Array.isArray(procedure.sections) ? procedure.sections : [];
  procedure.sections.forEach((section, index) => {
    section.number = `${index + 1}.0`;
    section.title = String(section.title || "Nova seção");
    section.kind = section.kind || "step";
    section.instructions = Array.isArray(section.instructions) ? section.instructions : [];
    section.images = Array.isArray(section.images) ? section.images : [];
    section.tables = Array.isArray(section.tables) ? section.tables : [];
    section.materials = Array.isArray(section.materials) ? section.materials : [];
    section.itemMarkers = Array.isArray(section.itemMarkers) ? section.itemMarkers : [];
    section.annotations = section.annotations || {};
    section.instructionTones = Array.isArray(section.instructionTones) ? section.instructionTones : section.instructions.map(() => "success");
    section.instructionImages = Array.isArray(section.instructionImages) ? section.instructionImages : section.instructions.map(() => "");
    section.stepCards = Array.isArray(section.stepCards) ? section.stepCards : [];
    section.stepCards.forEach((card) => {
      card.blocks = Array.isArray(card.blocks) ? card.blocks : [];
      card.blocks = card.blocks.map((block, blockIndex) => normalizeBlock(block, card, blockIndex));
    });
  });
  normalizeSectionNumbers(procedure);

  validateProcedure(procedure);
  return procedure;
}

function normalizeBlock(block, card, blockIndex = 0) {
  const type = block?.type || "text";
  return {
    id: block?.id || createBlockId(type),
    type,
    text: String(block?.text || ""),
    html: String(block?.html || ""),
    tone: block?.tone || card?.tone || "success",
    image: String(block?.image || ""),
    annotations: Array.isArray(block?.annotations) ? block.annotations : [],
    rotation: Number.isFinite(Number(block?.rotation)) ? Number(block.rotation) : 0,
    flipX: Boolean(block?.flipX),
    flipY: Boolean(block?.flipY),
    borderWidth: Number.isFinite(Number(block?.borderWidth)) ? Number(block.borderWidth) : 3,
    fontSize: Number.isFinite(Number(block?.fontSize)) ? Number(block.fontSize) : 20,
    x: Number.isFinite(Number(block?.x)) ? Number(block.x) : 6,
    y: Number.isFinite(Number(block?.y)) ? Number(block.y) : 8,
    w: Number.isFinite(Number(block?.w)) ? Number(block.w) : 40,
    h: Number.isFinite(Number(block?.h)) ? Number(block.h) : 28,
    zIndex: Number.isFinite(Number(block?.zIndex)) ? Number(block.zIndex) : (type === "image" ? 0 : blockIndex + 1),
  };
}

function validateProcedure(procedure) {
  const errors = [];
  if (!procedure.title) errors.push("Nome do procedimento é obrigatório.");
  if (!procedure.documentCode) errors.push("Código do documento é obrigatório.");
  if (!procedure.equipmentCode) errors.push("Equipamento é obrigatório.");
  if (!Array.isArray(procedure.sections)) errors.push("Seções devem ser uma lista.");
  if (errors.length) {
    const error = new Error(errors.join(" "));
    error.status = 400;
    throw error;
  }
}

function hasProcedureContent(procedure) {
  if (String(procedure.title || "").trim() && procedure.title !== "Novo procedimento") return true;
  if (Array.isArray(procedure.sections) && procedure.sections.some(sectionHasContent)) return true;
  const info = procedure.qualityInfo || {};
  return ["objective", "application", "responsibilities", "relatedDocs", "records", "acceptanceCriteria", "deviationTreatment", "traceability", "retention", "climateConsideration"]
    .some((key) => String(info[key] || "").trim());
}

function sectionHasContent(section) {
  if (!section || typeof section !== "object") return false;
  const title = String(section.title || "").trim();
  if (title && !["Nova etapa", "Itens necessários"].includes(title)) return true;
  return [section.instructions, section.images, section.tables, section.materials, section.itemMarkers]
    .some((items) => Array.isArray(items) && items.some(itemHasContent))
    || (Array.isArray(section.stepCards) && section.stepCards.some(cardHasContent));
}

function cardHasContent(card) {
  if (!card || typeof card !== "object") return false;
  if (String(card.text || "").trim() || String(card.title || "").trim()) return true;
  return Array.isArray(card.blocks) && card.blocks.some((block) => {
    if (!block || typeof block !== "object") return false;
    return String(block.text || "").trim() || String(block.html || "").trim() || String(block.image || "").trim();
  });
}

function itemHasContent(item) {
  if (typeof item === "string") return Boolean(item.trim());
  if (!item || typeof item !== "object") return Boolean(item);
  return Object.values(item).some((value) => typeof value === "string" ? value.trim() : Boolean(value));
}

module.exports = {
  createBlankProcedure,
  getDefaultConfiguration,
  getPublicationDate,
  hasProcedureContent,
  normalizeProcedure,
  normalizeSectionNumbers,
  setProcedureConfiguration,
  STATUS_DRAFT,
  STATUS_PUBLISHED,
  slugify,
};

function getPublicationDate() {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
}

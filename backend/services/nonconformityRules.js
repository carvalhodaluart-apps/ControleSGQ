const STATUS_VALUES = new Set(["Aberta", "Em tratamento", "Aguardando eficácia", "Encerrada"]);
const ORIGIN_VALUES = new Set(["Auditoria interna", "Cliente", "Fornecedor", "Processo", "Produto", "Documento", "Outro"]);
const ACTION_STATUS_VALUES = new Set(["Pendente", "Em andamento", "Concluída"]);

function text(value, max = 2000) {
  return String(value ?? "").trim().slice(0, max);
}

function date(value) {
  const valueText = text(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(valueText) ? valueText : "";
}

function imageData(value) {
  const image = String(value ?? "").trim();
  if (!image) return "";
  return /^data:image\/(?:png|jpe?g|webp);base64,/i.test(image) ? image.slice(0, 12_000_000) : "";
}

function rawImageList(source, maxImages = 10) {
  return (Array.isArray(source.evidenceImages) ? source.evidenceImages : source.evidenceImage ? [source.evidenceImage] : []).slice(0, maxImages);
}

function imageList(source, maxImages = 10) {
  return rawImageList(source, maxImages).map((entry, index) => {
    const image = typeof entry === "string" ? entry : entry?.image || entry?.data;
    const normalizedImage = imageData(image);
    if (!normalizedImage) return null;
    return {
      image: normalizedImage,
      label: text(typeof entry === "string" ? "" : entry?.label, 120) || `Evid\u00eancia ${index + 1}`,
      description: text(typeof entry === "string" ? "" : entry?.description, 1200),
    };
  }).filter(Boolean);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeAction(action = {}, index = 0) {
  const status = ACTION_STATUS_VALUES.has(action.status) ? action.status : "Pendente";
  return {
    actionId: text(action.actionId, 80) || `acao-${index + 1}`,
    description: text(action.description, 1200),
    responsible: text(action.responsible, 120),
    dueDate: date(action.dueDate),
    status,
    evidence: text(action.evidence, 1200),
  };
}

function normalizeNonconformity(input = {}, options = {}) {
  const source = clone(input || {});
  const status = STATUS_VALUES.has(source.status) ? source.status : "Aberta";
  const configuredOrigins = Array.isArray(options.origins) && options.origins.length ? new Set(options.origins) : ORIGIN_VALUES;
  const origin = configuredOrigins.has(source.origin) ? source.origin : (text(source.origin, 120) || "Processo");
  const actions = Array.isArray(source.actions) ? source.actions.slice(0, 100).map(normalizeAction) : [];
  return {
    nonconformityId: text(source.nonconformityId, 100),
    documentCode: text(source.documentCode, 40),
    title: text(source.title, 180),
    status,
    origin,
    issueDate: date(source.issueDate) || today(),
    sector: text(source.sector, 120),
    reporter: text(source.reporter, 120),
    responsible: text(source.responsible, 120),
    affectedItem: text(source.affectedItem, 180),
    description: text(source.description, 5000),
    evidence: text(source.evidence, 5000),
    evidenceImages: imageList(source, options.maxEvidenceImages || 10),
    containment: text(source.containment, 3000),
    containmentResponsible: text(source.containmentResponsible, 120),
    containmentDate: date(source.containmentDate),
    causeMethod: text(source.causeMethod, 80),
    causeAnalysis: text(source.causeAnalysis, 5000),
    rootCause: text(source.rootCause, 3000),
    actions,
    effectivenessDate: date(source.effectivenessDate),
    effectivenessVerifier: text(source.effectivenessVerifier, 120),
    effectivenessResult: text(source.effectivenessResult, 3000),
    effective: source.effective === true ? true : source.effective === false ? false : null,
    climateImpact: source.climateImpact === true,
    climateJustification: text(source.climateJustification, 2000),
    closureApprover: text(source.closureApprover, 120),
    closureDate: date(source.closureDate),
    closureNotes: text(source.closureNotes, 3000),
  };
}

function validateNonconformity(input, options = {}) {
  const value = normalizeNonconformity(input, options);
  const rawImages = rawImageList(input, options.maxEvidenceImages || 10);
  const rawImageData = rawImages.map((entry) => typeof entry === "string" ? entry : entry?.image || entry?.data);
  if (rawImageData.some((image) => !/^data:image\/(?:png|jpe?g|webp);base64,/i.test(String(image || "")))) {
    throw Object.assign(new Error("As imagens da evidência devem estar em PNG, JPEG ou WebP."), { status: 400 });
  }
  if (rawImageData.some((image) => String(image || "").length > 12_000_000)) {
    throw Object.assign(new Error("Uma imagem da evidência é grande demais. Importe uma imagem menor."), { status: 400 });
  }
  if (!value.title) throw Object.assign(new Error("Informe o título da não conformidade."), { status: 400 });
  if ((!Array.isArray(options.sections) || options.sections.includes("description")) && !value.description) {
    throw Object.assign(new Error("Descreva a não conformidade antes de salvar."), { status: 400 });
  }
  if (Array.isArray(options.origins) && options.origins.length && !options.origins.includes(value.origin)) {
    throw Object.assign(new Error("Selecione uma origem ativa nas configuracoes."), { status: 400 });
  }
  if (value.status === "Encerrada" && (!value.effectivenessDate || value.effective !== true || !value.closureDate)) {
    throw Object.assign(new Error("Para encerrar, informe a verificação de eficácia como eficaz e registre as datas correspondentes."), { status: 400 });
  }
  return value;
}

function createBlankNonconformity(displayName = "") {
  return normalizeNonconformity({
    issueDate: today(),
    reporter: text(displayName, 120),
    responsible: text(displayName, 120),
  });
}

module.exports = {
  createBlankNonconformity,
  normalizeNonconformity,
  validateNonconformity,
};

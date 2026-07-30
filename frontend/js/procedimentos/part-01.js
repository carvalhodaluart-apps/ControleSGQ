const procedureRoot = document.querySelector("#procedureRoot");
const procedureTypes = {
  mecanica: "Montagem mecânica",
  placa: "Montagem de placa",
  acessorios: "Montagem de acessórios",
};
const documentTypes = [
  { label: "Instrução de trabalho", prefix: "IT" },
  { label: "Procedimento", prefix: "PR" },
  { label: "Formulário", prefix: "FM" },
  { label: "Registro", prefix: "RG" },
  { label: "Manual", prefix: "MA" },
  { label: "Plano", prefix: "PL" },
];
const sectors = [{ label: "Produção", prefix: "PR" }, { label: "Qualidade", prefix: "QL" }, { label: "Engenharia", prefix: "EN" }, { label: "Manutenção", prefix: "MN" }, { label: "Administrativo", prefix: "AD" }];
const equipmentProcedures = {
  JAU200: [
    {
      id: "montagem-placa",
      type: "placa",
      data: window.JAU200_PROCEDURE,
    },
  ],
};
const equipmentImages = {
  ABI100: "assets/equipamentos/ABI100.png",
  ABI200: "assets/equipamentos/ABI200.png",
  APE100: "assets/equipamentos/APE100.png",
  AQT110: "assets/equipamentos/AQT110.png",
  ASE100: "assets/equipamentos/ASE100.png",
  AVM100: "assets/equipamentos/AVM100.png",
  IPA100: "assets/equipamentos/IPA100.png",
  JAU200: "assets/equipamentos/JAU200.png",
  MCV110: "assets/equipamentos/MCV110.png",
  MCV300: "assets/equipamentos/MCV300.png",
  MCV400: "assets/equipamentos/MCV400.png",
  MDC100: "assets/equipamentos/MDC100.png",
  MOX100: "assets/equipamentos/MOX100.png",
  MPR100: "assets/equipamentos/MPR100.png",
  MUT200: "assets/equipamentos/MUT200.png",
  PNI100: "assets/equipamentos/PNI100.png",
  "PULMAO-DE-TESTE": "assets/equipamentos/Pulmao-de-Teste.jpg",
  SIM300: "assets/equipamentos/SIM300.png",
  SMP100: "assets/equipamentos/SMP100.png",
  SOP100: "assets/equipamentos/SOP100.png",
  SPK100: "assets/equipamentos/SPK100.png",
  TIN100: "assets/equipamentos/TIN100.png",
  TQC110: "assets/equipamentos/TQC110.png",
};
const equipmentLabels = {
  "PULMAO-DE-TESTE": "Pulmao de Teste",
  OUTROS: "Outros",
};
function getEquipmentName(code) {
  return equipmentLabels[code] || code;
}
function getEquipmentImage(procedure) {
  if (procedure.equipmentCode === "OUTROS") return procedure.customEquipmentImage || "";
  return equipmentImages[procedure.equipmentCode] || "";
}
const params = new URLSearchParams(window.location.search);
const builderMode = params.get("criador") === "1" || params.get("novo") === "1";
const equipmentCode = (params.get("equipamento") || (builderMode ? "NOVO" : "")).toUpperCase();
const requestedProcedureId = params.get("procedimento") || "";
const requestedEditMode = params.get("editar") === "1";
const appMode = window.PROCEDURE_APP_MODE || "quality";
const canEditProcedures = appMode === "quality";
const availableProcedures = getAvailableProcedures();
const selectedProcedure = getSelectedProcedure();
const procedureId = selectedProcedure?.id || requestedProcedureId || (builderMode ? "rascunho" : "default");
const qualityTokenKey = "procedure-quality-token";

let qualityToken = sessionStorage.getItem(qualityTokenKey) || "";
let activeProcedure = (selectedProcedure?.data ? cloneData(selectedProcedure.data) : null) || (builderMode ? createBlankProcedure() : null);
let editMode = builderMode;
let pendingAnnotation = null;
let dragState = null;
let reorderDrag = null;
let layoutDragState = null;
let selectedStepBlock = null;
let saveTimer = null;
let savePromise = Promise.resolve();
let saveState = "saved";
function updateSaveState(state, message) {
  saveState = state;
  document.querySelectorAll("[data-save-state]").forEach((element) => {
    element.dataset.saveState = state;
    element.textContent = message || ({ pending: "Salvando...", error: "Erro ao salvar", saved: "Alterações salvas" }[state] || "");
  });
}
function selectStepBlock(blockKey) {
  selectedStepBlock = blockKey;
  procedureRoot.querySelectorAll("[data-step-block].is-selected").forEach((element) => {
    element.classList.remove("is-selected");
  });
  if (blockKey) {
    procedureRoot.querySelector(`[data-step-block="${blockKey}"]`)?.classList.add("is-selected");
  }
}
async function apiRequest(path, options = {}) {
  const { headers: optionHeaders, ...requestOptions } = options;
  const headers = {
    "Content-Type": "application/json",
    ...(qualityToken ? { Authorization: `Bearer ${qualityToken}` } : {}),
    ...(optionHeaders || {}),
  };
  const response = await fetch(path, {
    ...requestOptions,
    headers,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Erro ao comunicar com o servidor.");
  }
  return response.json();
}
if (activeProcedure) {
  activeProcedure.procedureId = activeProcedure.procedureId || procedureId;
  activeProcedure.procedureType = activeProcedure.procedureType || selectedProcedure?.type || "";
  activeProcedure.documentStatus = activeProcedure.documentStatus || (builderMode ? "Em elaboração" : "Publicado");
  normalizeProcedure(activeProcedure);
  if (!canEditProcedures && activeProcedure.documentStatus.toLowerCase().includes("elabora")) {
    activeProcedure = null;
  }
  if (consumeEditUnlock()) {
    editMode = true;
    setProcedureStatus("Em elaboração");
  }
  if (builderMode) {
    activeProcedure.documentStatus = "Em elaboração";
  }
}
function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}
function getCatalogKey() {
  return `procedure-catalog:v1:${equipmentCode || "default"}`;
}
function getEditUnlockKey() {
  return `procedure-edit-unlock:${equipmentCode}:${procedureId}`;
}

function consumeEditUnlock() {
  if (!canEditProcedures) return false;
  if (!requestedEditMode) return false;
  const unlockKey = getEditUnlockKey();
  const unlocked = sessionStorage.getItem(unlockKey) === "1";
  sessionStorage.removeItem(unlockKey);
  return unlocked;
}

function getLocalProcedures() {
  return [];
}

function getAvailableProcedures() {
  const officialProcedures = (equipmentProcedures[equipmentCode] || [])
    .filter((procedure) => procedure.data)
    .map((procedure) => ({
      id: procedure.id,
      type: procedure.type || procedure.data.procedureType || "",
      data: {
        ...procedure.data,
        procedureId: procedure.id,
        procedureType: procedure.type || procedure.data.procedureType || "",
      },
    }));

  const localProcedures = getLocalProcedures()
    .map((procedure) => {
      return { id: procedure.id, type: procedure.type, data: procedure.data };
    })
    .filter(Boolean);

  return [...officialProcedures, ...localProcedures];
}

function getSelectedProcedure() {
  if (!availableProcedures.length) return null;
  if (requestedProcedureId) {
    return availableProcedures.find((procedure) => procedure.id === requestedProcedureId) || null;
  }
  return availableProcedures[0];
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function sanitizeRichText(value) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = String(value || "");
  wrapper.querySelectorAll("*").forEach((node) => {
    if (!["B", "STRONG", "BR"].includes(node.tagName)) {
      node.replaceWith(document.createTextNode(node.textContent || ""));
      return;
    }
    [...node.attributes].forEach((attribute) => node.removeAttribute(attribute.name));
  });
  return wrapper.innerHTML;
}

function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function sanitizeDocumentCodePart(value, fallback = "NOVO") {
  return String(value ?? fallback)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "") || fallback;
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
  if (Object.prototype.hasOwnProperty.call(procedure, "documentCodeMiddle")) {
    return sanitizeDocumentCodePart(procedure.documentCodeMiddle, "");
  }
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

function refreshDocumentCodeDisplays() {
  if (!activeProcedure) return;
  syncDocumentCode(activeProcedure);
  const type = getDocumentTypeConfig(activeProcedure.qualityInfo?.documentType);
  procedureRoot.querySelectorAll("[data-document-code-value]").forEach((item) => {
    item.textContent = activeProcedure.documentCode;
  });
  procedureRoot.querySelectorAll("[data-document-code-prefix]").forEach((item) => {
    item.textContent = `${type.prefix}_`;
  });
  procedureRoot.querySelectorAll("[data-document-code-sector-prefix]").forEach((item) => { item.textContent = getSectorConfig(activeProcedure.qualityInfo?.area).prefix; });
  procedureRoot.querySelectorAll("[data-document-code-number]").forEach((item) => { item.textContent = activeProcedure.documentNumber || "0000"; });
  procedureRoot.querySelectorAll("[data-document-code-revision]").forEach((item) => {
    item.textContent = `_${getDocumentRevision(activeProcedure)}`;
  });
}

function normalizeProcedure(procedure) {
  procedure.revision = procedure.revision?.length
    ? procedure.revision
    : [["Rev.", "Data", "Alterações", "Elaboração", "Aprovação"]];
  normalizeRevisionNumbers(procedure);
  procedure.qualityInfo = {
    documentType: "Instrução de trabalho",
    status: "Em elaboração",
    area: "Produção",
    executionOwner: "Operador de montagem",
    objective: `Orientar a montagem do equipamento ${procedure.equipmentName || procedure.equipmentCode} com sequência padronizada, materiais identificados e pontos de atenção.`,
    application: `Aplicável à montagem interna do equipamento ${procedure.equipmentName || procedure.equipmentCode}.`,
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
  const status = procedure.documentStatus || procedure.qualityInfo.status || "Em elaboração";
  clearUntouchedBlankQualityInfo(procedure);
  procedure.documentStatus = status;
  procedure.qualityInfo.status = status;
  if (status !== "Publicado") procedure.qualityInfo.approvalDate = "";
  syncDocumentCode(procedure);

  procedure.sections?.forEach((section) => {
    section.instructions = section.instructions || [];
    section.images = section.images || [];
    section.tables = section.tables || [];
    section.instructionTones = section.instructionTones || section.instructions.map(classifyInstructionTone);
    section.instructionImages = section.instructionImages || section.instructions.map(() => "");
    section.annotations = section.annotations || {};
    section.materials = section.materials || getTableItems(section.tables?.[0]);
    section.stepCards = section.stepCards || [];
    section.stepCards.forEach((card) => {
      card.tone = card.tone || "success";
      card.text = card.text || "";
      card.textPosition = card.textPosition || "above";
      card.image = card.image || "";
      card.annotations = card.annotations || [];
      card.blocks = normalizeStepCardBlocks(card);
    });
  });
  normalizeSectionNumbers(procedure);
}

function normalizeSectionNumbers(procedure) {
  (procedure.sections || []).forEach((section, index) => {
    section.number = `${index + 1}.0`;
  });
}

function normalizeStepCardBlocks(card) {
  if (card.blocks?.length) {
    return card.blocks.map((block, blockIndex) => ({
      id: block.id || createBlockId(block.type || "block"),
      type: block.type || "text",
      text: block.text || "",
      html: block.html || "",
      tone: block.tone || card.tone || "success",
      image: block.image || "",
      annotations: block.annotations || [],
      rotation: Number.isFinite(Number(block.rotation)) ? Number(block.rotation) : 0,
      flipX: Boolean(block.flipX),
      flipY: Boolean(block.flipY),
      borderWidth: Number.isFinite(Number(block.borderWidth)) ? Number(block.borderWidth) : 3,
      fontSize: Number.isFinite(Number(block.fontSize)) ? Number(block.fontSize) : 20,
      x: Number.isFinite(Number(block.x)) ? Number(block.x) : 6,
      y: Number.isFinite(Number(block.y)) ? Number(block.y) : 8,
      w: Number.isFinite(Number(block.w)) ? Number(block.w) : 40,
      h: Number.isFinite(Number(block.h)) ? Number(block.h) : 28,
      zIndex: Number.isFinite(Number(block.zIndex)) ? Number(block.zIndex) : (block.type === "image" ? 0 : blockIndex + 1),
    }));
  }

  const blocks = [];
  if (card.text) {
    blocks.push({
      id: createBlockId("text"),
      type: "text",
      text: card.text,
      html: escapeHtml(card.text),
      tone: card.tone || "success",
      image: "",
      annotations: [],
      rotation: 0,
      flipX: false,
      flipY: false,
      borderWidth: 3,
      fontSize: 20,
      x: 5,
      y: 8,
      w: card.image ? 42 : 90,
      h: 30,
      zIndex: 1,
    });
  }

  if (card.image) {
    blocks.push({
      id: createBlockId("image"),
      type: "image",
      text: "",
      html: "",
      tone: card.tone || "success",
      image: card.image,
      annotations: card.annotations || [],
      rotation: 0,
      flipX: false,
      flipY: false,
      borderWidth: 3,
      fontSize: 16,
      x: card.text ? 52 : 5,
      y: 8,
      w: card.text ? 43 : 90,
      h: 72,
      zIndex: 0,
    });
  }

  return blocks;
}

function clearUntouchedBlankQualityInfo(procedure) {
  if (procedure.title !== "Novo procedimento" || procedure.documentCode !== "IT_NOVO_00" || procedure.sections?.length) return;
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

function createBlockId(type) {
  return `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function createBlankProcedure() {
  const code = equipmentCode || "NOVO";
  return {
    equipmentCode: code,
    equipmentName: code,
    procedureId,
    procedureType: "",
    procedureDescription: "",
    documentStatus: "Em elaboração",
    title: "Novo procedimento",
    documentCode: "IT_NOVO_00",
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
  };
}

function saveProcedure() {
  if (!activeProcedure || !qualityToken) return savePromise;
  const snapshot = cloneData(activeProcedure);
  updateSaveState("pending");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    savePromise = savePromise
      .then(() => apiRequest("/api/procedures/save", {
        method: "POST",
        body: JSON.stringify({ procedure: snapshot }),
      }))
      .then(() => updateSaveState("saved"))
      .catch((error) => {
        updateSaveState("error");
        console.error("Falha ao salvar procedimento:", error);
      });
  }, 250);
  return savePromise;
}

async function flushProcedureSave() {
  if (!activeProcedure || !qualityToken) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  const snapshot = cloneData(activeProcedure);
  savePromise = savePromise
    .then(() => apiRequest("/api/procedures/save", {
      method: "POST",
      body: JSON.stringify({ procedure: snapshot }),
    }))
    .then(() => updateSaveState("saved"))
    .catch((error) => {
      updateSaveState("error");
      console.error("Falha ao salvar procedimento:", error);
    });
  await savePromise;
}

async function authenticateQuality(password) {
  const data = await apiRequest("/api/procedures/auth/quality", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
  qualityToken = data.token;
  sessionStorage.setItem(qualityTokenKey, qualityToken);
  return true;
}

async function loadProcedureFromServer() {
  if (!procedureId || procedureId === "default") return false;
  const data = await apiRequest(`/api/procedures/load?id=${encodeURIComponent(procedureId)}`);
  activeProcedure = data.procedure;
  normalizeProcedure(activeProcedure);
  return true;
}

async function publishProcedure() {
  await flushProcedureSave();
  const data = await apiRequest("/api/procedures/publish", {
    method: "POST",
    body: JSON.stringify({ procedure: activeProcedure }),
  });
  activeProcedure = data.procedure;
  normalizeProcedure(activeProcedure);
  return activeProcedure;
}

function setProcedureStatus(status) {
  activeProcedure.documentStatus = status;
  activeProcedure.qualityInfo.status = status;
  if (status !== "Publicado") activeProcedure.qualityInfo.approvalDate = "";
  saveProcedure();
}

async function deleteCurrentProcedure() {
  await flushProcedureSave();
  await apiRequest(`/api/procedures/delete?id=${encodeURIComponent(procedureId)}`, { method: "DELETE" });
  window.location.href = "index.html";
}

function createSlug(section) {
  return `sec-${section.number.replaceAll(".", "-")}`;
}

function getKindLabel(kind) {
  const labels = {
    items: "Itens",
    tools: "Ferramentas",
    step: "Etapa",
  };

  return labels[kind] || "Seção";
}

function classifyInstructionTone(instruction) {
  const text = normalizeText(instruction);

  if (
    text.startsWith("nao ") ||
    text.includes("nao forcar") ||
    text.includes("nao utilizar") ||
    text.includes("nao usar") ||
    text.includes("nao apertar")
  ) {
    return "danger";
  }

  if (
    text.includes("cuidado") ||
    text.includes("atencao") ||
    text.includes("verificar") ||
    text.includes("aguardar") ||
    text.includes("secagem") ||
    text.includes("correta antes")
  ) {
    return "warning";
  }

  return "success";
}

function getToneLabel(tone) {
  return {
    success: "Verde",
    warning: "Amarelo",
    danger: "Vermelho",
  }[tone] || "Verde";
}

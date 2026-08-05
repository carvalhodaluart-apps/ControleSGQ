async function addStepBlock(sectionIndex, cardIndex, type, tone = "success") {
  const card = activeProcedure.sections[sectionIndex]?.stepCards?.[cardIndex];
  if (!card) return;
  card.blocks = card.blocks || [];
  const nextLayer = Math.max(0, ...card.blocks.filter((block) => block.type !== "image").map((block) => Number(block.zIndex) || 0)) + 1;
  const imageCount = card.blocks.filter((block) => block.type === "image").length;
  const offset = Math.min(card.blocks.length * 5, 20);
  const sizeByType = {
    image: imageCount ? { w: 42, h: 40, x: 28 + offset, y: 14 + offset } : { w: 90, h: 90, x: 5, y: 5 },
    text: { w: 38, h: 14, x: 8 + offset, y: 14 + offset },
    arrow: { w: 8, h: 5, x: 46 + offset, y: 45 },
    circle: { w: 10, h: 18, x: 45 + offset, y: 42 },
    square: { w: 10, h: 18, x: 45 + offset, y: 42 },
  }[type] || { w: 38, h: 24, x: 8 + offset, y: 14 + offset };
  if (type === "circle" || type === "square") {
    const canvas = procedureRoot.querySelector(`[data-step-canvas="${sectionIndex}:${cardIndex}"]`);
    const canvasRect = canvas?.getBoundingClientRect();
    if (canvasRect?.width && canvasRect?.height) {
      sizeByType.w = sizeByType.h * (canvasRect.height / canvasRect.width);
    }
  }
  if (type === "image") {
    const position = findAvailableImagePosition(card.blocks, sizeByType.w, sizeByType.h);
    if (!position) return;
    sizeByType.x = position.x;
    sizeByType.y = position.y;
  }
  const pickedImage = type === "image" ? await pickProcedureImageFile().then((file) => (file ? resizeImage(file) : "")) : "";
  if (type === "image" && !pickedImage) return;
  card.blocks.push({
    id: createBlockId(type),
    type,
    text: type === "text" ? "Texto" : "",
    html: type === "text" ? "Texto" : "",
    tone,
    image: pickedImage,
    annotations: [],
    rotation: type === "arrow" ? 180 : 0,
    flipX: false,
    flipY: false,
    borderWidth: 3,
    fontSize: type === "text" ? 20 : 16,
    x: sizeByType.x,
    y: sizeByType.y,
    w: sizeByType.w,
    h: sizeByType.h,
    zIndex: type === "image" ? 0 : nextLayer,
  });
  if (type === "text") window.fabricPendingTextEdit = { sectionIndex, cardIndex, id: card.blocks[card.blocks.length - 1].id };
  syncStepCardSceneFromBlocks(sectionIndex, cardIndex);
  saveProcedure();
  renderProcedure(activeProcedure);
}

function syncStepCardSceneFromBlocks(sectionIndex, cardIndex) { const card = activeProcedure.sections[sectionIndex]?.stepCards?.[cardIndex]; if (card) window.SceneGraphCore?.syncCardSceneFromBlocks?.(card, sectionIndex, cardIndex); }

function imageBlocksOverlap(first, second) {
  return first.x < second.x + second.w
    && first.x + first.w > second.x
    && first.y < second.y + second.h
    && first.y + first.h > second.y;
}

function findAvailableImagePosition(blocks, width, height) {
  const candidates = [];
  for (let y = 2.5; y <= 100 - height; y += 2.5) {
    for (let x = 2.5; x <= 100 - width; x += 2.5) candidates.push({ x, y, w: width, h: height });
  }
  return candidates.find((candidate) => !(blocks || [])
    .some((block) => block.type === "image" && imageBlocksOverlap(candidate, block))) || null;
}

function canReorder(source, target) {
  if (!source || !target || source.type !== target.type) return false;
  if (source.type === "section") return source.index !== target.index;
  return source.sectionIndex === target.sectionIndex && source.index !== target.index;
}

function getReorderTargetItem(element, source) {
  if (!element?.closest) return null;
  if (source?.type === "section") return element.closest(".procedure-nav a[data-reorder-item]");
  return element.closest("[data-reorder-item]");
}

function moveInstruction(sectionIndex, instructionIndex, direction) {
  const section = activeProcedure.sections[sectionIndex];
  const targetIndex = instructionIndex + direction;
  if (targetIndex < 0 || targetIndex >= section.instructions.length) return;

  ["instructions", "instructionTones", "instructionImages"].forEach((key) => {
    const list = section[key];
    [list[instructionIndex], list[targetIndex]] = [list[targetIndex], list[instructionIndex]];
  });

  saveProcedure();
  renderProcedure(activeProcedure);
}

function removeInstruction(sectionIndex, instructionIndex) {
  const section = activeProcedure.sections[sectionIndex];
  ["instructions", "instructionTones", "instructionImages"].forEach((key) => section[key].splice(instructionIndex, 1));
  saveProcedure();
  renderProcedure(activeProcedure);
}

function getSectionImage(sectionIndex, imageIndex) {
  return activeProcedure.sections[sectionIndex]?.images?.[imageIndex] || "";
}

function getNextItemMarkerNumber(sectionIndex, image) {
  const markers = activeProcedure.sections[sectionIndex]?.annotations?.[image] || [];
  const usedNumbers = new Set(markers
    .filter((annotation) => annotation.type === "marker")
    .map((annotation) => Number(annotation.number))
    .filter((number) => Number.isInteger(number) && number > 0));

  let nextNumber = 1;
  while (usedNumbers.has(nextNumber)) nextNumber += 1;
  return String(nextNumber);
}

function ensureMaterialForMarker(sectionIndex, number) {
  const section = activeProcedure.sections[sectionIndex];
  if (!section) return;
  section.materials = section.materials || [];
  const markerNumber = String(number);
  if (section.materials.some((item) => String(item.number) === markerNumber)) return;

  section.materials.push({
    number: markerNumber,
    quantity: "",
    code: "",
    description: "",
  });

  section.materials.sort((a, b) => {
    const first = Number(a.number);
    const second = Number(b.number);
    if (Number.isFinite(first) && Number.isFinite(second)) return first - second;
    return String(a.number).localeCompare(String(b.number), "pt-BR", { numeric: true });
  });
}

function removeMaterialForMarker(sectionIndex, number) {
  const section = activeProcedure.sections[sectionIndex];
  if (!section?.materials) return;
  const markerNumber = String(number);
  section.materials = section.materials.filter((item) => String(item.number) !== markerNumber);
}

function removeMarkerForMaterial(sectionIndex, number) {
  const section = activeProcedure.sections[sectionIndex];
  const image = section?.images?.[0] || "";
  const annotations = image ? section?.annotations?.[image] : null;
  if (!annotations) return;
  const markerNumber = String(number);
  section.annotations[image] = annotations.filter((annotation) => (
    annotation.type !== "marker" || String(annotation.number) !== markerNumber
  ));
}

function clearItemMarkers(sectionIndex) {
  const section = activeProcedure.sections[sectionIndex];
  const image = section?.images?.[0] || "";
  if (!section || !image) return;
  section.materials = [];
  section.annotations = section.annotations || {};
  section.annotations[image] = (section.annotations[image] || []).filter((annotation) => annotation.type !== "marker");
}

function addAnnotation(sectionIndex, image, annotation) {
  const section = activeProcedure.sections[sectionIndex];
  section.annotations[image] = section.annotations[image] || [];
  section.annotations[image].push(annotation);
  saveProcedure();
  renderProcedure(activeProcedure);
}

function updateAnnotation(sectionIndex, image, annotationIndex, updates) {
  const annotation = activeProcedure.sections[sectionIndex]?.annotations?.[image]?.[annotationIndex];
  if (!annotation) return;
  Object.assign(annotation, updates);
  saveProcedure();
}

function removeAnnotation(sectionIndex, image, annotationIndex) {
  const annotations = activeProcedure.sections[sectionIndex]?.annotations?.[image];
  if (!annotations) return;
  annotations.splice(annotationIndex, 1);
  saveProcedure();
  renderProcedure(activeProcedure);
}

function getCardAnnotationList(sectionIndex, cardIndex, blockIndex = null) {
  const card = activeProcedure.sections[sectionIndex]?.stepCards?.[cardIndex];
  if (!card) return null;
  if (blockIndex !== null && blockIndex !== "") {
    const block = card.blocks?.[blockIndex];
    if (!block) return null;
    block.annotations = block.annotations || [];
    return block.annotations;
  }
  card.annotations = card.annotations || [];
  return card.annotations;
}

function addCardAnnotation(sectionIndex, cardIndex, annotation, blockIndex = null) {
  const annotations = getCardAnnotationList(sectionIndex, cardIndex, blockIndex);
  if (!annotations) return;
  annotations.push(annotation);
  saveProcedure();
  renderProcedure(activeProcedure);
}

function updateCardAnnotation(sectionIndex, cardIndex, annotationIndex, updates, blockIndex = null) {
  const annotation = getCardAnnotationList(sectionIndex, cardIndex, blockIndex)?.[annotationIndex];
  if (!annotation) return;
  Object.assign(annotation, updates);
  saveProcedure();
}

function removeCardAnnotation(sectionIndex, cardIndex, annotationIndex, blockIndex = null) {
  const annotations = getCardAnnotationList(sectionIndex, cardIndex, blockIndex);
  if (!annotations) return;
  annotations.splice(annotationIndex, 1);
  saveProcedure();
  renderProcedure(activeProcedure);
}

function addItemSection() {
  normalizeSectionNumbers(activeProcedure);
  const nextNumber = `${activeProcedure.sections.length + 1}.0`;
  activeProcedure.sections.push({
    number: nextNumber,
    title: "Itens necessários",
    kind: "items",
    instructions: [],
    images: [],
    tables: [],
    materials: [],
    annotations: {},
    stepCards: [],
  });
  saveProcedure();
  renderProcedure(activeProcedure);
}

function addStepSection() {
  normalizeSectionNumbers(activeProcedure);
  const sectionIndex = activeProcedure.sections.length;
  const nextNumber = `${activeProcedure.sections.length + 1}.0`;
  activeProcedure.sections.push({
    number: nextNumber,
    title: "Nova etapa",
    kind: "step",
    instructions: [],
    images: [],
    tables: [],
    materials: [],
    annotations: {},
    stepCards: [],
  });
  addStepCard(sectionIndex);
}

function addStepCard(sectionIndex) {
  const section = activeProcedure.sections[sectionIndex];
  const card = {
    tone: "success",
    text: "",
    textPosition: "above",
    image: "",
    annotations: [],
    blocks: [],
  };
  window.SceneGraphCore?.normalizeCardScene?.(card, sectionIndex, section.stepCards.length);
  section.stepCards.push(card);
  saveProcedure();
  renderProcedure(activeProcedure);
}

function addMaterial(sectionIndex) {
  const section = activeProcedure.sections[sectionIndex];
  section.materials.push({
    number: String(section.materials.length + 1),
    quantity: "",
    code: "",
    description: "",
  });
  saveProcedure();
  renderProcedure(activeProcedure);
}

function removeSection(sectionIndex) {
  activeProcedure.sections.splice(sectionIndex, 1);
  normalizeSectionNumbers(activeProcedure);
  saveProcedure();
  renderProcedure(activeProcedure);
}

function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const image = new Image();
      image.onerror = reject;
      image.onload = () => {
        const maxSize = 1400;
        const scale = Math.min(1, maxSize / image.width, maxSize / image.height);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        // PNG preserva o canal alpha de imagens sem fundo.
        resolve(canvas.toDataURL("image/png"));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function exportProcedure(asDraft = true) {
  const exportData = typeof createProcedureSaveSnapshot === "function" ? createProcedureSaveSnapshot(activeProcedure) : cloneData(activeProcedure);
  if (asDraft) {
    exportData.documentStatus = "Em elaboração";
    exportData.qualityInfo = {
      ...(exportData.qualityInfo || {}),
      status: "Em elaboração",
      approvalDate: "",
    };
  }
  const data = await apiRequest("/api/procedures/export-json", {
    method: "POST",
    body: JSON.stringify({ procedure: exportData }),
  });
  const procedure = data.procedure;
  let secureSave = { saved: false };
  try {
    if (window.secureProcedureFolder) secureSave = await window.secureProcedureFolder.writeProcedureJson(procedure);
  } catch (error) {
    console.warn("Falha ao salvar na pasta segura:", error);
  }
  if (secureSave.saved) {
    updateSaveState("saved", `JSON salvo em ${secureSave.folderName || "pasta segura"}`);
    markProcedureJsonClean();
    return;
  }
  const blob = new Blob([JSON.stringify(procedure, null, 2)], { type: "application/json" });
  triggerBlobDownload(blob, `${procedure.documentCode || procedure.equipmentCode || "procedimento"}.json`);
  markProcedureJsonClean();
}

async function withActionButtonLoading(button, label, task) {
  const originalText = button.textContent;
  button.style.minWidth = `${Math.ceil(button.getBoundingClientRect().width)}px`;
  button.disabled = true;
  button.dataset.loading = "true";
  button.setAttribute("aria-busy", "true");
  button.innerHTML = `<span class="button-spinner" aria-hidden="true"></span><span>${escapeHtml(label)}</span>`;
  try {
    return await task();
  } finally {
    button.disabled = false;
    button.dataset.loading = "false";
    button.setAttribute("aria-busy", "false");
    button.textContent = originalText;
    button.style.minWidth = "";
  }
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

async function requestProcedurePdf(shouldSave = true, procedure = activeProcedure, signal = null) {
  if (shouldSave) await flushProcedureSave();
  const response = await fetch("/api/procedures/export-pdf", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${qualityToken}`,
    },
    body: JSON.stringify({ procedure }),
    signal,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      clearAuthenticationState();
      updateSaveState("error", "Sessao expirada");
    }
    throw Object.assign(new Error(data.error || "Não foi possível gerar o PDF."), { status: response.status });
  }
  return response.blob();
}

const PROCEDURE_PDF_PRELOAD_DELAY = 2000;
let procedurePdfVersion = 0;
let procedurePdfCachedVersion = -1;
let procedurePdfCachedBlob = null;
let procedurePdfPreloadVersion = -1;
let procedurePdfPreloadTimer = null;
let procedurePdfPreloadPromise = null;
let procedurePdfAbortController = null;
let procedurePdfState = "outdated";

function getProcedurePdfStateLabel() {
  const labels = {
    outdated: "PDF desatualizado",
    scheduled: "PDF aguardando",
    generating: "Gerando PDF...",
    ready: "PDF pronto",
    error: "Erro no PDF",
  };
  return labels[procedurePdfState] || labels.outdated;
}

function updateProcedurePdfState(state) {
  procedurePdfState = state;
  document.querySelectorAll("[data-pdf-state]").forEach((element) => {
    element.dataset.pdfState = state;
    element.textContent = getProcedurePdfStateLabel();
  });
}

function canPreloadProcedurePdf() {
  return Boolean(activeProcedure && qualityToken && (!builderMode || elaborationAuthorized));
}

function resetProcedurePdfCache() {
  procedurePdfVersion += 1;
  procedurePdfCachedVersion = -1;
  procedurePdfCachedBlob = null;
  procedurePdfAbortController?.abort();
  procedurePdfAbortController = null;
  clearTimeout(procedurePdfPreloadTimer);
  procedurePdfPreloadTimer = null;
  updateProcedurePdfState("outdated");
}

function markProcedurePdfOutdated() {
  resetProcedurePdfCache();
  if (!canPreloadProcedurePdf()) return;
  updateProcedurePdfState("scheduled");
  procedurePdfPreloadTimer = setTimeout(() => {
    procedurePdfPreloadTimer = null;
    preloadProcedurePdf();
  }, PROCEDURE_PDF_PRELOAD_DELAY);
}

function getProcedurePdfBlob() {
  const version = procedurePdfVersion;
  if (procedurePdfCachedVersion === version && procedurePdfCachedBlob) {
    updateProcedurePdfState("ready");
    return Promise.resolve(procedurePdfCachedBlob);
  }
  if (procedurePdfPreloadVersion === version && procedurePdfPreloadPromise) return procedurePdfPreloadPromise;
  procedurePdfPreloadVersion = version;
  const controller = new AbortController();
  procedurePdfAbortController = controller;
  updateProcedurePdfState("generating");
  procedurePdfPreloadPromise = Promise.resolve(window.createProcedurePdfSnapshot?.(activeProcedure) || cloneData(activeProcedure))
    .then((snapshot) => {
      if (version !== procedurePdfVersion) throw new DOMException("Geracao desatualizada", "AbortError");
      return requestProcedurePdf(false, snapshot, controller.signal);
    })
    .then((blob) => {
    if (version === procedurePdfVersion) {
      procedurePdfCachedVersion = version;
      procedurePdfCachedBlob = blob;
      updateProcedurePdfState("ready");
    }
    return blob;
  }).catch((error) => {
    if (error.name !== "AbortError") updateProcedurePdfState("error");
    throw error;
  }).finally(() => {
    if (procedurePdfPreloadVersion === version) procedurePdfPreloadPromise = null;
    if (procedurePdfPreloadVersion === version) procedurePdfAbortController = null;
  });
  return procedurePdfPreloadPromise;
}

function preloadProcedurePdf() {
  if (!canPreloadProcedurePdf()) return;
  getProcedurePdfBlob().catch((error) => {
    if (error.name !== "AbortError") console.warn("Falha ao pre-gerar PDF:", error);
  });
}

function openPdfPreview(blob) {
  const url = URL.createObjectURL(blob);
  const overlay = document.createElement("div");
  overlay.className = "pdf-preview-backdrop";
  overlay.innerHTML = `
    <section class="pdf-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="pdfPreviewTitle">
      <header class="pdf-preview-header">
        <h2 id="pdfPreviewTitle">Visualização do PDF</h2>
        <button type="button" class="pdf-preview-close" aria-label="Fechar visualização">&times;</button>
      </header>
      <iframe title="Visualização do PDF"></iframe>
    </section>
  `;
  const close = () => {
    document.removeEventListener("keydown", handleKeydown);
    URL.revokeObjectURL(url);
    overlay.remove();
  };
  const handleKeydown = (event) => {
    if (event.key === "Escape") close();
  };
  overlay.querySelector("iframe").src = url;
  overlay.querySelector(".pdf-preview-close").addEventListener("click", close);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });
  document.addEventListener("keydown", handleKeydown);
  document.body.appendChild(overlay);
}

async function exportProcedurePdf() {
  openPdfPreview(await getProcedurePdfBlob());
}

async function downloadProcedurePdf() {
  const blob = await getProcedurePdfBlob();
  triggerBlobDownload(blob, `${activeProcedure.documentCode || activeProcedure.title || "procedimento"}.pdf`);
}

async function downloadPublishedProcedureFiles() {
  const snapshot = await Promise.resolve(window.createProcedurePdfSnapshot?.(activeProcedure) || cloneData(activeProcedure));
  const response = await fetch("/api/procedures/export-bundle", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${qualityToken}`,
    },
    body: JSON.stringify({ procedure: snapshot }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      clearAuthenticationState();
      updateSaveState("error", "Sessao expirada");
    }
    throw Object.assign(new Error(data.error || "Não foi possível gerar o pacote publicado."), { status: response.status });
  }
  triggerBlobDownload(await response.blob(), `${activeProcedure.documentCode || activeProcedure.title || "procedimento"}.zip`);
}

function getClickPosition(event, container) {
  const rect = container.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)),
    y: Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100)),
  };
}

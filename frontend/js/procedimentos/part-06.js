let elaborationAuthorized = !builderMode
  || activeProcedure?.elaborationAuthorized === true
  || activeProcedure?.documentStatus === "Publicado"
  || (!Object.prototype.hasOwnProperty.call(activeProcedure || {}, "elaborationAuthorized") && Boolean(requestedProcedureId));
let allowProcedureLeave = false;

function syncElaborationAuthorization() {
  if (!builderMode) {
    elaborationAuthorized = true;
    return;
  }
  elaborationAuthorized = activeProcedure?.elaborationAuthorized === true
    || activeProcedure?.documentStatus === "Publicado"
    || (!Object.prototype.hasOwnProperty.call(activeProcedure || {}, "elaborationAuthorized") && Boolean(requestedProcedureId));
}

function renderElaborationAuthorization() {
  if (!editMode || !builderMode || elaborationAuthorized) return "";
  return `
    <section class="elaboration-authorization-card" aria-labelledby="elaboration-authorization-title">
      <div>
        <span class="eyebrow">Próximo passo</span>
        <h2 id="elaboration-authorization-title">Autorizar elaboração</h2>
        <p>Preencha os campos do controle do documento. Depois da autorização, este documento será salvo como “Em elaboração” e poderá ser continuado pelo JSON correspondente.</p>
        <p class="elaboration-authorization-error" data-elaboration-authorize-error role="alert"></p>
      </div>
      <button type="button" class="primary-button" data-authorize-elaboration>Autorizar elaboração</button>
    </section>
  `;
}

async function reserveAutomaticDocumentNumber() {
  if (builderMode && !elaborationAuthorized) return;
  try {
    const data = await apiRequest("/api/procedures/next-number", {
      method: "POST",
      body: JSON.stringify({
        procedureId: activeProcedure.procedureId,
        documentType: activeProcedure.qualityInfo.documentType,
        sector: activeProcedure.qualityInfo.area,
        sectorPrefix: getSectorConfig(activeProcedure.qualityInfo.area).prefix,
      }),
    });
    activeProcedure.documentNumber = data.documentNumber;
    refreshDocumentCodeDisplays();
    saveProcedure();
    renderProcedure(activeProcedure);
  } catch (error) {
    console.error("Falha ao reservar número do documento:", error);
    updateSaveState("error", "Número não reservado");
  }
}

async function authorizeElaboration() {
  if (!activeProcedure || elaborationAuthorized) return;
  const button = procedureRoot.querySelector("[data-authorize-elaboration]");
  const errorBox = procedureRoot.querySelector("[data-elaboration-authorize-error]");
  if (button) button.disabled = true;
  if (errorBox) errorBox.textContent = "";
  try {
    const data = await apiRequest("/api/procedures/authorize", {
      method: "POST",
      body: JSON.stringify({ procedure: activeProcedure }),
    });
    activeProcedure = data.procedure;
    normalizeProcedure(activeProcedure);
    elaborationAuthorized = true;
    renderProcedure(activeProcedure);
  } catch (error) {
    if (errorBox) errorBox.textContent = error.message;
    if (button) button.disabled = false;
  }
}

function requiresDraftExportBeforeLeave() {
  return !allowProcedureLeave
    && builderMode
    && elaborationAuthorized
    && procedureDirtySinceJsonExport
    && activeProcedure?.documentStatus !== "Publicado";
}

async function leaveProcedureEditor(event) {
  if (!requiresDraftExportBeforeLeave()) return;
  event.preventDefault();
  const link = event.currentTarget;
  const confirmed = await showConfirmDialog({
    title: "Baixar edição antes de sair?",
    message: "Este documento está em elaboração. Baixe o JSON para garantir que todas as alterações possam ser recuperadas antes de voltar.",
    confirmLabel: "Baixar JSON e voltar",
    cancelLabel: "Continuar editando",
    variant: "primary",
  });
  if (!confirmed) return;
  try {
    await flushProcedureSave();
    await exportProcedure(true);
    allowProcedureLeave = true;
    window.location.href = link.href;
  } catch (error) {
    updateSaveState("error", "JSON não baixado");
    await showConfirmDialog({
      title: "Não foi possível baixar o JSON",
      message: error.message || "Verifique a conexão com o backend e tente novamente.",
      confirmLabel: "Fechar",
      cancelLabel: "",
      variant: "danger",
    });
  }
}

document.querySelector(".back-link")?.addEventListener("click", leaveProcedureEditor);
window.addEventListener("beforeunload", (event) => {
  if (!requiresDraftExportBeforeLeave()) return;
  event.preventDefault();
  event.returnValue = "";
});

function hasProcedureTitle() {
  return Boolean(activeProcedure?.title?.trim()) && activeProcedure.title !== "Novo procedimento";
}

procedureRoot.addEventListener("change", async (event) => {
  const documentType = event.target?.closest?.("[data-document-type]");
  if (documentType) {
    activeProcedure.qualityInfo.documentType = documentType.value;
    if (hasProcedureTitle()) await reserveAutomaticDocumentNumber();
    else await reserveAutomaticDocumentNumber();
    return;
  }

  const sector = event.target?.closest?.("[data-sector]");
  if (sector) {
    activeProcedure.qualityInfo.area = sector.value;
    if (hasProcedureTitle()) await reserveAutomaticDocumentNumber();
    else await reserveAutomaticDocumentNumber();
    return;
  }

  const procedureEquipmentCode = event.target?.closest?.("[data-procedure-equipment-code]");
  if (procedureEquipmentCode) {
    if (procedureEquipmentCode.value === "SEM_IMAGEM") {
      activeProcedure.equipmentImageMode = "none";
      saveProcedure();
      renderProcedure(activeProcedure);
      return;
    }
    const code = procedureEquipmentCode.value || "NOVO";
    activeProcedure.equipmentCode = code;
    activeProcedure.equipmentName = getEquipmentName(code);
    activeProcedure.equipmentImageMode = "auto";
    if (code !== "OUTROS") activeProcedure.customEquipmentImage = "";
    saveProcedure();
    renderProcedure(activeProcedure);
    return;
  }

  const equipmentImageInput = event.target?.closest?.("[data-equipment-image-import]");
  if (equipmentImageInput?.files?.[0]) {
    activeProcedure.customEquipmentImage = await resizeImage(equipmentImageInput.files[0]);
    saveProcedure();
    renderProcedure(activeProcedure);
    return;
  }

  const imageSelect = event.target?.closest?.("[data-set-instruction-image]");
  if (imageSelect) {
    const [sectionIndex, instructionIndex] = imageSelect.dataset.setInstructionImage.split(":").map(Number);
    activeProcedure.sections[sectionIndex].instructionImages[instructionIndex] = imageSelect.value;
    saveProcedure();
    renderProcedure(activeProcedure);
    return;
  }

  const imageInput = event.target?.closest?.("[data-import-image]");
  if (imageInput?.files?.length) {
    const sectionIndex = Number(imageInput.dataset.importImage);
    const convertedImages = await Promise.all([...imageInput.files].map(resizeImage));
    activeProcedure.sections[sectionIndex].images.push(...convertedImages);
    saveProcedure();
    renderProcedure(activeProcedure);
    return;
  }

  const itemImageInput = event.target?.closest?.("[data-item-image-import]");
  if (itemImageInput?.files?.length) {
    const sectionIndex = Number(itemImageInput.dataset.itemImageImport);
    const [convertedImage] = await Promise.all([...itemImageInput.files].slice(0, 1).map(resizeImage));
    const section = activeProcedure.sections[sectionIndex];
    section.images = convertedImage ? [convertedImage] : [];
    section.annotations = convertedImage ? { [convertedImage]: [] } : {};
    pendingAnnotation = null;
    saveProcedure();
    renderProcedure(activeProcedure);
    return;
  }

  const jsonInput = event.target?.closest?.("[data-import-json]");
  if (jsonInput?.files?.[0]) {
    const importedProcedure = JSON.parse(await jsonInput.files[0].text());
    const data = await apiRequest("/api/procedures/import", {
      method: "POST",
      body: JSON.stringify({ procedure: importedProcedure }),
    });
    activeProcedure = data.procedure;
    normalizeProcedure(activeProcedure);
    elaborationAuthorized = true;
    saveProcedure();
    renderProcedure(activeProcedure);
  }
});

procedureRoot.addEventListener("click", (event) => {
  if (event.target?.closest?.("[data-authorize-elaboration]")) {
    authorizeElaboration();
    return;
  }
  const summary = event.target.closest?.(".canvas-toolbar details > summary");
  if (!summary) return;
  const openedMenu = summary.parentElement;
  procedureRoot.querySelectorAll(".canvas-toolbar details[open]").forEach((menu) => {
    if (menu !== openedMenu) menu.open = false;
  });
});

procedureRoot.addEventListener("dragstart", (event) => {
  const handle = event.target?.closest?.("[data-drag-handle]");
  if (!editMode || !handle) return;

  reorderDrag = parseReorderValue(handle.dataset.dragHandle);
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", handle.dataset.dragHandle);
  handle.closest("[data-reorder-item]")?.classList.add("is-dragging");
});

procedureRoot.addEventListener("dragover", (event) => {
  if (!reorderDrag) return;
  const targetItem = getReorderTargetItem(event.target, reorderDrag);
  const target = parseReorderValue(targetItem?.dataset.reorderItem);

  procedureRoot.querySelectorAll(".is-drag-over").forEach((item) => item.classList.remove("is-drag-over"));
  if (!targetItem || !canReorder(reorderDrag, target)) return;

  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  targetItem.classList.add("is-drag-over");
});

procedureRoot.addEventListener("drop", (event) => {
  if (!reorderDrag) return;
  const targetItem = getReorderTargetItem(event.target, reorderDrag);
  const target = parseReorderValue(targetItem?.dataset.reorderItem);

  procedureRoot.querySelectorAll(".is-drag-over, .is-dragging").forEach((item) => {
    item.classList.remove("is-drag-over", "is-dragging");
  });

  if (!targetItem || !canReorder(reorderDrag, target)) {
    reorderDrag = null;
    return;
  }

  event.preventDefault();
  if (reorderEditorItem(reorderDrag, target)) {
    normalizeSectionNumbers(activeProcedure);
    saveProcedure();
    renderProcedure(activeProcedure);
  }
  reorderDrag = null;
});

procedureRoot.addEventListener("dragend", () => {
  reorderDrag = null;
  procedureRoot.querySelectorAll(".is-drag-over, .is-dragging").forEach((item) => {
    item.classList.remove("is-drag-over", "is-dragging");
  });
});

procedureRoot.addEventListener("pointerdown", (event) => {
  if (editMode && event.target?.closest?.(".step-card-canvas.has-fabric-editor, .canvas-ribbon")) return;

  if (!editMode || event.target?.closest?.("button")) return;
  const annotation = event.target?.closest?.("[data-annotation]");
  const imageContainer = event.target?.closest?.(".procedure-image-link.is-editable");
  if (!annotation || !imageContainer) return;

  event.preventDefault();
  const [sectionIndex, imageIndex, annotationIndex, cardIndex, blockIndex] = annotation.dataset.annotation.split(":");
  dragState = {
    sectionIndex: Number(sectionIndex),
    image: getSectionImage(Number(sectionIndex), Number(imageIndex)),
    annotationIndex: Number(annotationIndex),
    cardIndex: cardIndex === "" ? null : Number(cardIndex),
    blockIndex: blockIndex === "" ? null : Number(blockIndex),
    container: imageContainer,
    element: annotation,
  };
  annotation.setPointerCapture?.(event.pointerId);
});

window.addEventListener("pointermove", (event) => {
  if (!dragState) return;
  const point = getClickPosition(event, dragState.container);
  dragState.element.style.left = `${point.x}%`;
  dragState.element.style.top = `${point.y}%`;
  if (dragState.cardIndex === null) {
    updateAnnotation(dragState.sectionIndex, dragState.image, dragState.annotationIndex, point);
  } else {
    updateCardAnnotation(dragState.sectionIndex, dragState.cardIndex, dragState.annotationIndex, point, dragState.blockIndex);
  }
});

window.addEventListener("pointerup", () => {
  if (dragState) saveProcedure();
  dragState = null;
});

function renderProcedureLoadError(error) {
  const statusMessage = error?.status === 401
    ? "Sua sessão expirou. Volte ao criador, entre novamente e tente continuar o documento."
    : error?.status === 404
      ? "Este documento não foi encontrado no armazenamento atual. Confirme se o backend está conectado ao mesmo banco de dados."
      : "Não foi possível carregar este documento. Verifique a conexão com o backend e tente novamente.";
  document.title = "Erro ao abrir procedimento | Equipamentos";
  procedureRoot.innerHTML = `<section class="missing-page procedure-load-error" role="alert"><span class="eyebrow">Falha ao abrir</span><h1>Não foi possível abrir o procedimento</h1><p>${escapeHtml(statusMessage)}</p><p class="procedure-load-error-detail">${escapeHtml(error?.message || "Erro desconhecido.")}</p><a class="primary-link" href="index.html">Voltar para o criador</a></section>`;
}

window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  pendingAnnotation = null;
  procedureRoot.querySelectorAll("details[open]").forEach((details) => {
    details.open = false;
  });
});

async function bootProcedureEditor() {
  if (!qualityToken) {
    const authorized = await showPasswordDialog();
    if (!authorized) return builderMode ? window.location.assign("index.html") : renderEmptyState();
  }

  try {
    try {
      await loadProcedureConfiguration();
      await loadProcedureFromServer();
    } catch (error) {
      if (!String(error.message).toLowerCase().includes("acesso")) throw error;
      qualityToken = "";
      sessionStorage.removeItem(qualityTokenKey);
      if (!await showPasswordDialog()) return builderMode ? window.location.assign("index.html") : renderEmptyState();
      await loadProcedureConfiguration();
      await loadProcedureFromServer();
    }
    syncElaborationAuthorization();
    if (builderMode) {
      setProcedureStatus("Em elaboração");
      if (elaborationAuthorized) {
        await reserveAutomaticDocumentNumber();
        await flushProcedureSave();
      }
    }
    renderProcedure(activeProcedure);
    markProcedureJsonClean();
  } catch (error) {
    console.error("Falha ao carregar procedimento:", error);
    if (builderMode && (!requestedProcedureId || params.get("novo") === "1")) {
      activeProcedure = activeProcedure || createBlankProcedure();
      normalizeProcedure(activeProcedure);
      renderProcedure(activeProcedure);
      return;
    }
    renderProcedureLoadError(error);
  }
}

bootProcedureEditor();

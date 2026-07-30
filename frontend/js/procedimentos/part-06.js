procedureRoot.addEventListener("change", async (event) => {
  const documentType = event.target.closest("[data-document-type]");
  if (documentType) {
    activeProcedure.qualityInfo.documentType = documentType.value;
    refreshDocumentCodeDisplays();
    saveProcedure();
    renderProcedure(activeProcedure);
    return;
  }

  const procedureEquipmentCode = event.target.closest("[data-procedure-equipment-code]");
  if (procedureEquipmentCode) {
    const code = procedureEquipmentCode.value || "NOVO";
    activeProcedure.equipmentCode = code;
    activeProcedure.equipmentName = getEquipmentName(code);
    if (code !== "OUTROS") activeProcedure.customEquipmentImage = "";
    saveProcedure();
    renderProcedure(activeProcedure);
    return;
  }

  const equipmentImageInput = event.target.closest("[data-equipment-image-import]");
  if (equipmentImageInput?.files?.[0]) {
    activeProcedure.customEquipmentImage = await resizeImage(equipmentImageInput.files[0]);
    saveProcedure();
    renderProcedure(activeProcedure);
    return;
  }

  const stepCardTone = event.target.closest("[data-step-card-tone]");
  if (stepCardTone) {
    const [sectionIndex, cardIndex, tone] = stepCardTone.dataset.stepCardTone.split(":");
    activeProcedure.sections[sectionIndex].stepCards[cardIndex].tone = tone;
    saveProcedure();
    renderProcedure(activeProcedure);
    return;
  }

  const stepCardPosition = event.target.closest("[data-step-card-position]");
  if (stepCardPosition) {
    const [sectionIndex, cardIndex] = stepCardPosition.dataset.stepCardPosition.split(":").map(Number);
    activeProcedure.sections[sectionIndex].stepCards[cardIndex].textPosition = stepCardPosition.value;
    saveProcedure();
    renderProcedure(activeProcedure);
    return;
  }

  const stepCardImage = event.target.closest("[data-step-card-image]");
  if (stepCardImage) {
    const [sectionIndex, cardIndex] = stepCardImage.dataset.stepCardImage.split(":").map(Number);
    activeProcedure.sections[sectionIndex].stepCards[cardIndex].image = stepCardImage.value;
    activeProcedure.sections[sectionIndex].stepCards[cardIndex].annotations = [];
    saveProcedure();
    renderProcedure(activeProcedure);
    return;
  }

  const stepBlockImage = event.target.closest("[data-step-block-image]");
  if (stepBlockImage) {
    const [sectionIndex, cardIndex, blockIndex] = stepBlockImage.dataset.stepBlockImage.split(":").map(Number);
    const block = activeProcedure.sections[sectionIndex]?.stepCards?.[cardIndex]?.blocks?.[blockIndex];
    if (block) {
      block.image = stepBlockImage.value;
      block.annotations = [];
      saveProcedure();
      renderProcedure(activeProcedure);
    }
    return;
  }

  const imageSelect = event.target.closest("[data-set-instruction-image]");
  if (imageSelect) {
    const [sectionIndex, instructionIndex] = imageSelect.dataset.setInstructionImage.split(":").map(Number);
    activeProcedure.sections[sectionIndex].instructionImages[instructionIndex] = imageSelect.value;
    saveProcedure();
    renderProcedure(activeProcedure);
    return;
  }

  const imageInput = event.target.closest("[data-import-image]");
  if (imageInput?.files?.length) {
    const sectionIndex = Number(imageInput.dataset.importImage);
    const convertedImages = await Promise.all([...imageInput.files].map(resizeImage));
    activeProcedure.sections[sectionIndex].images.push(...convertedImages);
    saveProcedure();
    renderProcedure(activeProcedure);
    return;
  }

  const itemImageInput = event.target.closest("[data-item-image-import]");
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

  const stepBlockImageInput = event.target.closest("[data-step-block-image-import]");
  if (stepBlockImageInput?.files?.length) {
    const [sectionIndex, cardIndex, blockIndex] = stepBlockImageInput.dataset.stepBlockImageImport.split(":").map(Number);
    const [convertedImage] = await Promise.all([...stepBlockImageInput.files].slice(0, 1).map(resizeImage));
    const block = activeProcedure.sections[sectionIndex]?.stepCards?.[cardIndex]?.blocks?.[blockIndex];
    if (block && convertedImage) {
      block.image = convertedImage;
      block.annotations = [];
      saveProcedure();
      renderProcedure(activeProcedure);
    }
    return;
  }

  const jsonInput = event.target.closest("[data-import-json]");
  if (jsonInput?.files?.[0]) {
    const importedProcedure = JSON.parse(await jsonInput.files[0].text());
    const data = await apiRequest("/api/procedures/import", {
      method: "POST",
      body: JSON.stringify({ procedure: importedProcedure }),
    });
    activeProcedure = data.procedure;
    normalizeProcedure(activeProcedure);
    saveProcedure();
    renderProcedure(activeProcedure);
  }
});

procedureRoot.addEventListener("click", (event) => {
  const summary = event.target.closest?.(".canvas-toolbar details > summary");
  if (!summary) return;
  const openedMenu = summary.parentElement;
  procedureRoot.querySelectorAll(".canvas-toolbar details[open]").forEach((menu) => {
    if (menu !== openedMenu) menu.open = false;
  });
});

procedureRoot.addEventListener("dragstart", (event) => {
  const handle = event.target.closest("[data-drag-handle]");
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
  if (editMode) {
    const stepBlock = event.target.closest("[data-step-block]");
    selectStepBlock(stepBlock?.dataset.stepBlock || null);
  }

  const stepBlockResize = event.target.closest("[data-step-block-resize]");
  if (editMode && stepBlockResize) {
    event.preventDefault();
    const [sectionIndex, cardIndex, blockIndex, type] = stepBlockResize.dataset.stepBlockResize.split(":");
    const blockElement = stepBlockResize.closest("[data-step-block]");
    const canvas = stepBlockResize.closest("[data-step-canvas]");
    const block = activeProcedure.sections[sectionIndex]?.stepCards?.[cardIndex]?.blocks?.[blockIndex];
    if (!blockElement || !canvas || !block) return;

    layoutDragState = {
      mode: "resize",
      sectionIndex: Number(sectionIndex),
      cardIndex: Number(cardIndex),
      blockIndex: Number(blockIndex),
      blockType: type,
      canvas,
      element: blockElement,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: block.x,
      startY: block.y,
      startWidth: block.w,
      startHeight: block.h,
    };
    blockElement.classList.add("is-moving");
    stepBlockResize.setPointerCapture?.(event.pointerId);
    return;
  }

  const stepBlockDrag = event.target.closest("[data-step-block-drag]");
  if (editMode && stepBlockDrag) {
    event.preventDefault();
    const [sectionIndex, cardIndex, blockIndex] = stepBlockDrag.dataset.stepBlockDrag.split(":").map(Number);
    const blockElement = stepBlockDrag.closest("[data-step-block]");
    const canvas = stepBlockDrag.closest("[data-step-canvas]");
    const block = activeProcedure.sections[sectionIndex]?.stepCards?.[cardIndex]?.blocks?.[blockIndex];
    if (!blockElement || !canvas || !block) return;

    layoutDragState = {
      mode: "move",
      sectionIndex,
      cardIndex,
      blockIndex,
      blockType: block.type,
      canvas,
      element: blockElement,
      offsetX: event.clientX - blockElement.getBoundingClientRect().left,
      offsetY: event.clientY - blockElement.getBoundingClientRect().top,
    };
    blockElement.classList.add("is-moving");
    stepBlockDrag.setPointerCapture?.(event.pointerId);
    return;
  }

  if (!editMode || event.target.closest("button")) return;
  const annotation = event.target.closest("[data-annotation]");
  const imageContainer = event.target.closest(".procedure-image-link.is-editable");
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

function cardForLayoutDrag() {
  return activeProcedure.sections[layoutDragState.sectionIndex]?.stepCards?.[layoutDragState.cardIndex];
}

window.addEventListener("pointermove", (event) => {
  if (layoutDragState) {
    const block = activeProcedure.sections[layoutDragState.sectionIndex]?.stepCards?.[layoutDragState.cardIndex]?.blocks?.[layoutDragState.blockIndex];
    if (!block) return;

    const canvasRect = layoutDragState.canvas.getBoundingClientRect();
    if (layoutDragState.mode === "resize") {
      const isFreeElement = isFreeCanvasElement(layoutDragState.blockType);
      const rawWidth = ((event.clientX - canvasRect.left) / canvasRect.width) * 100 - block.x;
      const rawHeight = ((event.clientY - canvasRect.top) / canvasRect.height) * 100 - block.y;
      const width = isFreeElement ? snapFine(rawWidth) : snapToGrid(rawWidth);
      const height = isFreeElement ? snapFine(rawHeight) : snapToGrid(rawHeight);
      if (layoutDragState.blockType === "circle" || layoutDragState.blockType === "square") {
        const availableWidthPx = Math.max(24, ((100 - block.x) / 100) * canvasRect.width);
        const availableHeightPx = Math.max(24, ((100 - block.y) / 100) * canvasRect.height);
        const widthPx = Math.max(24, (width / 100) * canvasRect.width);
        const heightPx = Math.max(24, (height / 100) * canvasRect.height);
        const sizePx = Math.min(availableWidthPx, availableHeightPx, Math.max(widthPx, heightPx));
        block.w = (sizePx / canvasRect.width) * 100;
        block.h = (sizePx / canvasRect.height) * 100;
      } else if (layoutDragState.blockType === "arrow") {
        const rotation = (Number(block.rotation) || 0) * Math.PI / 180;
        const deltaX = event.clientX - layoutDragState.startClientX;
        const deltaY = event.clientY - layoutDragState.startClientY;
        const axisMovement = deltaX * Math.cos(rotation) + deltaY * Math.sin(rotation);
        const widthDelta = (axisMovement / canvasRect.width) * 100;
        const nextWidth = Math.max(8, Math.min(100, layoutDragState.startWidth + widthDelta));
        const widthChange = nextWidth - layoutDragState.startWidth;
        const startCenterX = layoutDragState.startX + layoutDragState.startWidth / 2;
        const startCenterY = layoutDragState.startY + layoutDragState.startHeight / 2;
        const nextCenterX = startCenterX + (widthChange / 2) * Math.cos(rotation);
        const nextCenterY = startCenterY + (widthChange / 2) * Math.sin(rotation);
        block.w = nextWidth;
        block.x = Math.max(0, Math.min(100 - block.w, nextCenterX - block.w / 2));
        block.y = Math.max(0, Math.min(100 - block.h, nextCenterY - block.h / 2));
      } else {
        const minWidth = layoutDragState.blockType === "text" ? 8 : 10;
        const minHeight = layoutDragState.blockType === "text" ? 5 : 10;
        const nextWidth = Math.max(minWidth, Math.min(100 - block.x, width));
        const nextHeight = Math.max(minHeight, Math.min(100 - block.y, height));
        if (block.type === "image" && !canPlaceImageBlock(cardForLayoutDrag(), layoutDragState.blockIndex, {
          ...block,
          w: nextWidth,
          h: nextHeight,
        })) return;
        block.w = nextWidth;
        block.h = nextHeight;
      }
      layoutDragState.element.style.left = `${block.x}%`;
      layoutDragState.element.style.top = `${block.y}%`;
      layoutDragState.element.style.width = `${block.w}%`;
      layoutDragState.element.style.height = `${block.h}%`;
      return;
    }

    const x = ((event.clientX - canvasRect.left - layoutDragState.offsetX) / canvasRect.width) * 100;
    const y = ((event.clientY - canvasRect.top - layoutDragState.offsetY) / canvasRect.height) * 100;
    const nextPosition = clampBlockPosition(block, x, y, isFreeCanvasElement(layoutDragState.blockType));
    if (block.type === "image" && !canPlaceImageBlock(cardForLayoutDrag(), layoutDragState.blockIndex, {
      ...block,
      ...nextPosition,
    })) return;
    Object.assign(block, nextPosition);
    layoutDragState.element.style.left = `${block.x}%`;
    layoutDragState.element.style.top = `${block.y}%`;
    return;
  }

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
  if (layoutDragState) {
    layoutDragState.element.classList.remove("is-moving");
    saveProcedure();
    layoutDragState = null;
  }
  if (dragState) saveProcedure();
  dragState = null;
});

window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  pendingAnnotation = null;
  selectStepBlock(null);
  procedureRoot.querySelectorAll("details[open]").forEach((details) => {
    details.open = false;
  });
});

async function bootProcedureEditor() {
  if (!qualityToken) {
    const authorized = await showPasswordDialog();
    if (!authorized) return renderEmptyState();
  }

  try {
    try {
      await loadProcedureFromServer();
    } catch (error) {
      if (!String(error.message).toLowerCase().includes("acesso")) throw error;
      qualityToken = "";
      sessionStorage.removeItem(qualityTokenKey);
      if (!await showPasswordDialog()) return renderEmptyState();
      await loadProcedureFromServer();
    }
    if (builderMode) {
      setProcedureStatus("Em elaboração");
      await flushProcedureSave();
    }
    renderProcedure(activeProcedure);
  } catch (error) {
    console.error("Falha ao carregar procedimento:", error);
    renderEmptyState();
  }
}

bootProcedureEditor();

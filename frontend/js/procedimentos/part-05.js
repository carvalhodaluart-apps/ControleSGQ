function refreshItemNumberingButton(sectionIndex) {
  const button = procedureRoot.querySelector(`[data-item-numbering="${sectionIndex}"]`);
  if (!button) return;
  const active = pendingAnnotation?.type === "itemMarker" && pendingAnnotation.sectionIndex === sectionIndex;
  button.classList.toggle("is-active", active);
  button.setAttribute("aria-pressed", active ? "true" : "false");
}

procedureRoot.addEventListener("click", async (event) => {
  const toggleEdit = event.target?.closest?.("[data-toggle-edit]");
  if (toggleEdit) {
    if (!canEditProcedures) return;
    if (!editMode) {
      const authorized = await showPasswordDialog();
      if (!authorized) return;
      setProcedureStatus("Em elaboração");
    }
    editMode = !editMode;
    pendingAnnotation = null;
    renderProcedure(activeProcedure);
    return;
  }
  if (event.target?.closest?.("[data-add-item-section]")) {
    addItemSection();
    return;
  }

  if (event.target?.closest?.("[data-add-step-section]")) {
    addStepSection();
    return;
  }
  const publishButton = event.target?.closest?.("[data-publish-procedure]");
  if (publishButton) {
    if (!(await showPasswordDialog("Digite a senha da qualidade para publicar este procedimento."))) return;
    const confirmed = await showConfirmDialog({
      title: "Publicar procedimento?",
      message: "O procedimento será marcado como publicado e os arquivos finais serão baixados.",
      confirmLabel: "Publicar",
      variant: "primary",
    });
    if (!confirmed) return;
    try {
      await withActionButtonLoading(publishButton, "Publicando...", async () => {
        await publishProcedure();
        await downloadPublishedProcedureFiles();
      });
    } finally {
      renderProcedure(activeProcedure);
    }
    return;
  }
  const deleteProcedureButton = event.target?.closest?.("[data-delete-procedure]");
  if (deleteProcedureButton) {
    if (!(await showPasswordDialog("Digite a senha da qualidade para excluir este procedimento."))) return;
    const confirmed = await showConfirmDialog({
      title: "Excluir procedimento?",
      message: "Esta ação remove o procedimento por completo da lista deste equipamento.",
      confirmLabel: "Excluir",
    });
    if (!confirmed) return;
    await deleteCurrentProcedure();
    return;
  }

  const addStepCardButton = event.target?.closest?.("[data-add-step-card]");
  if (addStepCardButton) {
    addStepCard(Number(addStepCardButton.dataset.addStepCard));
    return;
  }

  const addMaterialButton = event.target?.closest?.("[data-add-material]");
  if (addMaterialButton) {
    addMaterial(Number(addMaterialButton.dataset.addMaterial));
    return;
  }

  const removeMaterialButton = event.target?.closest?.("[data-remove-material]");
  if (removeMaterialButton) {
    if (!(await confirmRemoval("este material"))) return;
    const [sectionIndex, materialIndex] = removeMaterialButton.dataset.removeMaterial.split(":").map(Number);
    const [removedMaterial] = activeProcedure.sections[sectionIndex].materials.splice(materialIndex, 1);
    if (removedMaterial?.number) removeMarkerForMaterial(sectionIndex, removedMaterial.number);
    saveProcedure();
    refreshProcedureSection(sectionIndex);
    return;
  }

  const clearItemMarkersButton = event.target?.closest?.("[data-clear-item-markers]");
  if (clearItemMarkersButton) {
    const confirmed = await showConfirmDialog({
      title: "Limpar elementos?",
      message: "Isso remove todos os números da imagem e todos os materiais da lista lateral.",
      confirmLabel: "Limpar",
    });
    if (!confirmed) return;
    clearItemMarkers(Number(clearItemMarkersButton.dataset.clearItemMarkers));
    pendingAnnotation = null;
    saveProcedure();
    refreshProcedureSection(Number(clearItemMarkersButton.dataset.clearItemMarkers));
    return;
  }

  const removeSectionButton = event.target?.closest?.("[data-remove-section]");
  if (removeSectionButton) {
    if (!(await confirmRemoval("este card"))) return;
    removeSection(Number(removeSectionButton.dataset.removeSection));
    return;
  }

  const addRevisionButton = event.target?.closest?.("[data-add-revision-row]");
  if (addRevisionButton && !await showConfirmDialog({ title: "Adicionar revisão?", message: "Uma nova revisão será criada no final do controle.", confirmLabel: "Adicionar", variant: "primary" })) return;
  if (addRevisionButton) {
    const columns = activeProcedure.revision[0]?.length || 5;
    const nextRow = Array.from({ length: columns }, () => "");
    nextRow[0] = formatRevisionNumber(activeProcedure.revision.length - 1);
    activeProcedure.revision.push(nextRow);
    normalizeRevisionNumbers(activeProcedure);
    refreshDocumentCodeDisplays();
    saveProcedure();
    refreshRevisionEditor();
    return;
  }
  const removeRevisionButton = event.target?.closest?.("[data-remove-revision-row]");
  if (removeRevisionButton) {
    if (activeProcedure.revision.length <= 2) return showConfirmDialog({ title: "Revisão inicial", message: "A revisão 00 é a base do documento e não pode ser removida.", confirmLabel: "Entendi", variant: "primary" });
    if (!(await showPasswordDialog("Digite a senha da qualidade para remover esta revisão."))) return;
    activeProcedure.revision.splice(Number(removeRevisionButton.dataset.removeRevisionRow), 1);
    normalizeRevisionNumbers(activeProcedure);
    refreshDocumentCodeDisplays();
    saveProcedure();
    refreshRevisionEditor();
    return;
  }
  const addButton = event.target?.closest?.("[data-add-instruction]");
  if (addButton) {
    addInstruction(Number(addButton.dataset.addInstruction), addButton.dataset.tone);
    return;
  }

  const toneButton = event.target?.closest?.("[data-set-tone]");
  if (toneButton) {
    const [sectionIndex, instructionIndex, tone] = toneButton.dataset.setTone.split(":");
    activeProcedure.sections[sectionIndex].instructionTones[instructionIndex] = tone;
    saveProcedure();
    refreshProcedureSection(Number(sectionIndex));
    return;
  }

  const addStepBlockButton = event.target?.closest?.("[data-add-step-block]");
  if (addStepBlockButton) {
    const [sectionIndex, cardIndex, type, tone] = addStepBlockButton.dataset.addStepBlock.split(":");
    await addStepBlock(Number(sectionIndex), Number(cardIndex), type, tone || "success");
    return;
  }

  const moveStepCardButton = event.target?.closest?.("[data-move-step-card]");
  if (moveStepCardButton) {
    const [sectionIndex, cardIndex, direction] = moveStepCardButton.dataset.moveStepCard.split(":").map(Number);
    const cards = activeProcedure.sections[sectionIndex].stepCards;
    const targetIndex = cardIndex + direction;
    if (targetIndex >= 0 && targetIndex < cards.length) {
      [cards[cardIndex], cards[targetIndex]] = [cards[targetIndex], cards[cardIndex]];
      saveProcedure();
      refreshProcedureSection(Number(moveStepCardButton.dataset.moveStepCard.split(":")[0]));
    }
    return;
  }

  const removeStepCardButton = event.target?.closest?.("[data-remove-step-card]");
  if (removeStepCardButton) {
    if (!(await confirmRemoval("este card de etapa"))) return;
    const [sectionIndex, cardIndex] = removeStepCardButton.dataset.removeStepCard.split(":").map(Number);
    activeProcedure.sections[sectionIndex].stepCards.splice(cardIndex, 1);
    saveProcedure();
    refreshProcedureSection(sectionIndex);
    return;
  }

  const moveButton = event.target?.closest?.("[data-move-instruction]");
  if (moveButton) {
    const [sectionIndex, instructionIndex, direction] = moveButton.dataset.moveInstruction.split(":").map(Number);
    moveInstruction(sectionIndex, instructionIndex, direction);
    return;
  }

  const removeButton = event.target?.closest?.("[data-remove-instruction]");
  if (removeButton) {
    if (!(await confirmRemoval("esta caixa de texto"))) return;
    const [sectionIndex, instructionIndex] = removeButton.dataset.removeInstruction.split(":").map(Number);
    removeInstruction(sectionIndex, instructionIndex);
    return;
  }

  const arrowButton = event.target?.closest?.("[data-pending-arrow]");
  if (arrowButton) {
    const [sectionIndex, imageIndex, tone] = arrowButton.dataset.pendingArrow.split(":");
    pendingAnnotation = { type: "arrow", sectionIndex: Number(sectionIndex), imageIndex: Number(imageIndex), tone };
    return;
  }

  const markerButton = event.target?.closest?.("[data-pending-marker]");
  if (markerButton) {
    const [sectionIndex, imageIndex] = markerButton.dataset.pendingMarker.split(":").map(Number);
    const input = procedureRoot.querySelector(`[data-marker-number="${sectionIndex}:${imageIndex}"]`);
    pendingAnnotation = { type: "marker", sectionIndex, imageIndex, number: input?.value || "1" };
    return;
  }

  const itemNumberingButton = event.target?.closest?.("[data-item-numbering]");
  if (itemNumberingButton) {
    const sectionIndex = Number(itemNumberingButton.dataset.itemNumbering);
    const isSameTool = pendingAnnotation?.type === "itemMarker" && pendingAnnotation.sectionIndex === sectionIndex;
    pendingAnnotation = isSameTool ? null : { type: "itemMarker", sectionIndex, imageIndex: 0 };
    refreshItemNumberingButton(sectionIndex);
    return;
  }

  const cardArrowButton = event.target?.closest?.("[data-pending-card-arrow]");
  if (cardArrowButton) {
    const [sectionIndex, cardIndex, blockIndex, tone] = cardArrowButton.dataset.pendingCardArrow.split(":");
    pendingAnnotation = { type: "cardArrow", sectionIndex: Number(sectionIndex), cardIndex: Number(cardIndex), blockIndex: Number(blockIndex), tone };
    return;
  }

  const cardMarkerButton = event.target?.closest?.("[data-pending-card-marker]");
  if (cardMarkerButton) {
    const [sectionIndex, cardIndex, blockIndex] = cardMarkerButton.dataset.pendingCardMarker.split(":").map(Number);
    const input = procedureRoot.querySelector(`[data-card-marker-number="${sectionIndex}:${cardIndex}:${blockIndex}"]`);
    pendingAnnotation = { type: "cardMarker", sectionIndex, cardIndex, blockIndex, number: input?.value || "1" };
    return;
  }

  const rotateButton = event.target?.closest?.("[data-rotate-annotation]");
  if (rotateButton) {
    const [sectionIndex, imageIndex, annotationIndex, cardIndex, blockIndex, delta] = rotateButton.dataset.rotateAnnotation.split(":");
    if (cardIndex !== "") {
      const annotation = getCardAnnotationList(Number(sectionIndex), Number(cardIndex), blockIndex === "" ? null : Number(blockIndex))?.[annotationIndex];
      if (annotation) {
        annotation.rotation = (annotation.rotation || 0) + Number(delta);
        saveProcedure();
        refreshProcedureSection(Number(sectionIndex));
      }
    } else {
      const image = getSectionImage(Number(sectionIndex), Number(imageIndex));
      const annotation = activeProcedure.sections[sectionIndex]?.annotations?.[image]?.[annotationIndex];
      if (annotation) {
        annotation.rotation = (annotation.rotation || 0) + Number(delta);
        saveProcedure();
        refreshProcedureSection(Number(sectionIndex));
      }
    }
    return;
  }

  const removeAnnotationButton = event.target?.closest?.("[data-remove-annotation]");
  if (removeAnnotationButton) {
    if (!(await confirmRemoval("esta marcação"))) return;
    const [sectionIndex, imageIndex, annotationIndex, cardIndex, blockIndex] = removeAnnotationButton.dataset.removeAnnotation.split(":");
    if (cardIndex !== "") {
      removeCardAnnotation(Number(sectionIndex), Number(cardIndex), Number(annotationIndex), blockIndex === "" ? null : Number(blockIndex));
    } else {
      const numericSectionIndex = Number(sectionIndex);
      const image = getSectionImage(numericSectionIndex, Number(imageIndex));
      const annotation = activeProcedure.sections[numericSectionIndex]?.annotations?.[image]?.[Number(annotationIndex)];
      if (Number(imageIndex) === 0 && annotation?.type === "marker") {
        removeMaterialForMarker(numericSectionIndex, annotation.number);
      }
      removeAnnotation(numericSectionIndex, image, Number(annotationIndex));
    }
    return;
  }

  const exportButton = event.target?.closest?.("[data-export-json]");
  if (exportButton) {
    await withActionButtonLoading(exportButton, "Baixando...", () => exportProcedure());
    return;
  }

  const exportPdfButton = event.target?.closest?.("[data-export-pdf]");
  if (exportPdfButton) {
    try {
      await withActionButtonLoading(exportPdfButton, "Gerando PDF...", () => exportProcedurePdf());
    } catch (error) {
      console.error("Falha ao exportar PDF:", error);
    }
    return;
  }

  const resetButton = event.target?.closest?.("[data-reset-procedure]");
  if (resetButton) {
    const confirmed = await showConfirmDialog({
      title: "Limpar edição local?",
      message: "Tem certeza que deseja limpar toda a edição local?",
      confirmLabel: "Limpar",
    });
    if (!confirmed) return;
    await loadProcedureFromServer();
    pendingAnnotation = null;
    renderProcedure(activeProcedure);
    return;
  }

  const imageContainer = event.target?.closest?.(".procedure-image-link.is-editable");
  if (imageContainer && pendingAnnotation) {
    if (event.target?.closest?.(".image-editor-toolbar, .item-image-toolbar, .annotation-item")) return;
    event.preventDefault();

    if (pendingAnnotation.type === "cardArrow" || pendingAnnotation.type === "cardMarker") {
      const sectionIndex = pendingAnnotation.sectionIndex;
      const cardIndex = pendingAnnotation.cardIndex;
      const blockIndex = pendingAnnotation.blockIndex;
      if (
        Number(imageContainer.dataset.section) !== sectionIndex ||
        Number(imageContainer.dataset.cardIndex) !== cardIndex ||
        Number(imageContainer.dataset.blockIndex) !== blockIndex
      ) return;

      const point = getClickPosition(event, imageContainer);
      addCardAnnotation(sectionIndex, cardIndex, {
        type: pendingAnnotation.type === "cardArrow" ? "arrow" : "marker",
        tone: pendingAnnotation.tone,
        number: pendingAnnotation.number,
        x: point.x,
        y: point.y,
        rotation: 0,
      }, blockIndex);
      pendingAnnotation = null;
      return;
    }

    if (pendingAnnotation.type === "itemMarker") {
      const sectionIndex = pendingAnnotation.sectionIndex;
      const image = getSectionImage(sectionIndex, 0);
      if (
        !image ||
        imageContainer.dataset.itemImage !== "true" ||
        Number(imageContainer.dataset.section) !== sectionIndex
      ) return;

      const point = getClickPosition(event, imageContainer);
      const markerNumber = getNextItemMarkerNumber(sectionIndex, image);
      ensureMaterialForMarker(sectionIndex, markerNumber);
      addAnnotation(sectionIndex, image, {
        type: "marker",
        number: markerNumber,
        x: point.x,
        y: point.y,
        rotation: 0,
      });
      pendingAnnotation = { type: "itemMarker", sectionIndex, imageIndex: 0 };
      return;
    }

    const sectionIndex = pendingAnnotation.sectionIndex;
    const image = getSectionImage(sectionIndex, pendingAnnotation.imageIndex);
    if (
      !image ||
      Number(imageContainer.dataset.section) !== sectionIndex ||
      Number(imageContainer.dataset.imageIndex) !== pendingAnnotation.imageIndex
    ) return;

    const point = getClickPosition(event, imageContainer);
    addAnnotation(sectionIndex, image, {
      type: pendingAnnotation.type,
      tone: pendingAnnotation.tone,
      number: pendingAnnotation.number,
      x: point.x,
      y: point.y,
      rotation: 0,
    });
    pendingAnnotation = null;
  }
});
procedureRoot.addEventListener("keydown", (event) => {
  const sectionTitle = event.target?.closest?.("[data-section-title]");
  if (!sectionTitle || event.key !== "Enter") return;
  event.preventDefault();
  sectionTitle.blur();
});

procedureRoot.addEventListener("focusout", (event) => {
  const revisionCell = event.target?.closest?.("[data-revision-cell]");
  if (revisionCell) {
    const [rowIndex, cellIndex] = revisionCell.dataset.revisionCell.split(":").map(Number); if (cellIndex > 0 && activeProcedure.revision[rowIndex]) activeProcedure.revision[rowIndex][cellIndex] = revisionCell.value;
    refreshDocumentCodeDisplays(); saveProcedure(); refreshRevisionEditor(); return;
  }
  const sectionTitle = event.target?.closest?.("[data-section-title]");
  if (!sectionTitle) return;

  const section = activeProcedure.sections[Number(sectionTitle.dataset.sectionTitle)];
  if (!section) return;

  section.title = sectionTitle.value;
  saveProcedure();
  refreshSectionNavigation(activeProcedure);
});
procedureRoot.addEventListener("input", (event) => {
  const procedureTitle = event.target?.closest?.("[data-procedure-title]");
  if (procedureTitle) {
    activeProcedure.title = procedureTitle.value;
    if (hasProcedureTitle() && !activeProcedure.documentNumber) {
      reserveAutomaticDocumentNumber().catch((error) => updateSaveState("error", error.message));
      return;
    }
    saveProcedure();
    return;
  }

  const qualityField = event.target?.closest?.("[data-quality-field]");
  if (qualityField) {
    activeProcedure.qualityInfo[qualityField.dataset.qualityField] = qualityField.value;
    saveProcedure();
    return;
  }

  const sectionTitle = event.target?.closest?.("[data-section-title]");
  if (sectionTitle) {
    activeProcedure.sections[Number(sectionTitle.dataset.sectionTitle)].title = sectionTitle.value;
    saveProcedure();
    return;
  }

  const revisionCell = event.target?.closest?.("[data-revision-cell]");
  if (revisionCell) {
    const [rowIndex, cellIndex] = revisionCell.dataset.revisionCell.split(":").map(Number);
    if (cellIndex === 0) return;
    activeProcedure.revision[rowIndex][cellIndex] = revisionCell.value;
    saveProcedure();
    return;
  }

  const materialField = event.target?.closest?.("[data-material-field]");
  if (materialField) {
    const [sectionIndex, materialIndex, field] = materialField.dataset.materialField.split(":");
    activeProcedure.sections[sectionIndex].materials[materialIndex][field] = materialField.value;
    saveProcedure();
    return;
  }

  const stepCardText = event.target?.closest?.("[data-step-card-text]");
  if (stepCardText) {
    const [sectionIndex, cardIndex] = stepCardText.dataset.stepCardText.split(":").map(Number);
    activeProcedure.sections[sectionIndex].stepCards[cardIndex].text = stepCardText.value;
    saveProcedure();
    return;
  }

  const textField = event.target?.closest?.("[data-instruction-text]");
  if (textField) {
    const [sectionIndex, instructionIndex] = textField.dataset.instructionText.split(":").map(Number);
    activeProcedure.sections[sectionIndex].instructions[instructionIndex] = textField.value;
    saveProcedure();
    return;
  }
});

function renderSquareSvg() {
  return `
    <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <rect x="12" y="12" width="76" height="76"></rect>
    </svg>
  `;
}

function renderCardImageEditor(sectionIndex, cardIndex, blockIndex) {
  return `
    <div class="image-editor-toolbar">
      <details class="arrow-tool-menu">
        <summary>Seta</summary>
        <div>
          <button type="button" class="arrow-color arrow-color-success" data-pending-card-arrow="${sectionIndex}:${cardIndex}:${blockIndex}:success">Verde</button>
          <button type="button" class="arrow-color arrow-color-warning" data-pending-card-arrow="${sectionIndex}:${cardIndex}:${blockIndex}:warning">Amarela</button>
          <button type="button" class="arrow-color arrow-color-danger" data-pending-card-arrow="${sectionIndex}:${cardIndex}:${blockIndex}:danger">Vermelha</button>
        </div>
      </details>
      <input type="number" min="1" value="1" aria-label="Número da bolinha" data-card-marker-number="${sectionIndex}:${cardIndex}:${blockIndex}">
      <button type="button" data-pending-card-marker="${sectionIndex}:${cardIndex}:${blockIndex}">Bolinha</button>
    </div>
  `;
}

function renderSectionBody(section, sectionIndex) {
  if (section.kind === "items" || section.kind === "tools") {
    return `
      ${renderEditorToolbar(section, sectionIndex)}
      ${renderItemVisualBoard(section, sectionIndex)}
      ${renderInstructions(section, sectionIndex)}
    `;
  }

  return `
    ${renderEditorToolbar(section, sectionIndex)}
    ${renderStepCards(section, sectionIndex)}
    ${renderInstructions(section, sectionIndex)}
    ${(section.tables || []).map((table) => renderTable(table)).join("")}
    ${renderImages(section, sectionIndex)}
  `;
}

function renderRevisionTableLegacy(revision) {
  if (!revision?.length) return "";
  return `
    <section class="procedure-card">
      <h2>Controle de revisão</h2>
      ${renderTable(revision)}
    </section>
  `;
}

function renderRevisionTable(revision) {
  if (!revision?.length) return "";
  if (!editMode) return renderRevisionTableLegacy(revision);

  const [head, ...body] = revision;
  return `
    <section class="procedure-card revision-editor-card">
      <div class="revision-editor-header">
        <h2>Controle de revisão</h2>
        <button type="button" class="ui-button ui-button-secondary" data-add-revision-row>Adicionar revisão</button>
      </div>
      <div class="revision-editor-list">
        <div class="revision-editor-row revision-editor-header-row" aria-hidden="true">
          ${head.map((cell) => `<strong>${escapeHtml(cell)}</strong>`).join("")}
          <strong class="revision-action-header">Ação</strong>
        </div>
        ${body.map((row, rowIndex) => `
          <div class="revision-editor-row">
            ${head.map((header, cellIndex) => `
              <label class="revision-editor-cell">
                <span>${escapeHtml(header)}</span>
                <input type="text" value="${escapeHtml(row[cellIndex] || "")}" data-revision-cell="${rowIndex + 1}:${cellIndex}" ${cellIndex === 0 ? 'readonly aria-readonly="true"' : ""}>
              </label>
            `).join("")}
            <button type="button" class="ui-button ui-button-icon ui-button-danger" title="Remover linha" aria-label="Remover linha" data-remove-revision-row="${rowIndex + 1}">&times;</button>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function getCurrentRevision(procedure) {
  const rows = Array.isArray(procedure.revision) ? procedure.revision.slice(1) : [];
  const row = [...rows].reverse().find((item) => String(item?.[0] || "").trim()) || [];
  return {
    revision: row[0] || "Não informado",
    date: row[1] || "Não informado",
    elaboration: row[3] || "Não informado",
    approval: row[4] || "Não informado",
  };
}

function renderQualityInfo(procedure) {
  syncDocumentCode(procedure);
  const info = procedure.qualityInfo || {};
  const revision = getCurrentRevision(procedure);
  const approvalDate = info.approvalDate || "Não informado";
  const docType = getDocumentTypeConfig(info.documentType);
  const docTypeOptions = documentTypes
    .map((item) => `<option value="${escapeHtml(item.label)}" ${item.label === docType.label ? "selected" : ""}>${escapeHtml(item.label)}</option>`)
    .join("");
  const fields = [
    ["Tipo de documento", "documentType", info.documentType],
    ["Revisão vigente", "revision", revision.revision, true],
    ["Elaboração", "elaboration", revision.elaboration, true],
    ["Data da revisão", "revisionDate", revision.date, true],
    ["Status", "documentStatus", procedure.documentStatus || "Em elaboração", true],
    ["Setor / processo", "area", info.area],
    ["Aprovação", "approval", revision.approval, true],
    ["Data da aprovação", "approvalDate", approvalDate, true],
  ];
  const textAreas = [
    ["Objetivo", "objective", info.objective],
    ["Aplicação", "application", info.application],
    ["Responsabilidades", "responsibilities", info.responsibilities],
    ["Materiais, sistemas ou documentos relacionados", "relatedDocs", info.relatedDocs],
    ["Registros gerados", "records", info.records],
    ["Critérios de aceitação", "acceptanceCriteria", info.acceptanceCriteria],
    ["Tratamento de desvios", "deviationTreatment", info.deviationTreatment],
    ["Rastreabilidade", "traceability", info.traceability],
    ["Retenção de registros", "retention", info.retention],
    ["Mudanças climáticas", "climateConsideration", info.climateConsideration],
  ];

  const textAreaHints = {
    objective: "Descreva a finalidade do procedimento e o resultado esperado.",
    application: "Informe onde, quando e em quais equipamentos ou processos se aplica.",
    responsibilities: "Indique quem executa, verifica, aprova e trata desvios.",
    relatedDocs: "Liste materiais, sistemas, normas e documentos relacionados.",
    records: "Informe quais registros sao gerados, por quem e onde ficam armazenados.",
    acceptanceCriteria: "Defina como confirmar que o resultado foi aceito.",
    deviationTreatment: "Explique como registrar, segregar, comunicar e tratar desvios.",
    traceability: "Informe como vincular lote, revisao, operador e registros.",
    retention: "Defina prazo, local e responsavel pela retencao dos registros.",
    climateConsideration: "Avalie se mudancas climaticas podem afetar o processo ou seus controles.",
  };

  function renderSgqValue(key, value, readonly) {
    if (editMode && key === "documentType") {
      return `<select data-document-type>${docTypeOptions}</select>`;
    }
    if (editMode && !readonly) {
      return `<input type="text" value="${escapeHtml(value || "")}" data-quality-field="${key}">`;
    }
    return `<strong>${escapeHtml(value || "Não informado")}</strong>`;
  }

  return `
    <section class="procedure-card sgq-card">
      <div class="sgq-field-grid">
        ${fields.map(([label, key, value, readonly]) => `
          <label class="sgq-field">
            <span>${escapeHtml(label)}</span>
            ${renderSgqValue(key, value, readonly)}
          </label>
        `).join("")}
      </div>

      <div class="sgq-text-grid">
        ${textAreas.map(([label, key, value]) => `
          <label class="sgq-text-field">
            <span>${escapeHtml(label)}</span>
            ${editMode
              ? `<textarea data-quality-field="${key}" placeholder="${escapeHtml(textAreaHints[key] || "")}">${escapeHtml(value || "")}</textarea>`
              : `<p>${escapeHtml(value || "Não informado")}</p>`}
          </label>
        `).join("")}
      </div>
    </section>
  `;
}
function renderProcedureActionBar(procedure) {
  const isPublished = procedure.documentStatus === "Publicado";
  return `
    <section class="procedure-action-bar" aria-label="Ações do procedimento">
      <div class="procedure-action-context">
        <span class="procedure-action-title">Edição do procedimento</span>
        <span class="procedure-status-badge ${isPublished ? "is-published" : "is-draft"}">${escapeHtml(procedure.documentStatus || "Em elaboração")}</span>
        <span class="save-state" data-save-state="${saveState}">${saveState === "pending" ? "Salvando..." : saveState === "error" ? "Erro ao salvar" : "Alterações salvas"}</span>
      </div>
      <div class="procedure-action-buttons">
        <button type="button" class="primary-button" data-publish-procedure>Publicar</button>
        <button type="button" class="secondary-button" data-export-pdf>Visualizar PDF</button>
        <button type="button" class="secondary-button" data-export-json>Baixar JSON</button>
        <button type="button" class="danger-button" data-delete-procedure>Excluir</button>
      </div>
    </section>
  `;
}

function renderProcedureEmptyState() {
  return `
    <section class="procedure-empty-editor" aria-label="Começar procedimento">
      <div class="procedure-empty-icon">+</div>
      <div>
        <h2>Comece a montar o procedimento</h2>
        <p>Adicione os materiais necessários e depois organize as etapas com imagens, textos e marcações.</p>
      </div>
    </section>
  `;
}

function renderProcedure(procedure) {
  syncDocumentCode(procedure);
  document.title = `${procedure.equipmentName} | Criador de Procedimentos`;
  const backLink = document.querySelector(".back-link");
  if (backLink) {
    backLink.href = "index.html";
    backLink.textContent = "Voltar para o criador";
  }

  const sections = procedure.sections || [];
  const imageCount = sections.reduce((total, section) => total + (section.images?.length || 0), 0);
  const equipmentImage = getEquipmentImage(procedure);
  const procedureTypeLabel = procedureTypes[procedure.procedureType] || "Procedimento";
  const docType = getDocumentTypeConfig(procedure.qualityInfo?.documentType);
  const equipmentOptions = [...Object.keys(equipmentImages), "OUTROS"]
    .map((code) => `<option value="${escapeHtml(code)}" ${code === procedure.equipmentCode ? "selected" : ""}>${escapeHtml(getEquipmentName(code))}</option>`)
    .join("");

  procedureRoot.innerHTML = `
    <header class="procedure-hero">
      <div class="procedure-hero-copy">
        <span class="eyebrow">${escapeHtml(procedure.equipmentName)} · ${escapeHtml(procedureTypeLabel)}</span>
        ${editMode ? `
          <div class="procedure-title-editor">
            <label>
              Nome do procedimento
              <input type="text" value="${escapeHtml(procedure.title)}" data-procedure-title>
            </label>
            <label>
              Equipamento
              <select data-procedure-equipment-code>
                <option value="">Selecione o equipamento</option>
                ${equipmentOptions}
              </select>
            </label>
          </div>
        ` : `<h1>${escapeHtml(procedure.title)}</h1>`}
        <p>Crie e ajuste o procedimento. Ao finalizar, baixe o PDF para uso e o JSON para futuras alterações.</p>
      </div>
      <div class="procedure-hero-image">
        ${equipmentImage
          ? `<img src="${escapeHtml(equipmentImage)}" alt="${escapeHtml(procedure.equipmentName)}">`
          : editMode && procedure.equipmentCode === "OUTROS"
            ? `<label class="equipment-image-upload">
                <span>+</span>
                <strong>Adicionar imagem</strong>
                <input type="file" accept="image/*" data-equipment-image-import>
              </label>`
          : `<span class="procedure-hero-placeholder">Sem imagem do equipamento</span>`}
      </div>
    </header>

    ${editMode ? renderProcedureActionBar(procedure) : ""}

    <section class="procedure-summary" aria-label="Resumo do procedimento">
      <div>
        ${editMode
          ? `<div class="document-code-editor document-code-summary">
              <span data-document-code-prefix>${escapeHtml(docType.prefix)}_</span>
              <input type="text" value="${escapeHtml(getDocumentCodeMiddle(procedure) === "NOVO" ? "" : getDocumentCodeMiddle(procedure))}" placeholder="Nome do documento" data-document-code-middle aria-label="Código editável do documento">
              <span data-document-code-revision>_${escapeHtml(getDocumentRevision(procedure))}</span>
            </div>`
          : `<strong data-document-code-value>${escapeHtml(procedure.documentCode)}</strong>`}
        <span>Código do documento</span>
      </div>
      <div>
        <strong>${sections.length}</strong>
        <span>Seções estruturadas</span>
      </div>
      <div>
        <strong>${imageCount}</strong>
        <span>Imagens de apoio</span>
      </div>
      <div>
        <strong>${availableProcedures.length}</strong>
        <span>Procedimentos cadastrados</span>
      </div>
    </section>

    <div class="procedure-layout">
      <aside class="procedure-nav" aria-label="Etapas do procedimento">
        <h2>Etapas</h2>
        <nav>
          ${sections.map((section) => `
            <a href="#${createSlug(section)}" ${editMode ? `draggable="true" data-drag-handle="section:${sections.indexOf(section)}" data-reorder-item="section:${sections.indexOf(section)}"` : ""}>
              <span>${escapeHtml(section.number)}</span>
              ${escapeHtml(section.title)}
            </a>
          `).join("")}
        </nav>
      </aside>

      <div class="procedure-content">
        <section class="editor-flow-group">
          <header class="editor-flow-heading">
            <span class="editor-flow-step">1</span>
            <div><h2>Controle do documento</h2><p>Identificação, informações da qualidade e histórico de revisões.</p></div>
          </header>
          ${renderQualityInfo(procedure)}
          ${renderRevisionTable(procedure.revision)}
        </section>

        <section class="editor-flow-group editor-content-group">
          <header class="editor-flow-heading">
            <span class="editor-flow-step">2</span>
            <div><h2>Conteúdo do procedimento</h2><p>Organize os materiais e as etapas na ordem em que serão executados.</p></div>
          </header>
          ${editMode && !sections.length ? renderProcedureEmptyState() : ""}
        ${sections.map((section, sectionIndex) => `
          <article class="procedure-section procedure-section-${section.kind}" id="${createSlug(section)}" ${editMode ? `data-reorder-item="section:${sectionIndex}"` : ""}>
            <header class="procedure-section-header">
              <div class="section-header-main">
                <div class="section-heading-inline">
                  <span class="section-number">${escapeHtml(section.number)}</span>
                  ${editMode
                    ? `<input class="section-title-input" type="text" value="${escapeHtml(section.title)}" data-section-title="${sectionIndex}" aria-label="Nome da etapa">`
                    : `<h2>${escapeHtml(section.title)}</h2>`}
                </div>
              </div>
              <div class="section-header-actions">
                ${editMode ? `<button type="button" class="section-remove-button" data-remove-section="${sectionIndex}">Excluir</button>` : ""}
              </div>
            </header>
            ${renderSectionBody(section, sectionIndex)}
          </article>
        `).join("")}
        </section>
        ${editMode ? renderBottomEditorActions() : ""}
      </div>
    </div>
  `;

  if (!canEditProcedures) {
    procedureRoot.querySelector(".procedure-actions")?.remove();
  }
}

function refreshSectionNavigation(procedure) {
  const navigation = procedureRoot.querySelector(".procedure-nav nav");
  if (!navigation) return;

  navigation.innerHTML = (procedure.sections || []).map((section) => `
    <a href="#${createSlug(section)}" ${editMode ? `draggable="true" data-drag-handle="section:${procedure.sections.indexOf(section)}" data-reorder-item="section:${procedure.sections.indexOf(section)}"` : ""}>
      <span>${escapeHtml(section.number)}</span>
      ${escapeHtml(section.title)}
    </a>
  `).join("");
}

function renderBottomEditorActions() {
  return `
    <section class="bottom-editor-actions" aria-label="Ações do procedimento">
      <strong>Ações do procedimento</strong>
      <div>
        <button type="button" class="secondary-button" data-add-item-section>Criar card de itens</button>
        <button type="button" class="secondary-button" data-add-step-section>Criar etapa</button>
      </div>
    </section>
  `;
}

function renderEmptyState() {
  const readableCode = equipmentCode || "equipamento";
  document.title = "Sem procedimento | Equipamentos";

  procedureRoot.innerHTML = `
    <section class="missing-page">
      <span class="eyebrow">Sem procedimento</span>
      <h1>Nenhum procedimento cadastrado para ${escapeHtml(readableCode)}</h1>
      <p>Use a tela inicial para criar um novo procedimento ou importar um JSON existente.</p>
      <a class="primary-link" href="index.html">Voltar para o criador</a>
    </section>
  `;
}

function addInstruction(sectionIndex, tone) {
  const section = activeProcedure.sections[sectionIndex];
  section.instructions.push("");
  section.instructionTones.push(tone);
  section.instructionImages.push("");
  saveProcedure();
  renderProcedure(activeProcedure);
}

function showConfirmDialog({ title, message, confirmLabel = "Remover", cancelLabel = "Cancelar", variant = "danger" }) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "confirm-dialog-backdrop";
    overlay.innerHTML = `
      <div class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirmDialogTitle">
        <div class="confirm-dialog-icon">!</div>
        <div>
          <h2 id="confirmDialogTitle"></h2>
          <p></p>
        </div>
        <div class="confirm-dialog-actions">
          <button type="button" class="confirm-cancel"></button>
          <button type="button" class="confirm-action confirm-${escapeHtml(variant)}"></button>
        </div>
      </div>
    `;

    const dialog = overlay.querySelector(".confirm-dialog");
    const titleElement = overlay.querySelector("h2");
    const messageElement = overlay.querySelector("p");
    const cancelButton = overlay.querySelector(".confirm-cancel");
    const confirmButton = overlay.querySelector(".confirm-action");

    titleElement.textContent = title;
    messageElement.textContent = message;
    cancelButton.textContent = cancelLabel;
    confirmButton.textContent = confirmLabel;

    const close = (confirmed) => {
      document.removeEventListener("keydown", handleKeydown);
      overlay.remove();
      resolve(confirmed);
    };

    const handleKeydown = (event) => {
      if (event.key === "Escape") close(false);
    };

    overlay.addEventListener("click", (event) => {
      if (!dialog.contains(event.target)) close(false);
    });
    cancelButton.addEventListener("click", () => close(false));
    confirmButton.addEventListener("click", () => close(true));
    document.addEventListener("keydown", handleKeydown);

    document.body.appendChild(overlay);
    cancelButton.focus();
  });
}

function showPasswordDialog(message = "Digite a senha para liberar a edição deste procedimento.") {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "confirm-dialog-backdrop";
    overlay.innerHTML = `
      <div class="confirm-dialog password-dialog" role="dialog" aria-modal="true" aria-labelledby="passwordDialogTitle">
        <div class="confirm-dialog-icon">#</div>
        <div>
          <h2 id="passwordDialogTitle">Senha da qualidade</h2>
          <p>${escapeHtml(message)}</p>
          <input type="password" class="password-dialog-input" autocomplete="current-password" placeholder="Senha">
          <span class="password-dialog-error" aria-live="polite"></span>
        </div>
        <div class="confirm-dialog-actions">
          <button type="button" class="confirm-cancel">Cancelar</button>
          <button type="button" class="confirm-action confirm-primary">Entrar</button>
        </div>
      </div>
    `;

    const dialog = overlay.querySelector(".confirm-dialog");
    const input = overlay.querySelector(".password-dialog-input");
    const error = overlay.querySelector(".password-dialog-error");
    const cancelButton = overlay.querySelector(".confirm-cancel");
    const confirmButton = overlay.querySelector(".confirm-action");

    const close = (authorized) => {
      document.removeEventListener("keydown", handleKeydown);
      overlay.remove();
      resolve(authorized);
    };

    const validate = async () => {
      confirmButton.disabled = true;
      try {
        await authenticateQuality(input.value);
        close(true);
      } catch (validationError) {
        error.textContent = validationError.message || "Senha incorreta.";
        input.value = "";
        input.focus();
      } finally {
        confirmButton.disabled = false;
      }
    };

    const handleKeydown = (event) => {
      if (event.key === "Escape") close(false);
      if (event.key === "Enter") validate();
    };

    overlay.addEventListener("click", (event) => {
      if (!dialog.contains(event.target)) close(false);
    });
    cancelButton.addEventListener("click", () => close(false));
    confirmButton.addEventListener("click", validate);
    document.addEventListener("keydown", handleKeydown);

    document.body.appendChild(overlay);
    input.focus();
  });
}

function confirmRemoval(label) {
  return showConfirmDialog({
    title: "Remover item?",
    message: `Tem certeza que deseja remover ${label}?`,
  });
}

function moveArrayItem(list, fromIndex, toIndex) {
  if (!Array.isArray(list)) return false;
  if (fromIndex === toIndex) return false;
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= list.length || toIndex >= list.length) return false;
  const [item] = list.splice(fromIndex, 1);
  list.splice(toIndex, 0, item);
  return true;
}

function reorderEditorItem(source, target) {
  if (!source || !target || source.type !== target.type) return false;

  if (source.type === "section") {
    return moveArrayItem(activeProcedure.sections, source.index, target.index);
  }

  if (source.sectionIndex !== target.sectionIndex) return false;
  const section = activeProcedure.sections[source.sectionIndex];
  if (!section) return false;

  if (source.type === "material") {
    return moveArrayItem(section.materials, source.index, target.index);
  }

  if (source.type === "stepCard") {
    return moveArrayItem(section.stepCards, source.index, target.index);
  }

  if (source.type === "instruction") {
    const movedInstructions = moveArrayItem(section.instructions, source.index, target.index);
    const movedTones = moveArrayItem(section.instructionTones, source.index, target.index);
    const movedImages = moveArrayItem(section.instructionImages, source.index, target.index);
    return movedInstructions || movedTones || movedImages;
  }

  return false;
}

function parseReorderValue(value) {
  const [type, first, second] = String(value || "").split(":");
  if (type === "section") return { type, index: Number(first) };
  return { type, sectionIndex: Number(first), index: Number(second) };
}

function getStepBlockStyle(block) {
  return [
    `left:${block.x}%`,
    `top:${block.y}%`,
    `width:${block.w}%`,
    `height:${block.h}%`,
    `--step-rotation:${block.rotation || 0}deg`,
    `--image-scale-x:${block.flipX ? -1 : 1}`,
    `--image-scale-y:${block.flipY ? -1 : 1}`,
    `z-index:${block.type === "image" ? 1 : 10 + (Number(block.zIndex) || 0)}`,
  ].join("; ");
}

function snapToGrid(value) {
  return Math.round(value / 2.5) * 2.5;
}

function snapFine(value) {
  return Math.round(value * 10) / 10;
}

function isFreeCanvasElement(type) {
  return ["arrow", "circle", "square"].includes(type);
}

function clampBlockPosition(block, x, y, freeMove = false) {
  const nextX = freeMove ? snapFine(x) : snapToGrid(x);
  const nextY = freeMove ? snapFine(y) : snapToGrid(y);
  return {
    x: Math.max(0, Math.min(100 - block.w, nextX)),
    y: Math.max(0, Math.min(100 - block.h, nextY)),
  };
}

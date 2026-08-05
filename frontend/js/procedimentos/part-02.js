function getTableItems(rows) {
  if (!rows?.length) return [];

  return rows.slice(1)
    .filter((row) => row?.[0] || row?.[3])
    .map((row, index) => ({
      number: row[0] || String(index + 1),
      quantity: row[1] || "",
      code: row[2] || "",
      description: row[3] || "",
    }));
}

function renderTable(rows) {
  if (!rows?.length) return "";

  const [head, ...body] = rows;
  const header = head.map((cell) => `<th scope="col">${escapeHtml(cell)}</th>`).join("");
  const bodyRows = body
    .map((row) => `
      <tr>
        ${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}
      </tr>
    `)
    .join("");

  return `
    <div class="procedure-table-wrap">
      <table class="procedure-table">
        <thead><tr>${header}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
  `;
}

function renderEditorToolbar(section, sectionIndex) {
  if (!editMode) return "";
  const toolbarClass = section.kind === "step" ? "step-section-toolbar" : section.kind === "items" ? "item-section-toolbar" : "";

  return `
    <div class="section-editor-toolbar ${toolbarClass}">
      ${section.kind === "step" && !section.stepCards?.length ? `<button type="button" data-add-step-card="${sectionIndex}">Criar canvas da etapa</button>` : ""}
      ${section.kind === "tools" ? `<button type="button" data-add-material="${sectionIndex}">Adicionar material</button>` : ""}
    </div>
  `;
}

function renderDragHandle(value) {
  return `
    <button
      type="button"
      class="drag-handle"
      draggable="true"
      data-drag-handle="${value}"
      title="Arrastar para reordenar"
      aria-label="Arrastar para reordenar">
      Mover
    </button>
  `;
}

function renderInstructions(section, sectionIndex) {
  if (!section.instructions?.length && !editMode) return "";

  return `
    <div class="instruction-cards">
      ${section.instructions.map((instruction, instructionIndex) => {
        const tone = section.instructionTones[instructionIndex] || classifyInstructionTone(instruction);
        const selectedImage = section.instructionImages[instructionIndex] || "";

        return `
          <article class="instruction-card instruction-${tone}" data-section="${sectionIndex}" data-instruction="${instructionIndex}" ${editMode ? `data-reorder-item="instruction:${sectionIndex}:${instructionIndex}"` : ""}>
            ${editMode ? renderInstructionEditor(section, sectionIndex, instructionIndex, tone, selectedImage) : ""}
            ${editMode
              ? `<textarea data-instruction-text="${sectionIndex}:${instructionIndex}">${escapeHtml(instruction)}</textarea>`
              : `<p>${escapeHtml(instruction)}</p>`}
            ${selectedImage ? renderSingleImage(section, sectionIndex, selectedImage, instructionIndex) : ""}
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function renderInstructionEditor(section, sectionIndex, instructionIndex, tone, selectedImage) {
  return `
    <div class="instruction-editor">
      ${renderDragHandle(`instruction:${sectionIndex}:${instructionIndex}`)}
      <div class="tone-picker" aria-label="Cor da caixa">
        ${["success", "warning", "danger"].map((option) => `
          <button
            type="button"
            class="tone-dot tone-${option} ${tone === option ? "is-active" : ""}"
            title="${getToneLabel(option)}"
            data-set-tone="${sectionIndex}:${instructionIndex}:${option}">
          </button>
        `).join("")}
      </div>
      <select data-set-instruction-image="${sectionIndex}:${instructionIndex}">
        <option value="">Imagem abaixo da caixa</option>
        ${section.images.map((image, imageIndex) => `
          <option value="${escapeHtml(image)}" ${selectedImage === image ? "selected" : ""}>
            Imagem ${imageIndex + 1}
          </option>
        `).join("")}
      </select>
      <button type="button" data-move-instruction="${sectionIndex}:${instructionIndex}:-1">Subir</button>
      <button type="button" data-move-instruction="${sectionIndex}:${instructionIndex}:1">Descer</button>
      <button type="button" data-remove-instruction="${sectionIndex}:${instructionIndex}">Remover</button>
    </div>
  `;
}

function renderImages(section, sectionIndex) {
  if (!section.images?.length) return "";

  const assignedImages = new Set([
    ...(section.instructionImages?.filter(Boolean) || []),
    ...(section.stepCards?.map((card) => card.image).filter(Boolean) || []),
  ]);
  const images = editMode ? section.images : section.images.filter((image) => !assignedImages.has(image));
  if (!images.length) return "";

  return `
    <div class="procedure-images ${section.kind === "step" ? "procedure-step-images" : ""}">
      ${images.map((image) => renderSingleImage(section, sectionIndex, image)).join("")}
    </div>
  `;
}

function renderSingleImage(section, sectionIndex, image, instructionIndex = "") {
  const imageIndex = section.images.indexOf(image);
  const annotations = section.annotations?.[image] || [];
  const tag = editMode ? "div" : "a";
  const href = editMode ? "" : ` href="${escapeHtml(image)}" target="_blank" rel="noopener"`;

  return `
    <${tag}${href} class="procedure-image-link ${editMode ? "is-editable" : ""}" data-section="${sectionIndex}" data-image-index="${imageIndex}">
      ${editMode ? renderImageEditor(sectionIndex, imageIndex, instructionIndex) : ""}
      <img src="${escapeHtml(image)}" alt="${escapeHtml(`${section.number} ${section.title} - imagem ${imageIndex + 1}`)}" loading="lazy">
      <div class="annotation-layer">
        ${annotations.map((annotation, annotationIndex) => renderAnnotation(annotation, sectionIndex, imageIndex, annotationIndex)).join("")}
      </div>
    </${tag}>
  `;
}

function renderImageEditor(sectionIndex, imageIndex, instructionIndex) {
  return `
    <div class="image-editor-toolbar">
      <details class="arrow-tool-menu">
        <summary>Seta</summary>
        <div>
          <button type="button" class="arrow-color arrow-color-success" data-pending-arrow="${sectionIndex}:${imageIndex}:success">Verde</button>
          <button type="button" class="arrow-color arrow-color-warning" data-pending-arrow="${sectionIndex}:${imageIndex}:warning">Amarela</button>
          <button type="button" class="arrow-color arrow-color-danger" data-pending-arrow="${sectionIndex}:${imageIndex}:danger">Vermelha</button>
        </div>
      </details>
      <input type="number" min="1" value="1" aria-label="Número da bolinha" data-marker-number="${sectionIndex}:${imageIndex}">
      <button type="button" data-pending-marker="${sectionIndex}:${imageIndex}">Bolinha</button>
      ${instructionIndex !== "" ? `<span>Imagem vinculada à caixa</span>` : ""}
    </div>
  `;
}

function renderAnnotation(annotation, sectionIndex, imageIndex, annotationIndex, cardIndex = "", blockIndex = "") {
  const style = [
    `left:${annotation.x}%`,
    `top:${annotation.y}%`,
    annotation.type === "arrow" ? `--annotation-rotation:${annotation.rotation || 0}deg` : "",
  ].filter(Boolean).join("; ");

  if (annotation.type === "marker") {
    return `
      <span
        class="annotation-item annotation-marker"
        style="${style}"
        data-annotation="${sectionIndex}:${imageIndex}:${annotationIndex}:${cardIndex}:${blockIndex}">
        ${escapeHtml(annotation.number)}
        ${editMode ? renderAnnotationControls(sectionIndex, imageIndex, annotationIndex, false, cardIndex, 0, blockIndex) : ""}
      </span>
    `;
  }

  return `
    <span
      class="annotation-item annotation-arrow annotation-${annotation.tone || "success"}"
      style="${style}"
      data-annotation="${sectionIndex}:${imageIndex}:${annotationIndex}:${cardIndex}:${blockIndex}">
      ${editMode ? renderAnnotationControls(sectionIndex, imageIndex, annotationIndex, true, cardIndex, annotation.rotation || 0, blockIndex) : ""}
    </span>
  `;
}

function renderAnnotationControls(sectionIndex, imageIndex, annotationIndex, canRotate, cardIndex = "", rotation = 0, blockIndex = "") {
  return `
    <span class="annotation-controls">
      ${canRotate ? `<button type="button" data-rotate-annotation="${sectionIndex}:${imageIndex}:${annotationIndex}:${cardIndex}:${blockIndex}:-45">-45°</button>` : ""}
      ${canRotate ? `<button type="button" data-rotate-annotation="${sectionIndex}:${imageIndex}:${annotationIndex}:${cardIndex}:${blockIndex}:-15">-15°</button>` : ""}
      ${canRotate ? `<button type="button" data-rotate-annotation="${sectionIndex}:${imageIndex}:${annotationIndex}:${cardIndex}:${blockIndex}:15">+15°</button>` : ""}
      ${canRotate ? `<button type="button" data-rotate-annotation="${sectionIndex}:${imageIndex}:${annotationIndex}:${cardIndex}:${blockIndex}:45">+45°</button>` : ""}
      <button type="button" data-remove-annotation="${sectionIndex}:${imageIndex}:${annotationIndex}:${cardIndex}:${blockIndex}">x</button>
    </span>
  `;
}

function renderItemVisualBoard(section, sectionIndex) {
  const items = section.materials || [];
  const image = section.images?.[0] || "";

  if (!image && !editMode) return "";
  const isNumberingActive = pendingAnnotation?.type === "itemMarker" && pendingAnnotation.sectionIndex === sectionIndex;

  return `
    <div class="item-board">
      ${editMode ? `
        <div class="item-board-toolbar">
          ${image ? `
            <div class="item-image-toolbar">
              <button type="button" class="ui-button ui-button-secondary ${isNumberingActive ? "is-active" : ""}" data-item-numbering="${sectionIndex}">Numeração</button>
              <label class="ui-button ui-button-secondary">
                Trocar imagem
                <input type="file" accept="image/*" data-item-image-import="${sectionIndex}">
              </label>
              <button type="button" class="ui-button ui-button-danger" data-clear-item-markers="${sectionIndex}">Limpar elementos</button>
            </div>
          ` : ""}
        </div>
      ` : ""}
      <div class="item-board-images">
        ${renderItemMainImage(section, sectionIndex, image)}
      </div>

      <div class="item-legend">
        ${items.map((item, materialIndex) => `
          <div class="item-legend-row">
            ${editMode
              ? renderMaterialEditor(sectionIndex, materialIndex, item)
              : `
                <span>${escapeHtml(item.number)}</span>
                <div>
                  <strong>${escapeHtml(item.description)}</strong>
                  <small>Qtd. ${escapeHtml(item.quantity)}${item.code ? ` · Código ${escapeHtml(item.code)}` : ""}</small>
                </div>
              `}
          </div>
        `).join("")}
        ${!items.length ? `<p class="empty-editor-note">Adicione os materiais desta revisão.</p>` : ""}
      </div>
    </div>
  `;
}

function renderItemMainImage(section, sectionIndex, image) {
  if (!image) {
    return `
      <label class="item-image-placeholder">
        <span>+</span>
        <strong>Adicionar imagem</strong>
        <input type="file" accept="image/*" data-item-image-import="${sectionIndex}">
      </label>
    `;
  }

  const annotations = (section.annotations?.[image] || [])
    .map((annotation, annotationIndex) => ({ annotation, annotationIndex }))
    .filter(({ annotation }) => annotation.type === "marker");

  return `
    <div class="item-image-panel">
      <div class="procedure-image-link item-board-main-image ${editMode ? "is-editable" : ""}" data-section="${sectionIndex}" data-image-index="0" data-item-image="true">
        <img src="${escapeHtml(image)}" alt="${escapeHtml(`${section.number} ${section.title} - itens necessários`)}" loading="lazy">
        <div class="annotation-layer">
          ${annotations.map(({ annotation, annotationIndex }) => renderAnnotation(annotation, sectionIndex, 0, annotationIndex)).join("")}
        </div>
      </div>
    </div>
  `;
}

function renderMaterialEditor(sectionIndex, materialIndex, item) {
  return `
    <input type="text" aria-label="Número" placeholder="Nº" value="${escapeHtml(item.number)}" data-material-field="${sectionIndex}:${materialIndex}:number">
    <div class="material-editor-fields">
      <textarea aria-label="Descrição" placeholder="Descrição do item" data-material-field="${sectionIndex}:${materialIndex}:description">${escapeHtml(item.description)}</textarea>
      <div>
        <input type="text" aria-label="Quantidade" placeholder="Qtd." value="${escapeHtml(item.quantity)}" data-material-field="${sectionIndex}:${materialIndex}:quantity">
        <input type="text" aria-label="Código" placeholder="Código" value="${escapeHtml(item.code)}" data-material-field="${sectionIndex}:${materialIndex}:code">
        <button type="button" class="material-remove-button icon-delete-button" aria-label="Remover material" title="Remover material" data-remove-material="${sectionIndex}:${materialIndex}">&times;</button>
      </div>
    </div>
  `;
}

function renderStepCards(section, sectionIndex) {
  if (!section.stepCards?.length && !editMode) return "";

  return `
    <div class="step-card-list">
      ${section.stepCards.map((card, cardIndex) => renderStepCard(section, sectionIndex, card, cardIndex)).join("")}
      ${editMode && !section.stepCards.length ? `<p class="empty-editor-note">Crie o canvas da etapa para inserir imagens, textos e marcações.</p>` : ""}
      ${editMode && section.stepCards.length ? `
        <div class="step-section-inline-actions">
          <button type="button" class="secondary-button" data-add-step-card="${sectionIndex}">Adicionar sessão</button>
        </div>
      ` : ""}
    </div>
  `;
}

function renderStepCard(section, sectionIndex, card, cardIndex) {
  return `
    <article class="step-card" data-step-card="${sectionIndex}:${cardIndex}" ${editMode ? `data-reorder-item="stepCard:${sectionIndex}:${cardIndex}"` : ""}>
      ${editMode ? `
        <div class="step-card-topbar ${window.FabricStepEditor ? "has-fabric-ribbon" : ""}">
          ${renderCanvasToolbar(sectionIndex, cardIndex)}
          ${renderStepCardEditor(section, sectionIndex, card, cardIndex)}
        </div>
      ` : ""}
      ${renderStepCardCanvas(section, sectionIndex, card, cardIndex)}
    </article>
  `;
}

function renderStepCardEditor(section, sectionIndex, card, cardIndex) {
  return `
    <div class="step-card-editor">
      <button type="button" class="step-card-remove-button icon-delete-button" title="Excluir card" aria-label="Excluir card" data-remove-step-card="${sectionIndex}:${cardIndex}">&times;</button>
    </div>
  `;
}

function renderStepCardCanvas(section, sectionIndex, card, cardIndex) {
  const blocks = card.blocks || [];
  const useFabric = editMode && window.FabricStepEditor;
  return `
    <div class="step-card-canvas ${editMode ? "is-editable" : ""} ${useFabric ? "has-fabric-editor" : ""}" data-step-canvas="${sectionIndex}:${cardIndex}">
      ${useFabric ? `<canvas class="fabric-step-canvas" data-fabric-step-canvas="${sectionIndex}:${cardIndex}" aria-label="Canvas da etapa"></canvas>` : ""}
      ${!useFabric ? `<div class="step-card-dom-layer">
      ${blocks.map((block, blockIndex) => renderStepCardBlock(section, sectionIndex, card, cardIndex, block, blockIndex)).join("")}
      ${editMode && !blocks.length ? `<div class="step-card-empty-canvas"><strong>Canvas vazio</strong><span>Use os botões acima para inserir imagem, texto ou forma.</span></div>` : ""}
      </div>` : ""}
    </div>
  `;
}

function renderCanvasToolbar(sectionIndex, cardIndex) {
  if (window.renderFabricCanvasRibbon) return window.renderFabricCanvasRibbon(sectionIndex, cardIndex);
  return `
    <div class="canvas-toolbar canvas-ribbon">
      <div class="canvas-ribbon-group">
      <span class="canvas-toolbar-label">Inserir</span>
      <button type="button" title="Adicionar bloco de imagem" data-add-step-block="${sectionIndex}:${cardIndex}:image">Imagem</button>
      <button type="button" title="Adicionar caixa de texto" data-add-step-block="${sectionIndex}:${cardIndex}:text">Texto</button>
      </div>
      <details>
        <summary>Seta</summary>
        <div>
          ${["success", "warning", "danger"].map((tone) => `
            <button type="button" class="arrow-color arrow-color-${tone}" data-add-step-block="${sectionIndex}:${cardIndex}:arrow:${tone}">${getToneLabel(tone)}</button>
          `).join("")}
        </div>
      </details>
      <details>
        <summary>Círculo</summary>
        <div>
          ${["success", "warning", "danger"].map((tone) => `
            <button type="button" class="arrow-color arrow-color-${tone}" data-add-step-block="${sectionIndex}:${cardIndex}:circle:${tone}">${getToneLabel(tone)}</button>
          `).join("")}
        </div>
      </details>
      <details>
        <summary>Quadrado</summary>
        <div>
          ${["success", "warning", "danger"].map((tone) => `
            <button type="button" class="arrow-color arrow-color-${tone}" data-add-step-block="${sectionIndex}:${cardIndex}:square:${tone}">${getToneLabel(tone)}</button>
          `).join("")}
        </div>
      </details>
    </div>
  `;
}

function renderStepCardBlock(section, sectionIndex, card, cardIndex, block, blockIndex) {
  const blockClass = {
    image: "step-layout-image",
    text: `step-layout-text step-layout-${block.tone || card.tone}`,
    arrow: `step-layout-arrow step-layout-${block.tone || card.tone}`,
    circle: `step-layout-circle step-layout-${block.tone || card.tone}`,
    square: `step-layout-square step-layout-${block.tone || card.tone}`,
  }[block.type] || "step-layout-text";
  const needsPanel = block.type === "image" || block.type === "text";
  const hasTextTools = editMode && block.type === "text";
  const hasResizeFrame = editMode && ["circle", "square"].includes(block.type);
  return `
    <div class="step-layout-block ${blockClass} ${hasTextTools ? "has-floating-tools" : ""} ${hasResizeFrame ? "has-resize-frame" : ""}" style="${getStepBlockStyle(block)}">
      ${hasTextTools ? renderStepTextTools(sectionIndex, cardIndex, block, blockIndex) : ""}
      ${editMode && block.type === "image" ? renderStepImageTools(sectionIndex, cardIndex, blockIndex) : ""}
      ${needsPanel
        ? `<div class="step-layout-panel">${renderStepBlockContent(section, sectionIndex, card, cardIndex, block, blockIndex)}</div>`
        : renderStepBlockContent(section, sectionIndex, card, cardIndex, block, blockIndex)}
      ${editMode && block.type !== "arrow" ? renderResizeHandle(sectionIndex, cardIndex, blockIndex, block.type) : ""}
    </div>
  `;
}

function renderStepBlockContent(section, sectionIndex, card, cardIndex, block, blockIndex) {
  if (block.type === "image") return renderStepBlockImage(section, sectionIndex, card, cardIndex, block, blockIndex);
  if (block.type === "arrow") return renderCanvasArrow(sectionIndex, cardIndex, block, blockIndex);
  if (block.type === "circle") return renderCanvasCircle(sectionIndex, cardIndex, block, blockIndex);
  if (block.type === "square") return renderCanvasSquare(sectionIndex, cardIndex, block, blockIndex);
  return renderStepBlockText(sectionIndex, cardIndex, block, blockIndex);
}

function renderResizeHandle(sectionIndex, cardIndex, blockIndex, type) {
  return `<button type="button" class="step-block-resize" data-step-block-resize="${sectionIndex}:${cardIndex}:${blockIndex}:${type}" aria-label="Redimensionar"></button>`;
}

function renderBringForwardButton(sectionIndex, cardIndex, blockIndex) {
  return `<button type="button" title="Subir uma camada" aria-label="Subir uma camada" data-step-block-forward="${sectionIndex}:${cardIndex}:${blockIndex}">&#8593;</button>`;
}

function renderStepImageTools(sectionIndex, cardIndex, blockIndex) {
  return `
    <div class="step-image-floating-tools">
      <button type="button" title="Girar para a esquerda" aria-label="Girar para a esquerda" data-step-image-rotate="${sectionIndex}:${cardIndex}:${blockIndex}:-90">&#8634;</button>
      <button type="button" title="Girar para a direita" aria-label="Girar para a direita" data-step-image-rotate="${sectionIndex}:${cardIndex}:${blockIndex}:90">&#8635;</button>
      <button type="button" title="Espelhar horizontalmente" aria-label="Espelhar horizontalmente" data-step-image-flip="${sectionIndex}:${cardIndex}:${blockIndex}:x">&#8596;</button>
      <button type="button" title="Espelhar verticalmente" aria-label="Espelhar verticalmente" data-step-image-flip="${sectionIndex}:${cardIndex}:${blockIndex}:y">&#8597;</button>
      <button type="button" class="icon-delete-button" title="Excluir imagem" aria-label="Excluir imagem" data-remove-step-block="${sectionIndex}:${cardIndex}:${blockIndex}">&times;</button>
    </div>
  `;
}

function renderStepTextTools(sectionIndex, cardIndex, block, blockIndex) {
  return `
    <div class="step-block-floating-tools">
      <button type="button" class="step-block-drag" title="Mover" aria-label="Mover" data-step-block-drag="${sectionIndex}:${cardIndex}:${blockIndex}">&#10021;</button>
      <button type="button" title="Negrito" aria-label="Negrito" data-step-text-bold="${sectionIndex}:${cardIndex}:${blockIndex}">B</button>
      <button type="button" title="Diminuir letra" aria-label="Diminuir letra" data-step-text-size="${sectionIndex}:${cardIndex}:${blockIndex}:-1">-</button>
      <span class="step-text-size-value">${block.fontSize || 20}px</span>
      <button type="button" title="Aumentar letra" aria-label="Aumentar letra" data-step-text-size="${sectionIndex}:${cardIndex}:${blockIndex}:1">+</button>
      <div class="tone-picker" aria-label="Cor do bloco">
        ${["success", "warning", "danger"].map((tone) => `
          <button type="button" class="tone-dot tone-${tone} ${block.tone === tone ? "is-active" : ""}" data-step-block-tone="${sectionIndex}:${cardIndex}:${blockIndex}:${tone}" title="${getToneLabel(tone)}"></button>
        `).join("")}
      </div>
      <button type="button" class="icon-delete-button" title="Excluir" aria-label="Excluir" data-remove-step-block="${sectionIndex}:${cardIndex}:${blockIndex}">&times;</button>
    </div>
  `;
}

function renderStepBlockText(sectionIndex, cardIndex, block, blockIndex) {
  const style = `style="--step-font-size:${block.fontSize || 20}px"`;
  if (editMode) {
    return `<div class="step-rich-text" ${style} contenteditable="true" data-step-block-richtext="${sectionIndex}:${cardIndex}:${blockIndex}">${sanitizeRichText(block.html || escapeHtml(block.text || ""))}</div>`;
  }
  return `<div class="step-rich-text" ${style}>${sanitizeRichText(block.html || escapeHtml(block.text || ""))}</div>`;
}

function renderStepBlockImage(section, sectionIndex, card, cardIndex, block, blockIndex) {
  if (!block.image) {
    if (!editMode) return `<div class="step-empty-image-view"></div>`;
    return `
      <button type="button" class="step-block-drag" title="Mover" aria-label="Mover" data-step-block-drag="${sectionIndex}:${cardIndex}:${blockIndex}">✥</button>
      <label class="step-image-plus">
        <span>+</span>
        <input type="file" accept="image/*" data-step-block-image-import="${sectionIndex}:${cardIndex}:${blockIndex}">
      </label>
    `;
  }

  const imageIndex = section.images.indexOf(block.image);
  const annotations = block.annotations || [];
  return `
    <div class="procedure-image-link step-card-image ${editMode ? "is-editable" : ""}" data-section="${sectionIndex}" data-card-index="${cardIndex}" data-block-index="${blockIndex}" data-image-index="${imageIndex}">
      ${editMode ? `<button type="button" class="step-block-drag" title="Mover" aria-label="Mover" data-step-block-drag="${sectionIndex}:${cardIndex}:${blockIndex}">✥</button>` : ""}
      <img src="${escapeHtml(block.image)}" alt="${escapeHtml(`${section.number} ${section.title} - bloco ${blockIndex + 1}`)}" loading="lazy">
      <div class="annotation-layer">
        ${annotations.map((annotation, annotationIndex) => renderAnnotation(annotation, sectionIndex, imageIndex, annotationIndex, cardIndex, blockIndex)).join("")}
      </div>
    </div>
  `;
}

function renderCanvasArrow(sectionIndex, cardIndex, block, blockIndex) {
  const arrowElement = editMode
    ? `<button type="button" class="canvas-arrow-move" title="Mover seta" aria-label="Mover seta" data-step-block-drag="${sectionIndex}:${cardIndex}:${blockIndex}" style="--step-rotation:${block.rotation || 0}deg;--arrow-border:${block.borderWidth || 3}px">${renderArrowSvg()}</button>`
    : `<div class="canvas-arrow-move" style="--step-rotation:${block.rotation || 0}deg;--arrow-border:${block.borderWidth || 3}px">${renderArrowSvg()}</div>`;
  return `
    ${editMode ? `
      <div class="canvas-object-controls">
        <button type="button" title="Diminuir espessura" aria-label="Diminuir espessura" data-step-arrow-width="${sectionIndex}:${cardIndex}:${blockIndex}:-1">-</button>
        <span>${block.borderWidth || 3}px</span>
        <button type="button" title="Aumentar espessura" aria-label="Aumentar espessura" data-step-arrow-width="${sectionIndex}:${cardIndex}:${blockIndex}:1">+</button>
        <button type="button" title="Girar anti-horário" aria-label="Girar anti-horário" data-rotate-step-block="${sectionIndex}:${cardIndex}:${blockIndex}:-15">−</button>
        <button type="button" title="Girar horário" aria-label="Girar horário" data-rotate-step-block="${sectionIndex}:${cardIndex}:${blockIndex}:15">+</button>
        <button type="button" class="icon-delete-button" title="Excluir" aria-label="Excluir" data-remove-step-block="${sectionIndex}:${cardIndex}:${blockIndex}">×</button>
      </div>
    ` : ""}
    <div class="canvas-arrow-visual-frame">
      ${arrowElement}
      ${editMode ? renderResizeHandle(sectionIndex, cardIndex, blockIndex, "arrow") : ""}
    </div>
  `;
}

function renderCanvasCircle(sectionIndex, cardIndex, block, blockIndex) {
  const circleElement = editMode
    ? `<button type="button" class="canvas-circle-move" title="Mover círculo" aria-label="Mover círculo" data-step-block-drag="${sectionIndex}:${cardIndex}:${blockIndex}" style="--circle-border:${block.borderWidth || 3}px">${renderCircleSvg()}</button>`
    : `<div class="canvas-circle-move" style="--circle-border:${block.borderWidth || 3}px">${renderCircleSvg()}</div>`;
  return `
    ${editMode ? `
      <div class="canvas-object-controls">
        <button type="button" title="Diminuir borda" aria-label="Diminuir borda" data-step-circle-width="${sectionIndex}:${cardIndex}:${blockIndex}:-1">−</button>
        <span>${block.borderWidth || 3}px</span>
        <button type="button" title="Aumentar borda" aria-label="Aumentar borda" data-step-circle-width="${sectionIndex}:${cardIndex}:${blockIndex}:1">+</button>
        <button type="button" class="icon-delete-button" title="Excluir" aria-label="Excluir" data-remove-step-block="${sectionIndex}:${cardIndex}:${blockIndex}">×</button>
      </div>
    ` : ""}
    ${circleElement}
  `;
}

function renderCanvasSquare(sectionIndex, cardIndex, block, blockIndex) {
  const squareElement = editMode
    ? `<button type="button" class="canvas-square-move" title="Mover quadrado" aria-label="Mover quadrado" data-step-block-drag="${sectionIndex}:${cardIndex}:${blockIndex}" style="--circle-border:${block.borderWidth || 3}px">${renderSquareSvg()}</button>`
    : `<div class="canvas-square-move" style="--circle-border:${block.borderWidth || 3}px">${renderSquareSvg()}</div>`;
  return `
    ${editMode ? `
      <div class="canvas-object-controls">
        <button type="button" title="Diminuir borda" aria-label="Diminuir borda" data-step-circle-width="${sectionIndex}:${cardIndex}:${blockIndex}:-1">-</button>
        <span>${block.borderWidth || 3}px</span>
        <button type="button" title="Aumentar borda" aria-label="Aumentar borda" data-step-circle-width="${sectionIndex}:${cardIndex}:${blockIndex}:1">+</button>
        <button type="button" class="icon-delete-button" title="Excluir" aria-label="Excluir" data-remove-step-block="${sectionIndex}:${cardIndex}:${blockIndex}">&times;</button>
      </div>
    ` : ""}
    ${squareElement}
  `;
}

function renderArrowSvg() {
  return `
    <span class="canvas-arrow-shape" aria-hidden="true">
      <span class="canvas-arrow-line"></span>
      <span class="canvas-arrow-head"></span>
    </span>
  `;
}

function renderCircleSvg() {
  return `
    <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <circle cx="50" cy="50" r="43"></circle>
    </svg>
  `;
}

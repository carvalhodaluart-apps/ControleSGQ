(function () {
  const MARKUP_TYPES = ["arrow", "circle", "square"];

  function label(type) {
    return { image: "Imagem", text: "Texto", arrow: "Seta", circle: "Círculo", square: "Retângulo" }[type] || "Elemento";
  }

  function button(icon, title, action, extra = "") {
    return `<button type="button" class="editor-tool-button ${extra}" title="${title}" aria-label="${title}" data-fabric-action="${action}"><span class="fabric-action-icon fabric-action-icon-${icon}" aria-hidden="true"></span></button>`;
  }

  function toneButtons(element) {
    if (element.type === "image") return "";
    const labels = { success: "Verde", warning: "Amarela", danger: "Vermelha" };
    return ["success", "warning", "danger"].map((tone) => (
      `<button type="button" class="editor-tool-button fabric-tone-dot fabric-tone-${tone} ${element.tone === tone ? "is-active" : ""}" title="Cor ${labels[tone]}" aria-label="Cor ${labels[tone]}" data-fabric-action="tone" data-tone="${tone}"></button>`
    )).join("");
  }

  function textGroup(element) {
    if (element.type !== "text") return "";
    return `
      <div class="fabric-ribbon-group" aria-label="Texto">
        ${button("edit", "Editar texto", "edit-text")}
        ${button("bold", "Negrito", "bold", Number(element.fontWeight) >= 700 ? "is-active fabric-icon-bold" : "fabric-icon-bold")}
        ${button("font-down", "Diminuir fonte", "font-down")}
        <span class="fabric-selection-value">${Math.round(element.fontSize || 20)}px</span>
        ${button("font-up", "Aumentar fonte", "font-up")}
        ${toneButtons(element)}
      </div>
    `;
  }

  function imageGroup(element) {
    if (element.type !== "image") return "";
    return `
      <div class="fabric-ribbon-group" aria-label="Imagem">
        ${button("image", "Substituir imagem", "replace-image")}
        ${window.FabricPropertyPanel?.render?.(element) || ""}
      </div>
    `;
  }

  function strokeGroup(element) {
    if (!MARKUP_TYPES.includes(element.type)) return "";
    return `
      <div class="fabric-ribbon-group" aria-label="Contorno">
        ${toneButtons(element)}
        ${button("minus", "Diminuir espessura", "stroke-down")}
        <span class="fabric-selection-value">${Math.round(element.borderWidth || 3)}px</span>
        ${button("plus", "Aumentar espessura", "stroke-up")}
        ${button("rotate-left", "Girar para a esquerda", "rotate-left")}
        ${button("rotate-right", "Girar para a direita", "rotate-right")}
      </div>
    `;
  }

  function selectedLabel(element) {
    return `<div class="fabric-ribbon-group" aria-label="Elemento selecionado"><span class="fabric-selection-pill">${label(element.type)}</span></div>`;
  }

  function deleteGroup() {
    return `<div class="fabric-ribbon-group fabric-ribbon-delete" aria-label="A&#xE7;&#xF5;es do elemento">${button("delete", "Excluir elemento", "delete", "fabric-selection-delete")}</div>`;
  }

  function toolbarHtml(element) {
    return `${selectedLabel(element)}${textGroup(element)}${imageGroup(element)}${strokeGroup(element)}${deleteGroup()}`;
  }

  function cropToolbarHtml() {
    return `<div class="fabric-ribbon-group fabric-crop-actions" aria-label="Recorte da imagem">${button("check", "Aplicar recorte", "crop-apply")}${button("delete", "Cancelar recorte", "crop-cancel", "fabric-selection-delete")}</div>`;
  }

  function render(session, getElement) {
    const toolbar = session.toolbar;
    if (!toolbar) return;
    if (session.isCroppingImage) {
      toolbar.classList.remove("is-empty");
      toolbar.innerHTML = cropToolbarHtml();
      toolbar.hidden = false;
      return;
    }
    const element = getElement(session);
    toolbar.classList.toggle("is-empty", !element);
    toolbar.innerHTML = element ? toolbarHtml(element) : "";
    toolbar.hidden = false;
  }

  function ensure(session, callbacks) {
    const cardNode = session.canvasElement.closest("[data-step-card]");
    const host = cardNode?.querySelector(".step-card-topbar") || session.canvasElement.parentElement;
    session.toolbar = host.querySelector("[data-fabric-selection-toolbar]");
    if (!session.toolbar) {
      session.toolbar = document.createElement("div");
      session.toolbar.className = "fabric-selection-toolbar is-empty";
      session.toolbar.dataset.fabricSelectionToolbar = `${session.sectionIndex}:${session.cardIndex}`;
      host.appendChild(session.toolbar);
    }
    render(session, callbacks.getElement);
    const ribbon = host.querySelector(".canvas-ribbon");
    if (!ribbon || ribbon.dataset.fabricRibbonReady) return;
    ribbon.dataset.fabricRibbonReady = "true";
    ["mousedown", "pointerdown"].forEach((type) => {
      ribbon.addEventListener(type, (event) => {
        if (!event.target?.closest?.("[data-fabric-action], [data-fabric-tool], [data-add-step-block], [data-fabric-select]")) return;
        event.preventDefault();
        event.stopPropagation();
      });
    });
    ribbon.addEventListener("click", (event) => {
      const selectButton = event.target?.closest?.("[data-fabric-select]");
      const imageButton = event.target?.closest?.("[data-add-step-block]");
      const toolButton = event.target?.closest?.("[data-fabric-tool]");
      const actionButton = event.target?.closest?.("[data-fabric-action]");
      if (!selectButton && !imageButton && !toolButton && !actionButton) return;
      event.preventDefault();
      event.stopPropagation();
      callbacks.setActive(session);
      if (selectButton) return callbacks.select(session);
      if (imageButton) return callbacks.addImage(session);
      if (toolButton) return callbacks.activateTool(session, toolButton.dataset.fabricTool, toolButton.dataset.tone || "success");
      return callbacks.handleAction(session, actionButton.dataset.fabricAction, actionButton.dataset);
    });
  }

  window.FabricEditorToolbar = { ensure, render };
}());

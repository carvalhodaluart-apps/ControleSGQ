function renderRibbonButton(icon, title, action, extra = "") {
  return `<button type="button" ${extra} title="${title}" aria-label="${title}" ${action}><span class="canvas-tool-icon canvas-tool-icon-${icon}" aria-hidden="true"></span></button>`;
}

function renderFabricCanvasRibbon(sectionIndex, cardIndex) {
  const target = `${sectionIndex}:${cardIndex}`;
  return `
    <div class="canvas-toolbar canvas-ribbon" data-fabric-ribbon="${target}">
      <div class="canvas-ribbon-main" aria-label="Ferramentas do canvas">
        <div class="canvas-ribbon-group canvas-ribbon-primary">
          ${renderRibbonButton("image", "Inserir imagem", `data-add-step-block="${target}:image"`, 'class="canvas-command-button editor-tool-button"')}
          ${renderRibbonButton("text", "Adicionar texto", 'data-fabric-tool="text" data-tone="success"', 'class="canvas-command-button editor-tool-button"')}
        </div>
        <div class="canvas-ribbon-group canvas-ribbon-markup">
          ${renderRibbonButton("arrow-left", "Adicionar seta", 'data-fabric-tool="arrow" data-tone="success"', 'class="canvas-command-button editor-tool-button"')}
          ${renderRibbonButton("circle", "Adicionar círculo", 'data-fabric-tool="circle" data-tone="success"', 'class="canvas-command-button editor-tool-button"')}
          ${renderRibbonButton("square", "Adicionar retângulo", 'data-fabric-tool="square" data-tone="success"', 'class="canvas-command-button editor-tool-button"')}
        </div>
        <div class="canvas-ribbon-group canvas-ribbon-history" aria-label="Histórico de edição">
          ${renderRibbonButton("undo", "Desfazer", 'data-fabric-history="undo"', 'class="canvas-command-button editor-tool-button"')}
          ${renderRibbonButton("redo", "Refazer", 'data-fabric-history="redo"', 'class="canvas-command-button editor-tool-button"')}
        </div>
      </div>
      <div class="canvas-tool-status" data-fabric-tool-status="${target}" aria-live="polite">
        Selecione uma ferramenta ou clique em um elemento.
      </div>
      <div class="fabric-selection-toolbar is-empty" data-fabric-selection-toolbar="${target}"></div>
    </div>
  `;
}

window.renderFabricCanvasRibbon = renderFabricCanvasRibbon;

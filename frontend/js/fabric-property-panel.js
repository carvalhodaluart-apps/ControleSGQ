(function () {
  function render(element) {
    if (!element || element.type !== "image") return "";
    const adjustActive = element.fit !== "cover" ? "is-active" : "";
    return `
      <div class="fabric-ribbon-group fabric-image-fit-panel" aria-label="Ajuste de imagem">
        <button type="button" class="editor-tool-button ${adjustActive}" data-fabric-action="fit" data-fit="contain" title="Ajustar imagem" aria-label="Ajustar imagem">&#x25A1;</button>
        <button type="button" class="editor-tool-button" data-fabric-action="crop-image" title="Recortar imagem" aria-label="Recortar imagem">&#x2702;</button>
      </div>
    `;
  }

  window.FabricPropertyPanel = { render };
}());

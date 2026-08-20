(function () {
  function render(element) {
    if (!element || element.type !== "image") return "";
    return `
      <div class="fabric-ribbon-group fabric-image-fit-panel" aria-label="Ajuste de imagem">
        <button type="button" class="editor-tool-button" data-fabric-action="crop-image" title="Recortar imagem" aria-label="Recortar imagem">&#x2702;</button>
      </div>
    `;
  }

  window.FabricPropertyPanel = { render };
}());

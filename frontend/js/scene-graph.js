(function () {
  const Core = window.SceneGraphCore;
  if (!Core) return;
  const Fabric = window.fabric;
  const Factory = window.FabricObjectFactory;
  const previewScenes = new Map();

  function scenePreview(scene, label, exportName, itemClass = "") {
    previewScenes.set(exportName, scene);
    return `
      <details class="scene-graph-preview ${itemClass}">
        <summary>${label}</summary>
        <div class="scene-graph-preview-actions">
          <button type="button" data-scene-graph-export="${exportName}">Exportar PNG</button>
        </div>
        <canvas class="scene-graph-preview-canvas" data-scene-graph-canvas="${exportName}" aria-label="${label}"></canvas>
    </details>
    `;
  }

  function renderScenePreview(card, sectionIndex, cardIndex) {
    return scenePreview(
      Core.cardToScene(card, sectionIndex, cardIndex),
      "Previa scene graph",
      `${sectionIndex}:${cardIndex}`,
    );
  }

  function renderItemScenePreview(section, sectionIndex) {
    const scene = Core.itemSectionToScene(section, sectionIndex);
    if (!scene.elements.length) return "";
    return scenePreview(scene, "Previa scene graph dos itens", `itens-${sectionIndex}`, "scene-graph-preview-items");
  }

  function getSvgSize(svg) {
    const viewBox = svg.getAttribute("viewBox")?.split(/\s+/).map(Number) || [];
    return { width: viewBox[2] || Core.STEP_SCENE_SIZE.width, height: viewBox[3] || Core.STEP_SCENE_SIZE.height };
  }

  async function mountPreview(canvasElement, scene) {
    if (!Fabric || !Factory || canvasElement.dataset.sceneGraphMounted === "true") return;
    canvasElement.dataset.sceneGraphMounted = "loading";
    const normalized = Core.normalizeScene(scene, scene?.id || "preview", scene?.size || Core.STEP_SCENE_SIZE);
    canvasElement.width = normalized.size.width;
    canvasElement.height = normalized.size.height;
    const canvas = new Fabric.StaticCanvas(canvasElement, {
      width: normalized.size.width,
      height: normalized.size.height,
      backgroundColor: "#ffffff",
      enableRetinaScaling: false,
      renderOnAddRemove: false,
    });
    try {
      for (const element of normalized.elements) {
        const objects = await Factory.createWithAnnotations(element, { interactive: false });
        objects.forEach((object) => canvas.add(object));
      }
      canvas.renderAll();
      canvasElement.dataset.sceneGraphMounted = "true";
      canvasElement.__sceneGraphCanvas = canvas;
    } catch (error) {
      canvas.dispose();
      canvasElement.dataset.sceneGraphMounted = "error";
      console.error("Falha ao montar prévia Fabric:", error);
    }
  }

  function mountPreviews(root = document) {
    if (!Fabric || !Factory) return;
    root.querySelectorAll?.("[data-scene-graph-canvas]").forEach((canvasElement) => {
      const scene = previewScenes.get(canvasElement.dataset.sceneGraphCanvas);
      if (scene) mountPreview(canvasElement, scene);
    });
  }

  async function downloadScenePng(button) {
    const preview = button.closest(".scene-graph-preview");
    const canvas = preview?.querySelector("[data-scene-graph-canvas]");
    if (!canvas) return;
    button.disabled = true;
    const original = button.textContent;
    button.textContent = "Exportando...";
    try {
      if (canvas.dataset.sceneGraphMounted !== "true") await mountPreview(canvas, previewScenes.get(canvas.dataset.sceneGraphCanvas));
      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = canvas.width * 2;
      exportCanvas.height = canvas.height * 2;
      exportCanvas.getContext("2d").drawImage(canvas, 0, 0, exportCanvas.width, exportCanvas.height);
      const blob = await new Promise((resolve) => exportCanvas.toBlob(resolve, "image/png"));
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `scene-graph-${button.dataset.sceneGraphExport}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 3000);
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-scene-graph-export]");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    downloadScenePng(button).catch((error) => console.error("Falha ao exportar scene graph:", error));
  });

  document.addEventListener("toggle", (event) => {
    if (event.target.matches?.(".scene-graph-preview") && event.target.open) mountPreviews(event.target);
  }, true);

  window.SceneGraph = {
    ...Core,
    downloadScenePng,
    mountPreviews,
    renderItemScenePreview,
    renderScenePreview,
  };
}());

(function () {
  const Core = window.SceneGraphCore;
  const Fabric = window.fabric;
  const Factory = window.FabricObjectFactory;
  if (!Core || !Fabric || !Factory) return;

  const EXPORT_DPI = 300;
  const A4_CONTENT_WIDTH_POINTS = 595.28 - 72;

  function makeCanvas(size, multiplier) {
    const element = document.createElement("canvas");
    element.width = size.width * multiplier;
    element.height = size.height * multiplier;
    return new Fabric.StaticCanvas(element, {
      width: size.width,
      height: size.height,
      backgroundColor: "#ffffff",
      enableRetinaScaling: false,
      renderOnAddRemove: false,
    });
  }

  async function renderScene(scene, multiplier) {
    const normalized = Core.normalizeScene(scene, scene?.id || "scene", scene?.size || Core.STEP_SCENE_SIZE);
    const canvas = makeCanvas(normalized.size, multiplier);
    try {
      for (const element of normalized.elements) {
        const objects = await Factory.createWithAnnotations(element, { interactive: false });
        objects.forEach((object) => canvas.add(object));
      }
      canvas.renderAll();
      return canvas.toDataURL({ format: "png", multiplier });
    } finally {
      canvas.dispose();
    }
  }

  function pdfMultiplier(size) {
    const targetPixels = (A4_CONTENT_WIDTH_POINTS / 72) * EXPORT_DPI;
    return Math.max(2, targetPixels / size.width);
  }

  async function exportStepCardPng(card, sectionIndex, cardIndex) {
    const scene = Core.cardToScene(card, sectionIndex, cardIndex);
    return renderScene(scene, pdfMultiplier(scene.size));
  }

  async function exportItemBoardPng(section, sectionIndex) {
    const scene = Core.itemSectionToScene(section, sectionIndex);
    if (!scene.elements.length) return "";
    return renderScene(scene, pdfMultiplier(scene.size));
  }

  window.FabricSceneRenderer = { EXPORT_DPI, exportItemBoardPng, exportStepCardPng, renderScene };
}());

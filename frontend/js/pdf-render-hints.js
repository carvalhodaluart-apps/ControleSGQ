(function () {
  function createProcedurePdfSnapshot(procedure) {
    return typeof createProcedureSaveSnapshot === "function" ? createProcedureSaveSnapshot(procedure) : cloneData(procedure);
  }

  function waitForImages() {
    return Promise.all(Array.from(document.images).map((image) => {
      if (image.complete) return Promise.resolve();
      return new Promise((resolve) => {
        image.addEventListener("load", resolve, { once: true });
        image.addEventListener("error", resolve, { once: true });
      });
    }));
  }

  async function attachFabricExports(snapshot) {
    const renderer = window.FabricSceneRenderer;
    if (!renderer) return snapshot;
    await document.fonts?.ready;
    await waitForImages();
    for (const [sectionIndex, section] of (snapshot.sections || []).entries()) {
      if (section.kind === "items") {
        const image = await renderer.exportItemBoardPng(section, sectionIndex);
        if (image) section.sceneExport = { renderer: "fabric", dpi: renderer.EXPORT_DPI, image };
      }
      for (const [cardIndex, card] of (section.stepCards || []).entries()) {
        const image = await renderer.exportStepCardPng(card, sectionIndex, cardIndex);
        if (image) card.sceneExport = { renderer: "fabric", dpi: renderer.EXPORT_DPI, image };
      }
    }
    return compactPdfSnapshot(snapshot);
  }

  function compactPdfSnapshot(snapshot) {
    (snapshot.sections || []).forEach((section) => {
      (section.stepCards || []).forEach((card) => {
        if (!card.sceneExport?.image) return;

        // O PDF usa a cena rasterizada; remova imagens duplicadas somente do snapshot temporário.
        card.image = "";
        card.blocks = (card.blocks || []).map((block) => ({ ...block, image: "" }));
        if (Array.isArray(card.scene?.elements)) {
          card.scene.elements = card.scene.elements.map((element) => ({ ...element, image: "" }));
        }
      });
    });
    return snapshot;
  }

  window.createProcedurePdfSnapshot = async (procedure) => attachFabricExports(createProcedurePdfSnapshot(procedure));
}());

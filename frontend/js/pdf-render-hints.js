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
    return snapshot;
  }

  window.createProcedurePdfSnapshot = async (procedure) => attachFabricExports(createProcedurePdfSnapshot(procedure));
}());

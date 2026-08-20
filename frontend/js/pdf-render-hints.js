(function () {
  window.removeTransientPdfExports = (procedure) => {
    (procedure?.sections || []).forEach((section) => {
      delete section.sceneExport;
      (section.stepCards || []).forEach((card) => delete card.sceneExport);
    });
    return procedure;
  };

  function compactPdfSnapshot(snapshot) {
    (snapshot.sections || []).forEach((section) => {
      (section.stepCards || []).forEach((card) => {
        // A cena é a fonte única do PDF. Remova cópias legadas apenas quando
        // ela existe; assim o pedido fica menor sem perder a imagem recortada.
        if (!Array.isArray(card.scene?.elements)) return;
        card.image = "";
        card.blocks = (card.blocks || []).map((block) => ({ ...block, image: "" }));
      });
    });
    return snapshot;
  }

  window.createProcedurePdfSnapshot = async (procedure) => compactPdfSnapshot(createProcedureSaveSnapshot(procedure));
}());

(function () {
  const Core = window.SceneGraphCore;
  const root = document.querySelector("#procedureRoot");
  const output = document.querySelector("[data-test-json]");
  if (!Core || !root) return;

  window.editMode = true;
  window.activeProcedure = {
    title: "Teste Fabric",
    sections: [{
      number: "1.0",
      title: "Etapa de teste",
      kind: "step",
      instructions: [],
      images: [],
      tables: [],
      materials: [],
      annotations: {},
      stepCards: [{ blocks: [] }, { blocks: [] }],
    }],
  };
  function resizeImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
  }

  function updateSnapshot() {
    Core.syncProcedureScenes(window.activeProcedure);
    if (output) output.textContent = JSON.stringify(window.activeProcedure.sections[0].stepCards.map((card) => ({
      scene: card.scene,
      blocks: card.blocks,
    })), null, 2);
  }

  window.resizeImage = window.resizeImage || resizeImage;
  window.saveProcedure = updateSnapshot;

  window.activeProcedure.sections[0].stepCards.forEach((card, index) => {
    Core.normalizeCardScene(card, 0, index);
  });

  root.innerHTML = `
    <div class="step-card-list">
      ${window.activeProcedure.sections[0].stepCards.map((_card, index) => `
        <article class="step-card" data-step-card="0:${index}">
          <div class="step-card-topbar has-fabric-ribbon">
            ${window.renderFabricCanvasRibbon(0, index)}
          </div>
          <div class="step-card-canvas is-editable has-fabric-editor" data-step-canvas="0:${index}">
            <canvas class="fabric-step-canvas" data-fabric-step-canvas="0:${index}" aria-label="Canvas de teste ${index + 1}"></canvas>
          </div>
        </article>
      `).join("")}
    </div>
  `;

  window.FabricStepEditor.mountAll(window.activeProcedure)
    .then(updateSnapshot)
    .catch((error) => {
      console.error("Falha no teste manual Fabric:", error);
      root.insertAdjacentHTML("afterbegin", `<p role="alert">${error.message}</p>`);
    });
}());

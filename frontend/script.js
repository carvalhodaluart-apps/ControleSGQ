const jsonInput = document.querySelector("#procedureJsonInput");
const importError = document.querySelector("#creatorImportError");
const createButton = document.querySelector("[data-create-procedure]");

async function apiPost(path, payload) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Erro ao comunicar com o servidor.");
  }
  return response.json();
}

function openProcedure(procedure) {
  const equipmentCode = procedure.equipmentCode || "NOVO";
  const procedureId = procedure.procedureId || "rascunho";
  window.location.href = `procedimentos.html?criador=1&equipamento=${encodeURIComponent(equipmentCode)}&procedimento=${encodeURIComponent(procedureId)}`;
}

createButton?.addEventListener("click", async () => {
  importError.textContent = "";
  createButton.disabled = true;
  try {
    const data = await apiPost("/api/procedures/new", {});
    openProcedure(data.procedure);
  } catch (error) {
    importError.textContent = `${error.message} Rode o sistema com npm start.`;
  } finally {
    createButton.disabled = false;
  }
});

jsonInput?.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const data = JSON.parse(await file.text());
    const imported = await apiPost("/api/procedures/import", { procedure: data });
    openProcedure(imported.procedure);
  } catch (error) {
    importError.textContent = error.message || "Não foi possível importar este JSON.";
    event.target.value = "";
  }
});

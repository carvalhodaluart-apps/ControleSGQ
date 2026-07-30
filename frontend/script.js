const jsonInput = document.querySelector("#procedureJsonInput");
const importError = document.querySelector("#creatorImportError");
const createButton = document.querySelector("[data-create-procedure]");
const configurationAccess = document.querySelector("#configurationAccess");
const configurationAccessForm = document.querySelector("#configurationAccessForm");
const configurationAccessPassword = document.querySelector("#configurationAccessPassword");
const configurationAccessError = document.querySelector("#configurationAccessError");
const qualityTokenKey = "procedure-quality-token";
const configurationEntryTokenKey = "configuration-entry-token";

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

function closeConfigurationAccess() {
  configurationAccess?.classList.add("is-hidden");
  configurationAccessPassword.value = "";
  configurationAccessError.textContent = "";
}

document.querySelector("[data-open-configuration]")?.addEventListener("click", () => {
  configurationAccess.classList.remove("is-hidden");
  configurationAccessPassword.focus();
});
document.querySelector("[data-close-configuration]")?.addEventListener("click", closeConfigurationAccess);
configurationAccess?.addEventListener("click", (event) => {
  if (event.target === configurationAccess) closeConfigurationAccess();
});
configurationAccessForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  configurationAccessError.textContent = "";
  const submitButton = configurationAccessForm.querySelector("[type=submit]");
  submitButton.disabled = true;
  try {
    const data = await apiPost("/api/procedures/auth/quality", { password: configurationAccessPassword.value });
    sessionStorage.setItem(qualityTokenKey, data.token);
    sessionStorage.setItem(configurationEntryTokenKey, "1");
    window.location.href = "configuracoes.html";
  } catch (error) {
    configurationAccessError.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
});

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

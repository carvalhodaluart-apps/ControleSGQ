const jsonInput = document.querySelector("#procedureJsonInput");
const importError = document.querySelector("#creatorImportError");
const createButton = document.querySelector("[data-create-procedure]");
const configurationAccess = document.querySelector("#configurationAccess");
const configurationAccessForm = document.querySelector("#configurationAccessForm");
const configurationAccessUsername = document.querySelector("#configurationAccessUsername");
const configurationAccessPassword = document.querySelector("#configurationAccessPassword");
const configurationAccessError = document.querySelector("#configurationAccessError");
const configurationAccessCancel = document.querySelector("[data-close-configuration]");
const creatorUserState = document.querySelector("#creatorUserState");
const creatorLogout = document.querySelector("#creatorLogout");
const creatorSettingsButton = document.querySelector("#creatorSettingsButton");
const creatorHome = document.querySelector(".creator-home");
const appBootState = document.querySelector("#appBootState");
const draftSelection = document.querySelector("#draftSelection");
const draftSelectionList = document.querySelector("#draftSelectionList");
const draftSelectionError = document.querySelector("#draftSelectionError");
const startBlankProcedureButton = document.querySelector("#startBlankProcedure");
const qualityTokenKey = "procedure-quality-token";
const userRoleKey = "procedure-user-role";
const configurationEntryTokenKey = "configuration-entry-token";
const masterEntryTokenKey = "master-entry-token";
const procedureEntryTokenKey = "procedure-entry-token";
let pendingProtectedAction = null;
let lastFocusedElement = null;

function finishBoot() {
  appBootState?.setAttribute("hidden", "");
}

function normalizeRole(role) {
  return role === "quality" ? "manager" : role || "manager";
}

function getCurrentRole() {
  return normalizeRole(sessionStorage.getItem(userRoleKey));
}

function isLoggedIn() {
  return Boolean(sessionStorage.getItem(qualityTokenKey));
}

function isManager() {
  return getCurrentRole() === "manager";
}

function canAccessTarget(target) {
  if (target === "configuracoes.html") return isManager();
  return target === "lista-mestra.html" || target === "procedimentos.html" || target === "nao-conformidades.html" || target === "planos-acao.html" || target === "instrumentos.html";
}

function markEntryToken(target) {
  if (target === "configuracoes.html") sessionStorage.setItem(configurationEntryTokenKey, "1");
  if (target === "lista-mestra.html") sessionStorage.setItem(masterEntryTokenKey, "1");
  if (target === "procedimentos.html") sessionStorage.setItem(procedureEntryTokenKey, "1");
}

function updateHomeAccess() {
  creatorHome?.classList.toggle("is-locked", !isLoggedIn());
  if (!creatorUserState) return;
  if (!isLoggedIn()) {
    creatorUserState.textContent = "Acesso não iniciado";
    creatorSettingsButton.hidden = true;
    return;
  }
  creatorUserState.textContent = isManager() ? "Gestor conectado" : "Editor conectado";
  creatorSettingsButton.hidden = !isManager();
}

async function apiPost(path, payload) {
  const qualityToken = sessionStorage.getItem(qualityTokenKey) || "";
  const requestPayload = payload?.procedure
    ? { ...payload, procedure: window.ProcedurePayloadAssets.packProcedure(payload.procedure) }
    : payload;
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(qualityToken ? { Authorization: `Bearer ${qualityToken}` } : {}),
    },
    body: JSON.stringify(requestPayload),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const error = new Error(data.error || "Erro ao comunicar com o servidor.");
    error.status = response.status;
    throw error;
  }
  const data = await response.json();
  if (data?.procedure) data.procedure = window.ProcedurePayloadAssets.unpackProcedure(data.procedure);
  return data;
}

async function apiGet(path) {
  const qualityToken = sessionStorage.getItem(qualityTokenKey) || "";
  const response = await fetch(path, {
    cache: "no-store",
    headers: qualityToken ? { Authorization: `Bearer ${qualityToken}` } : {},
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const error = new Error(data.error || "Erro ao comunicar com o servidor.");
    error.status = response.status;
    throw error;
  }
  const data = await response.json();
  if (data?.procedure) data.procedure = window.ProcedurePayloadAssets.unpackProcedure(data.procedure);
  return data;
}

function escapeText(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function closeDraftSelection() {
  draftSelection?.classList.add("is-hidden");
  draftSelectionError.textContent = "";
}

function renderDraftSelection(drafts) {
  if (!drafts.length) {
    draftSelectionList.innerHTML = '<p class="draft-selection-empty">Nenhum documento em elaboração foi autorizado ainda.</p>';
    return;
  }
  draftSelectionList.innerHTML = drafts.map((draft) => `
    <article class="draft-selection-item">
      <div>
        <strong>${escapeText(draft.documentCode || "Código pendente")}</strong>
        <h3>${escapeText(draft.title || "Sem título")}</h3>
        <p>${escapeText(draft.equipmentCode || "Sem equipamento")} · ${escapeText(draft.documentType || "")} · ${escapeText(draft.sector || "")}</p>
      </div>
      <div class="draft-continue-control">
        <button type="button" class="primary-button draft-continue-button" data-select-draft-saved>Continuar</button>
        <button type="button" class="secondary-button draft-continue-button" data-select-draft-json>Importar arquivo</button>
        <input type="file" accept=".json,application/json" hidden data-draft-file="${escapeText(draft.procedureId)}" data-draft-code="${escapeText(draft.documentCode || "")}">
      </div>
      <p class="draft-item-error" data-draft-error="${escapeText(draft.procedureId)}" role="alert" tabindex="-1"></p>
    </article>
  `).join("");
}

async function showDraftSelection() {
  draftSelectionError.textContent = "";
  draftSelectionList.innerHTML = '<p class="draft-selection-empty">Carregando documentos...</p>';
  draftSelection.classList.remove("is-hidden");
  try {
    const data = await apiGet("/api/procedures/drafts");
    renderDraftSelection(data.drafts || []);
  } catch (error) {
    if (error.status === 401) {
      closeDraftSelection();
      sessionStorage.removeItem(qualityTokenKey);
      sessionStorage.removeItem(userRoleKey);
      updateHomeAccess();
      pendingProtectedAction = { target: "procedimentos.html", action: showDraftSelection };
      showLogin("procedimentos.html");
      return;
    }
    draftSelectionList.innerHTML = "";
    draftSelectionError.textContent = error.message;
  }
}

function closeConfigurationAccess(force = false) {
  if (!force && configurationAccess?.dataset.required === "true") {
    configurationAccessError.textContent = "O login \u00e9 obrigat\u00f3rio para acessar o aplicativo.";
    configurationAccessPassword.focus();
    return;
  }
  configurationAccess?.classList.add("is-hidden");
  configurationAccessPassword.value = "";
  configurationAccessUsername.value = "";
  configurationAccessError.textContent = "";
  configurationAccessCancel.hidden = false;
  pendingProtectedAction = null;
}

function showLogin(target = null) {
  lastFocusedElement = document.activeElement;
  const title = target === "configuracoes.html" ? "Acesso do gestor" : target === "lista-mestra.html" ? "Acesso à lista mestra" : target ? "Acesso ao editor" : "Entrar no sistema";
  const message = target === "configuracoes.html"
    ? "Use um usuário gestor ou a senha da qualidade."
    : target === "lista-mestra.html"
      ? "Editores e gestores podem consultar a lista mestra."
      : target
        ? "Editores e gestores podem criar e editar procedimentos."
        : "Informe seu usuário e senha para continuar.";
  configurationAccess.querySelector("h2").textContent = title;
  configurationAccess.querySelector("p").textContent = message;
  configurationAccess.dataset.required = target ? "false" : "true";
  configurationAccessCancel.hidden = !target;
  configurationAccess.classList.remove("is-hidden");
  configurationAccessUsername.focus();
}

function openProtectedAccess(target, action = null) {
  if (isLoggedIn() && target && canAccessTarget(target)) {
    markEntryToken(target);
    if (action) return action();
    window.location.href = target;
    return;
  }
  pendingProtectedAction = { target, action };
  showLogin(target);
}

async function validateStoredSession() {
  if (!isLoggedIn()) {
    updateHomeAccess();
    showLogin();
    return;
  }
  try {
    const data = await apiGet("/api/procedures/session");
    sessionStorage.setItem(userRoleKey, normalizeRole(data.user?.role));
    updateHomeAccess();
  } catch (error) {
    if (error.status !== 401) {
      updateHomeAccess();
      return;
    }
    sessionStorage.removeItem(qualityTokenKey);
    sessionStorage.removeItem(userRoleKey);
    updateHomeAccess();
    showLogin();
  }
}

document.querySelectorAll("[data-open-protected]").forEach((button) => {
  button.addEventListener("click", () => openProtectedAccess(button.dataset.openProtected));
});

document.querySelectorAll("[data-open-nonconformity]").forEach((button) => {
  button.addEventListener("click", () => {
    const mode = button.dataset.openNonconformity === "new" ? "novo" : "editar";
    openProtectedAccess("nao-conformidades.html", () => {
      window.location.href = `nao-conformidades.html?modo=${mode}`;
    });
  });
});

document.querySelectorAll("[data-open-action-plan]").forEach((button) => {
  button.addEventListener("click", () => {
    const mode = button.dataset.openActionPlan === "new" ? "novo" : "editar";
    openProtectedAccess("planos-acao.html", () => { window.location.href = `planos-acao.html?modo=${mode}`; });
  });
});

document.querySelectorAll("[data-open-instrument]").forEach((button) => {
  button.addEventListener("click", () => {
    const mode = button.dataset.openInstrument === "new" ? "novo" : "editar";
    openProtectedAccess("instrumentos.html", () => { window.location.href = `instrumentos.html?modo=${mode}`; });
  });
});

document.querySelector("[data-close-configuration]")?.addEventListener("click", closeConfigurationAccess);
configurationAccess?.addEventListener("click", (event) => {
  if (event.target === configurationAccess) closeConfigurationAccess();
});
configurationAccess?.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && configurationAccess.dataset.required !== "true") {
    event.preventDefault();
    closeConfigurationAccess();
    lastFocusedElement?.focus?.();
    return;
  }
  if (event.key !== "Tab") return;
  const focusable = [...configurationAccess.querySelectorAll("button:not([hidden]), input:not([disabled])")];
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});

configurationAccessForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  configurationAccessError.textContent = "";
  const submitButton = configurationAccessForm.querySelector("[type=submit]");
  submitButton.disabled = true;
  try {
    const username = configurationAccessUsername.value.trim().toLowerCase();
    if (!username) throw new Error("Informe o usuário.");
    const isQualityUser = username === "qualidade";
    const authPath = isQualityUser ? "/api/procedures/auth/quality" : "/api/procedures/auth/user";
    const authPayload = isQualityUser
      ? { password: configurationAccessPassword.value }
      : { username, password: configurationAccessPassword.value };
    const data = await apiPost(authPath, authPayload);
    sessionStorage.setItem(qualityTokenKey, data.token);
    sessionStorage.setItem(userRoleKey, normalizeRole(data.user?.role));
    const protectedAction = pendingProtectedAction;
    if (protectedAction?.target && !canAccessTarget(protectedAction.target)) throw new Error("Seu perfil não possui acesso a esta área.");
    pendingProtectedAction = null;
    updateHomeAccess();
    if (protectedAction?.target) markEntryToken(protectedAction.target);
    closeConfigurationAccess(true);
    if (protectedAction?.action) await protectedAction.action();
    else if (protectedAction?.target) window.location.href = protectedAction.target;
  } catch (error) {
    configurationAccessError.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
});

function openProcedure(procedure, { fresh = false } = {}) {
  const equipmentCode = procedure.equipmentCode || "NOVO";
  const procedureId = procedure.procedureId || "rascunho";
  sessionStorage.setItem(procedureEntryTokenKey, "1");
  const freshParameter = fresh ? "&novo=1" : "";
  window.location.href = `procedimentos.html?criador=1&equipamento=${encodeURIComponent(equipmentCode)}&procedimento=${encodeURIComponent(procedureId)}${freshParameter}`;
}

async function createNewProcedure() {
  createButton.disabled = true;
  try {
    const data = await apiPost("/api/procedures/new", {});
    openProcedure(data.procedure, { fresh: true });
  } catch (error) {
    importError.textContent = `${error.message} Rode o sistema com npm start.`;
    createButton.disabled = false;
  }
}

createButton?.addEventListener("click", () => {
  importError.textContent = "";
  openProtectedAccess("procedimentos.html", showDraftSelection);
});

document.querySelectorAll("[data-close-drafts]").forEach((button) => button.addEventListener("click", closeDraftSelection));
draftSelection?.addEventListener("click", (event) => {
  if (event.target === draftSelection) closeDraftSelection();
  const savedButton = event.target?.closest?.("[data-select-draft-saved]");
  if (savedButton) {
    const fileInput = savedButton.closest(".draft-selection-item")?.querySelector("[data-draft-file]");
    if (fileInput) continueDraftFromServer(fileInput.dataset.draftFile, savedButton);
    return;
  }
  const selectButton = event.target?.closest?.("[data-select-draft-json]");
  if (!selectButton) return;
  const fileInput = selectButton.closest(".draft-selection-item")?.querySelector("[data-draft-file]");
  fileInput?.click();
});
startBlankProcedureButton?.addEventListener("click", async () => {
  closeDraftSelection();
  await createNewProcedure();
});

async function continueDraftWithProcedure(procedure, draftId, fileInput) {
  draftSelectionError.textContent = "";
  const item = fileInput.closest(".draft-selection-item");
  const itemError = item?.querySelector("[data-draft-error]");
  if (itemError) itemError.textContent = "";
  const button = item?.querySelector("[data-select-draft-saved]");
  if (button) {
    button.disabled = true;
    button.textContent = "Validando...";
  }
  try {
    const expectedCode = String(fileInput.dataset.draftCode || "").trim().toUpperCase();
    const receivedCode = String(procedure.documentCode || "").trim().toUpperCase();
    if (!expectedCode || receivedCode !== expectedCode) {
      throw Object.assign(new Error("Este arquivo não corresponde ao código do documento selecionado."), { status: 400 });
    }
    const current = await apiGet(`/api/procedures/load?id=${encodeURIComponent(draftId)}`);
    const receivedTime = Date.parse(procedure.updatedAt || "");
    const currentTime = Date.parse(current.procedure?.updatedAt || "");
    const path = Number.isFinite(receivedTime) && Number.isFinite(currentTime) && receivedTime > currentTime
      ? "/api/procedures/restore"
      : "/api/procedures/continue";
    const continued = await apiPost(path, { draftProcedureId: draftId, procedure });
    closeDraftSelection();
    openProcedure(continued.procedure);
  } catch (error) {
    if (error.status === 409) error.message = "Este arquivo é uma versão anterior do rascunho. Clique em Continuar para abrir a versão salva ou importe um arquivo mais recente.";
    const message = error.status === 400
      ? "Este arquivo não corresponde ao código do documento selecionado. Escolha o arquivo correto para continuar."
      : error.message || "Não foi possível continuar este documento. Verifique o arquivo e tente novamente.";
    if (itemError) {
      itemError.textContent = message;
      itemError.focus({ preventScroll: true });
      itemError.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      draftSelectionError.textContent = message;
      draftSelectionError.focus({ preventScroll: true });
      draftSelectionError.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    fileInput.value = "";
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Continuar";
    }
  }
}

async function continueDraftFromServer(draftId, button) {
  const item = button.closest(".draft-selection-item");
  const itemError = item?.querySelector("[data-draft-error]");
  if (itemError) itemError.textContent = "";
  button.disabled = true;
  button.textContent = "Verificando...";
  try {
    const result = await apiGet(`/api/procedures/load?id=${encodeURIComponent(draftId)}`);
    let local = { found: false };
    try {
      local = await window.secureProcedureFolder?.readProcedureJson(draftId) || local;
    } catch (error) {
      console.warn("Não foi possível verificar o arquivo local do procedimento:", error);
    }
    const localProcedure = local.found ? local.procedure : null;
    const localMatchesDraft = localProcedure
      && String(localProcedure.procedureId || "") === String(draftId)
      && String(localProcedure.documentCode || "").trim().toUpperCase() === String(result.procedure?.documentCode || "").trim().toUpperCase();
    const localTime = Date.parse(localProcedure?.updatedAt || "");
    const serverTime = Date.parse(result.procedure?.updatedAt || "");
    if (localMatchesDraft && Number.isFinite(localTime) && Number.isFinite(serverTime) && localTime > serverTime) {
      button.textContent = "Recuperando...";
      const restored = await apiPost("/api/procedures/restore", { draftProcedureId: draftId, procedure: localProcedure });
      closeDraftSelection();
      openProcedure(restored.procedure);
      return;
    }
    closeDraftSelection();
    openProcedure(result.procedure);
  } catch (error) {
    if (itemError) itemError.textContent = error.message || "Nao foi possivel abrir a versao salva.";
  } finally {
    button.disabled = false;
    button.textContent = "Continuar";
  }
}

async function continueDraftFromFile(file, draftId, fileInput) {
  try {
    await continueDraftWithProcedure(JSON.parse(await file.text()), draftId, fileInput);
  } catch (error) {
    const itemError = fileInput.closest(".draft-selection-item")?.querySelector("[data-draft-error]");
    if (itemError) itemError.textContent = error.message || "Não foi possível ler este arquivo.";
    fileInput.value = "";
  }
}

draftSelection?.addEventListener("change", (event) => {
  const fileInput = event.target?.closest?.("[data-draft-file]");
  if (!fileInput) return;
  const file = fileInput.files?.[0];
  if (file) continueDraftFromFile(file, fileInput.dataset.draftFile, fileInput);
});

jsonInput?.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  openProtectedAccess("procedimentos.html", async () => {
    try {
      const data = JSON.parse(await file.text());
      const imported = await apiPost("/api/procedures/import", { procedure: data });
      openProcedure(imported.procedure);
    } catch (error) {
      importError.textContent = error.message || "Não foi possível importar este arquivo.";
      event.target.value = "";
    }
  });
});

creatorLogout?.addEventListener("click", () => {
  sessionStorage.removeItem(qualityTokenKey);
  sessionStorage.removeItem(userRoleKey);
  sessionStorage.removeItem(configurationEntryTokenKey);
  sessionStorage.removeItem(masterEntryTokenKey);
  sessionStorage.removeItem(procedureEntryTokenKey);
  updateHomeAccess();
  openProtectedAccess(null);
});

validateStoredSession().finally(finishBoot);

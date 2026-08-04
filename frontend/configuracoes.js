const qualityTokenKey = "procedure-quality-token";
const configurationEntryTokenKey = "configuration-entry-token";
const enteredFromHome = sessionStorage.getItem(configurationEntryTokenKey) === "1";
sessionStorage.removeItem(configurationEntryTokenKey);
let qualityToken = enteredFromHome ? sessionStorage.getItem(qualityTokenKey) || "" : "";
if (!enteredFromHome) sessionStorage.removeItem(qualityTokenKey);
let configuration = null;

const auth = document.querySelector("#configurationAuth");
const authForm = document.querySelector("#configurationAuthForm");
const password = document.querySelector("#configurationPassword");
const authError = document.querySelector("#configurationAuthError");
const errorMessage = document.querySelector("#configurationError");
const statusMessage = document.querySelector("#configurationStatus");
const configurationPage = document.querySelector(".configuration-page");
const coverPreview = document.querySelector("#coverPreview");
const coverEmpty = document.querySelector("#coverEmpty");
const coverOverlay = document.querySelector("#coverOverlay");
const coverImageInput = document.querySelector("#coverImageInput");
const secureFolderName = document.querySelector("#secureFolderName");
const secureFolderStatus = document.querySelector("#secureFolderStatus");
const selectSecureFolderButton = document.querySelector("#selectSecureFolder");
const testSecureFolderButton = document.querySelector("#testSecureFolder");
const forgetSecureFolderButton = document.querySelector("#forgetSecureFolder");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

function showAuth() {
  configurationPage.classList.add("is-locked");
  auth.classList.remove("is-hidden");
  password.focus();
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(qualityToken ? { Authorization: `Bearer ${qualityToken}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    qualityToken = "";
    sessionStorage.removeItem(qualityTokenKey);
    showAuth();
  }
  if (!response.ok) throw new Error(data.error || "Erro ao comunicar com o servidor.");
  return data;
}

function rowTemplate(item, kind) {
  if (kind === "quality") {
    return `<div class="configuration-row configuration-row-quality" data-kind="quality">
      <input type="hidden" data-config-key value="${escapeHtml(item.key)}">
      <span class="configuration-field-label">${escapeHtml(item.label)}</span>
      <label class="configuration-active"><input type="checkbox" data-config-active aria-label="Usar ${escapeHtml(item.label)}" ${item.active !== false ? "checked" : ""}><span>Usar no documento</span></label>
    </div>`;
  }
  if (kind === "nonconformity-origin") {
    return `<div class="configuration-row configuration-row-origin" data-kind="${kind}">
      <input type="hidden" data-config-key value="${escapeHtml(item.key)}">
      <label><span>Origem</span><input type="text" data-config-label value="${escapeHtml(item.label)}" maxlength="120"></label>
      <label class="configuration-active"><input type="checkbox" data-config-active aria-label="Usar ${escapeHtml(item.label)}" ${item.active !== false ? "checked" : ""}><span>Usar no módulo</span></label>
      <button type="button" class="configuration-remove-button" data-config-remove-kind="${kind}" data-config-remove-key="${escapeHtml(item.key)}" aria-label="Excluir ${escapeHtml(item.label)}" title="Excluir">&times;</button>
    </div>`;
  }
  return `<div class="configuration-row" data-kind="${kind}">
    <input type="hidden" data-config-key value="${escapeHtml(item.key)}">
    <label><span>Nome</span><input type="text" data-config-label value="${escapeHtml(item.label)}" maxlength="120"></label>
    <label><span>Sigla</span><input type="text" data-config-prefix value="${escapeHtml(item.prefix || "")}" maxlength="8"></label>
    <label class="configuration-active"><input type="checkbox" data-config-active aria-label="Usar ${escapeHtml(item.label)}" ${item.active !== false ? "checked" : ""}><span>Usar na criação</span></label>
    <button type="button" class="configuration-remove-button" data-config-remove-kind="${kind}" data-config-remove-key="${escapeHtml(item.key)}" aria-label="Excluir ${escapeHtml(item.label)}" title="Excluir">&times;</button>
  </div>`;
}

function render() {
  document.querySelector("#documentTypesList").innerHTML = configuration.documentTypes.map((item) => rowTemplate(item, "document")).join("");
  document.querySelector("#sectorsList").innerHTML = configuration.sectors.map((item) => rowTemplate(item, "sector")).join("");
  document.querySelector("#qualityFieldsList").innerHTML = configuration.qualityFields.map((item) => rowTemplate(item, "quality")).join("");
  document.querySelector("#nonconformityOriginsList").innerHTML = configuration.nonconformity.origins.map((item) => rowTemplate(item, "nonconformity-origin")).join("");
  document.querySelector("#nonconformitySectionsList").innerHTML = configuration.nonconformity.sections.map((item) => rowTemplate(item, "quality")).join("");
  document.querySelector("#nonconformityMaxEvidenceImages").value = configuration.nonconformity.maxEvidenceImages;
  updateCoverPreview();
}

function updateCoverPreview() {
  const cover = configuration?.cover || {};
  const image = cover.imageData || "";
  coverPreview.style.backgroundImage = image ? `url("${image}")` : "none";
  coverEmpty.hidden = Boolean(image);
  const position = cover.overlayPosition || "center";
  coverOverlay.dataset.position = position;
  if (position === "custom") {
    coverOverlay.style.left = `${Number(cover.overlayX ?? 0.5) * 100}%`;
    coverOverlay.style.top = `${Number(cover.overlayY ?? 0.5) * 100}%`;
    coverOverlay.style.transform = "translate(-50%, -50%)";
  } else {
    coverOverlay.style.left = "";
    coverOverlay.style.top = "";
    coverOverlay.style.transform = "";
  }
  document.querySelectorAll("[data-cover-position]").forEach((button) => {
    button.classList.toggle("is-selected", button.dataset.coverPosition === position);
  });
}

function resizeCoverImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const targetWidth = 1240;
      const targetHeight = 1754;
      const scale = Math.max(targetWidth / image.naturalWidth, targetHeight / image.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const width = Math.round(image.naturalWidth * scale);
      const height = Math.round(image.naturalHeight * scale);
      canvas.getContext("2d").drawImage(image, Math.round((targetWidth - width) / 2), Math.round((targetHeight - height) / 2), width, height);
      URL.revokeObjectURL(image.src);
      resolve(canvas.toDataURL("image/webp", 0.84));
    };
    image.onerror = () => reject(new Error("Não foi possível abrir essa imagem."));
    image.src = URL.createObjectURL(file);
  });
}

function collectRows(selector, kind) {
  return [...document.querySelectorAll(`${selector} .configuration-row`)].map((row) => ({
    key: row.querySelector("[data-config-key]").value,
    label: kind === "quality" ? row.querySelector(".configuration-field-label").textContent : row.querySelector("[data-config-label]").value,
    ...(kind === "quality" || kind === "nonconformity-origin" ? {} : { prefix: row.querySelector("[data-config-prefix]").value }),
    active: row.querySelector("[data-config-active]").checked,
  }));
}

function collectConfiguration() {
  return {
    documentTypes: collectRows("#documentTypesList", "document"),
    sectors: collectRows("#sectorsList", "sector"),
    qualityFields: collectRows("#qualityFieldsList", "quality"),
    cover: { ...configuration.cover },
    nonconformity: {
      origins: collectRows("#nonconformityOriginsList", "nonconformity-origin"),
      sections: collectRows("#nonconformitySectionsList", "quality"),
      maxEvidenceImages: Number(document.querySelector("#nonconformityMaxEvidenceImages").value),
    },
  };
}

function addRow(collection, kind, label, prefix) {
  collection.push({ key: `novo-${kind}-${Date.now()}`, label, prefix, active: true });
  render();
  const listId = kind === "document" ? "documentTypes" : kind === "sector" ? "sectors" : "nonconformityOrigins";
  const rows = document.querySelectorAll(`#${listId}List .configuration-row`);
  rows[rows.length - 1]?.querySelector("[data-config-label]").focus();
}

function showConfigurationConfirm(item, kind) {
  const backdrop = document.createElement("div");
  backdrop.className = "configuration-confirm-backdrop";
  backdrop.innerHTML = `
    <div class="configuration-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="configurationConfirmTitle">
      <div class="configuration-confirm-icon">!</div>
      <div>
        <h2 id="configurationConfirmTitle">Excluir ${kind === "document" ? "tipo de documento" : kind === "sector" ? "setor" : "origem"}?</h2>
        <p>Essa opção será removida das configurações de novos documentos.</p>
        <strong>${escapeHtml(item.label)}</strong>
      </div>
      <div class="configuration-confirm-actions">
        <button type="button" class="secondary-button" data-config-confirm-cancel>Cancelar</button>
        <button type="button" class="danger-button" data-config-confirm-ok>Excluir</button>
      </div>
    </div>
  `;
  document.body.append(backdrop);
  return new Promise((resolve) => {
    const finish = (result) => {
      backdrop.remove();
      resolve(result);
    };
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) finish(false);
    });
    backdrop.querySelector("[data-config-confirm-cancel]").addEventListener("click", () => finish(false));
    backdrop.querySelector("[data-config-confirm-ok]").addEventListener("click", () => finish(true));
    backdrop.querySelector("[data-config-confirm-ok]").focus();
  });
}

async function removeConfigurationEntry(kind, key) {
  const collectionName = kind === "document" ? "documentTypes" : kind === "sector" ? "sectors" : "nonconformity.origins";
  const collection = collectionName.includes(".") ? configuration.nonconformity.origins : configuration[collectionName];
  if (collection.length <= 1) {
    errorMessage.textContent = `Mantenha pelo menos um ${kind === "document" ? "tipo de documento" : kind === "sector" ? "setor" : "origem"}.`;
    return;
  }
  const item = collection.find((entry) => entry.key === key);
  if (!item || !await showConfigurationConfirm(item, kind)) return;
  if (collectionName.includes(".")) configuration.nonconformity.origins = collection.filter((entry) => entry.key !== key);
  else configuration[collectionName] = collection.filter((entry) => entry.key !== key);
  errorMessage.textContent = "";
  statusMessage.textContent = "Alteração pronta para salvar.";
  render();
}

async function loadConfiguration() {
  const data = await request("/api/configuration");
  configuration = data.configuration;
  configuration.cover ||= { imageData: "", overlayPosition: "center", overlayX: 0.5, overlayY: 0.5 };
  configuration.nonconformity ||= {
    origins: ["Auditoria interna", "Cliente", "Fornecedor", "Processo", "Produto", "Documento", "Outro"].map((label) => ({ key: label.toLowerCase().replaceAll(" ", "-"), label, active: true })),
    sections: ["Identifica\u00e7\u00e3o", "Descri\u00e7\u00e3o e evid\u00eancias", "Corre\u00e7\u00e3o e conten\u00e7\u00e3o", "An\u00e1lise de causa", "Plano de a\u00e7\u00e3o corretiva", "Verifica\u00e7\u00e3o de efic\u00e1cia", "Encerramento e contexto"].map((label, index) => ({ key: ["identification", "description", "containment", "cause", "actions", "effectiveness", "closure"][index], label, active: true })),
    maxEvidenceImages: 10,
  };
  render();
}

function renderUsers(users) {
  const list = document.querySelector("#configurationUserList");
  list.innerHTML = users.length ? users.map((user) => `
    <div class="configuration-user-row">
      <div><strong>${escapeHtml(user.displayName)}</strong><small>${escapeHtml(user.username)} &middot; ${user.role === "manager" ? "Gestor" : "Editor"}</small></div>
      <button type="button" class="secondary-button" data-user-toggle="${user.userId}" data-user-active="${user.active}">${user.active ? "Desativar" : "Ativar"}</button>
    </div>
  `).join("") : `<p class="configuration-cover-note">Nenhum editor cadastrado.</p>`;
}

async function loadUsers() {
  const data = await request("/api/admin/users");
  renderUsers(data.users || []);
}

function renderSecureFolderStatus(status) {
  const supported = status?.supported !== false;
  const configured = Boolean(status?.configured);
  selectSecureFolderButton.disabled = !supported;
  testSecureFolderButton.disabled = false;
  forgetSecureFolderButton.disabled = !supported || !configured;
  if (!supported) {
    secureFolderName.textContent = "Navegador sem suporte";
    secureFolderStatus.textContent = "Use Chrome ou Edge desktop para salvar JSON diretamente em uma pasta local controlada.";
    return;
  }
  if (!configured) {
    secureFolderName.textContent = "Nenhuma pasta configurada";
    secureFolderStatus.textContent = "Selecione uma pasta corporativa para os JSON em processo.";
    return;
  }
  secureFolderName.textContent = status.name || "Pasta selecionada";
  secureFolderStatus.textContent = status.permission === "granted"
    ? "Pasta pronta para salvar e localizar JSON em processo."
    : "Pasta configurada; o navegador pedira permissao no proximo acesso.";
}

async function refreshSecureFolderStatus() {
  if (!window.secureProcedureFolder) return;
  renderSecureFolderStatus(await window.secureProcedureFolder.getStatus());
}

async function downloadBackup() {
  const response = await fetch("/api/admin/backup", { headers: { Authorization: `Bearer ${qualityToken}` } });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || "N\\u00e3o foi poss\\u00edvel criar o backup.");
  const blob = await response.blob();
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `controle-sgq-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function showRestoreConfirmation() {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "configuration-confirm-backdrop";
    backdrop.innerHTML = `
      <div class="configuration-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="restoreConfirmTitle">
        <div class="configuration-confirm-icon">!</div>
        <div><h2 id="restoreConfirmTitle">Restaurar backup?</h2><p>Os dados atuais ser\\u00e3o substitu\\u00eddos pelo conte\\u00fado do arquivo selecionado.</p></div>
        <div class="configuration-confirm-actions"><button type="button" class="secondary-button" data-restore-cancel>Cancelar</button><button type="button" class="danger-button" data-restore-ok>Restaurar</button></div>
      </div>`;
    document.body.append(backdrop);
    const finish = (result) => { backdrop.remove(); resolve(result); };
    backdrop.addEventListener("click", (event) => { if (event.target === backdrop) finish(false); });
    backdrop.querySelector("[data-restore-cancel]").addEventListener("click", () => finish(false));
    backdrop.querySelector("[data-restore-ok]").addEventListener("click", () => finish(true));
    backdrop.querySelector("[data-restore-cancel]").focus();
  });
}

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  authError.textContent = "";
  try {
    const data = await request("/api/procedures/auth/quality", { method: "POST", body: JSON.stringify({ password: password.value }) });
    qualityToken = data.token;
    sessionStorage.setItem(qualityTokenKey, qualityToken);
    auth.classList.add("is-hidden");
    password.value = "";
    await loadConfiguration();
    await loadUsers();
    await refreshSecureFolderStatus();
    configurationPage.classList.remove("is-locked");
  } catch (requestError) {
    auth.classList.remove("is-hidden");
    authError.textContent = requestError.message;
  }
});

document.querySelector("#addDocumentType").addEventListener("click", () => addRow(configuration.documentTypes, "document", "Novo tipo", "NOVO"));
document.querySelector("#addSector").addEventListener("click", () => addRow(configuration.sectors, "sector", "Novo setor", "NV"));
document.querySelector("#addNonconformityOrigin").addEventListener("click", () => addRow(configuration.nonconformity.origins, "nonconformity-origin", "Nova origem", ""));
document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-config-remove-kind]");
  if (button) removeConfigurationEntry(button.dataset.configRemoveKind, button.dataset.configRemoveKey);
});
coverImageInput.addEventListener("change", async () => {
  if (!coverImageInput.files?.[0]) return;
  try {
    configuration.cover.imageData = await resizeCoverImage(coverImageInput.files[0]);
    updateCoverPreview();
    statusMessage.textContent = "Imagem pronta para salvar.";
  } catch (requestError) {
    errorMessage.textContent = requestError.message;
    coverImageInput.value = "";
  }
});
document.querySelector("#clearCoverImage").addEventListener("click", () => {
  configuration.cover.imageData = "";
  coverImageInput.value = "";
  updateCoverPreview();
});
document.querySelectorAll("[data-cover-position]").forEach((button) => button.addEventListener("click", () => {
  configuration.cover.overlayPosition = button.dataset.coverPosition;
  configuration.cover.overlayX = 0.5;
  configuration.cover.overlayY = 0.5;
  updateCoverPreview();
}));

coverOverlay.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  coverOverlay.setPointerCapture(event.pointerId);
  coverOverlay.classList.add("is-dragging");
});
coverOverlay.addEventListener("pointermove", (event) => {
  if (!coverOverlay.hasPointerCapture(event.pointerId)) return;
  const bounds = coverPreview.getBoundingClientRect();
  configuration.cover.overlayPosition = "custom";
  configuration.cover.overlayX = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
  configuration.cover.overlayY = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
  updateCoverPreview();
});
coverOverlay.addEventListener("pointerup", (event) => {
  if (coverOverlay.hasPointerCapture(event.pointerId)) coverOverlay.releasePointerCapture(event.pointerId);
  coverOverlay.classList.remove("is-dragging");
});
document.querySelector("#saveConfiguration").addEventListener("click", async () => {
  errorMessage.textContent = "";
  statusMessage.textContent = "Salvando...";
  try {
    const data = await request("/api/configuration", { method: "PUT", body: JSON.stringify({ configuration: collectConfiguration() }) });
    configuration = data.configuration;
    window.location.assign("index.html");
  } catch (requestError) {
    statusMessage.textContent = "";
    errorMessage.textContent = requestError.message;
  }
});

document.querySelector("#configurationUserForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  errorMessage.textContent = "";
  try {
    await request("/api/admin/users", {
      method: "POST",
      body: JSON.stringify({
        username: document.querySelector("#newUserName").value,
        displayName: document.querySelector("#newUserDisplayName").value,
        password: document.querySelector("#newUserPassword").value,
        role: document.querySelector("#newUserRole").value,
      }),
    });
    event.target.reset();
    statusMessage.textContent = "Editor cadastrado.";
    await loadUsers();
  } catch (requestError) {
    errorMessage.textContent = requestError.message;
  }
});

document.querySelector("#configurationUserList").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-user-toggle]");
  if (!button) return;
  try {
    await request(`/api/admin/users/${encodeURIComponent(button.dataset.userToggle)}`, {
      method: "PATCH",
      body: JSON.stringify({ active: button.dataset.userActive !== "true" }),
    });
    await loadUsers();
  } catch (requestError) {
    errorMessage.textContent = requestError.message;
  }
});

document.querySelector("#downloadDatabaseBackup").addEventListener("click", async () => {
  try {
    statusMessage.textContent = "Criando backup...";
    await downloadBackup();
    statusMessage.textContent = "Backup baixado.";
  } catch (requestError) {
    errorMessage.textContent = requestError.message;
  }
});

document.querySelector("#restoreDatabaseBackup").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  if (!await showRestoreConfirmation()) return;
  try {
    statusMessage.textContent = "Restaurando...";
    const backup = JSON.parse(await file.text());
    await request("/api/admin/restore", { method: "POST", body: JSON.stringify({ backup }) });
    statusMessage.textContent = "Backup restaurado. Recarregue a tela para atualizar os dados.";
    await loadConfiguration();
    await loadUsers();
  } catch (requestError) {
    errorMessage.textContent = requestError.message;
  }
});

selectSecureFolderButton?.addEventListener("click", async () => {
  errorMessage.textContent = "";
  statusMessage.textContent = "Selecionando pasta...";
  try {
    renderSecureFolderStatus(await window.secureProcedureFolder.selectFolder());
    statusMessage.textContent = "Pasta dos JSON em processo configurada.";
  } catch (requestError) {
    statusMessage.textContent = "";
    errorMessage.textContent = requestError.message;
  }
});

testSecureFolderButton?.addEventListener("click", async () => {
  errorMessage.textContent = "";
  statusMessage.textContent = "Testando acesso...";
  try {
    if (!window.secureProcedureFolder?.isSupported()) throw new Error("Este navegador nao permite testar uma pasta fixa. Use Chrome ou Edge desktop.");
    const status = await window.secureProcedureFolder.getStatus();
    if (!status.configured) throw new Error("Selecione uma pasta antes de testar o acesso.");
    renderSecureFolderStatus(await window.secureProcedureFolder.testAccess());
    statusMessage.textContent = "Acesso a pasta confirmado.";
  } catch (requestError) {
    statusMessage.textContent = "";
    errorMessage.textContent = requestError.message;
  }
});

forgetSecureFolderButton?.addEventListener("click", async () => {
  errorMessage.textContent = "";
  try {
    renderSecureFolderStatus(await window.secureProcedureFolder.forgetFolder());
    statusMessage.textContent = "Pasta removida deste navegador.";
  } catch (requestError) {
    errorMessage.textContent = requestError.message;
  }
});

async function bootConfiguration() {
  if (!qualityToken) {
    showAuth();
    return;
  }
  try {
    auth.classList.add("is-hidden");
    await loadConfiguration();
    await loadUsers();
    await refreshSecureFolderStatus();
    configurationPage.classList.remove("is-locked");
  } catch (requestError) {
    qualityToken = "";
    sessionStorage.removeItem(qualityTokenKey);
    authError.textContent = requestError.message;
    showAuth();
  }
}

bootConfiguration();

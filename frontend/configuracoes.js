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
    ...(kind === "quality" ? {} : { prefix: row.querySelector("[data-config-prefix]").value }),
    active: row.querySelector("[data-config-active]").checked,
  }));
}

function collectConfiguration() {
  return {
    documentTypes: collectRows("#documentTypesList", "document"),
    sectors: collectRows("#sectorsList", "sector"),
    qualityFields: collectRows("#qualityFieldsList", "quality"),
    cover: { ...configuration.cover },
  };
}

function addRow(collection, kind, label, prefix) {
  collection.push({ key: `novo-${kind}-${Date.now()}`, label, prefix, active: true });
  render();
  const rows = document.querySelectorAll(`#${kind === "document" ? "documentTypes" : "sectors"}List .configuration-row`);
  rows[rows.length - 1]?.querySelector("[data-config-label]").focus();
}

function showConfigurationConfirm(item, kind) {
  const backdrop = document.createElement("div");
  backdrop.className = "configuration-confirm-backdrop";
  backdrop.innerHTML = `
    <div class="configuration-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="configurationConfirmTitle">
      <div class="configuration-confirm-icon">!</div>
      <div>
        <h2 id="configurationConfirmTitle">Excluir ${kind === "document" ? "tipo de documento" : "setor"}?</h2>
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
  const collectionName = kind === "document" ? "documentTypes" : "sectors";
  const collection = configuration[collectionName];
  if (collection.length <= 1) {
    errorMessage.textContent = `Mantenha pelo menos um ${kind === "document" ? "tipo de documento" : "setor"}.`;
    return;
  }
  const item = collection.find((entry) => entry.key === key);
  if (!item || !await showConfigurationConfirm(item, kind)) return;
  configuration[collectionName] = collection.filter((entry) => entry.key !== key);
  errorMessage.textContent = "";
  statusMessage.textContent = "Alteração pronta para salvar.";
  render();
}

async function loadConfiguration() {
  const data = await request("/api/configuration");
  configuration = data.configuration;
  configuration.cover ||= { imageData: "", overlayPosition: "center", overlayX: 0.5, overlayY: 0.5 };
  render();
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
    configurationPage.classList.remove("is-locked");
  } catch (requestError) {
    auth.classList.remove("is-hidden");
    authError.textContent = requestError.message;
  }
});

document.querySelector("#addDocumentType").addEventListener("click", () => addRow(configuration.documentTypes, "document", "Novo tipo", "NOVO"));
document.querySelector("#addSector").addEventListener("click", () => addRow(configuration.sectors, "sector", "Novo setor", "NV"));
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

async function bootConfiguration() {
  if (!qualityToken) {
    showAuth();
    return;
  }
  try {
    auth.classList.add("is-hidden");
    await loadConfiguration();
    configurationPage.classList.remove("is-locked");
  } catch (requestError) {
    qualityToken = "";
    sessionStorage.removeItem(qualityTokenKey);
    authError.textContent = requestError.message;
    showAuth();
  }
}

bootConfiguration();

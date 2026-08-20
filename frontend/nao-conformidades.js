const app = document.querySelector("#nonconformityApp");
const listPanel = document.querySelector("#ncListPanel");
const editorPanel = document.querySelector("#ncEditorPanel");
const list = document.querySelector("#ncList");
const count = document.querySelector("#ncCount");
const form = document.querySelector("#ncForm");
const formError = document.querySelector("#ncFormError");
const search = document.querySelector("#ncSearch");
const statusFilter = document.querySelector("#ncStatusFilter");
const editorTitle = document.querySelector("#ncEditorTitle");
const saveStatus = document.querySelector("#ncSaveStatus");
const previewNcPdfButton = document.querySelector("#previewNcPdf");
const downloadNcPdfButton = document.querySelector("#downloadNcPdf");
const actionsList = document.querySelector("#ncActionsList");
const evidenceImageInput = document.querySelector("#ncEvidenceImageInput");
const evidenceFileName = document.querySelector("#ncEvidenceFileName");
const evidencePreview = document.querySelector("#ncEvidencePreview");
const removeEvidenceImage = document.querySelector("#removeNcEvidenceImage");
const unsavedDialog = document.querySelector("#ncUnsavedDialog");
const keepEditingButton = document.querySelector("#keepNcEditing");
const discardChangesButton = document.querySelector("#discardNcChanges");
const tokenKey = "procedure-quality-token";
const userRoleKey = "procedure-user-role";
let records = [];
let current = null;
let evidenceImages = [];
let isDirty = false;
let ncConfiguration = {
  origins: ["Auditoria interna", "Cliente", "Fornecedor", "Processo", "Produto", "Documento", "Outro"].map((label) => ({ label, active: true })),
  sections: ["identification", "description", "containment", "cause", "actions", "effectiveness", "closure"].map((key) => ({ key, active: true })),
  maxEvidenceImages: 10,
};

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

async function request(path, options = {}) {
  const token = sessionStorage.getItem(tokenKey) || "";
  const response = await fetch(`/api/nonconformities${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(window.SharedModuleLock?.headers?.() || {}), ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(data.error || "Não foi possível concluir a operação."); error.status = response.status; throw error; }
  return data;
}

function showList() {
  window.SharedModuleLock?.release?.();
  listPanel.classList.remove("is-hidden");
  editorPanel.classList.add("is-hidden");
  window.history.replaceState({}, "", "nao-conformidades.html");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showEditor() {
  listPanel.classList.add("is-hidden");
  editorPanel.classList.remove("is-hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setEditorUrl(mode, id = "") {
  const query = id ? `?modo=${mode}&id=${encodeURIComponent(id)}` : `?modo=${mode}`;
  window.history.replaceState({}, "", `nao-conformidades.html${query}`);
}

function statusClass(value) {
  return `nc-status nc-status-${String(value || "aberta").toLowerCase().replaceAll(" ", "-").replaceAll("ê", "e")}`;
}

function renderList() {
  const term = search.value.trim().toLowerCase();
  const selectedStatus = statusFilter.value;
  const filtered = records.filter((item) => {
    const haystack = [item.documentCode, item.title, item.sector, item.origin].join(" ").toLowerCase();
    return (!term || haystack.includes(term)) && (!selectedStatus || item.status === selectedStatus);
  });
  count.textContent = `${filtered.length} ${filtered.length === 1 ? "registro" : "registros"}`;
  if (!filtered.length) { list.innerHTML = '<div class="nc-empty"><strong>Nenhuma não conformidade encontrada.</strong><span>Crie um novo registro para iniciar o acompanhamento.</span></div>'; return; }
  list.innerHTML = filtered.map((item) => `
    <article class="nc-list-row">
      <div class="nc-list-code">${escapeHtml(item.documentCode || "Código")}</div>
      <div class="nc-list-main"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.origin || "Origem não informada")} · ${escapeHtml(item.sector || "Setor não informado")} · Responsável: ${escapeHtml(item.responsible || "Não informado")}</p></div>
      <span class="${statusClass(item.status)}">${escapeHtml(item.status)}</span>
      <div class="nc-list-actions">
        <button type="button" class="secondary-button" data-nc-pdf-preview="${escapeHtml(item.nonconformityId)}">Visualizar PDF</button>
        <button type="button" class="secondary-button" data-nc-pdf-download="${escapeHtml(item.nonconformityId)}">Baixar PDF</button>
        <button type="button" class="secondary-button nc-open-button" data-open-nc="${escapeHtml(item.nonconformityId)}">Abrir</button>
      </div>
    </article>
  `).join("");
}

function setField(name, value) {
  const field = form.querySelector(`[data-field="${name}"]`);
  if (!field) return;
  if (field.type === "checkbox") field.checked = value === true;
  else field.value = value ?? "";
}

function applyNonconformityConfiguration() {
  const originField = form.querySelector('[data-field="origin"]');
  const activeOrigins = (ncConfiguration.origins || []).filter((item) => item.active !== false);
  originField.innerHTML = activeOrigins.map((item) => `<option>${escapeHtml(item.label)}</option>`).join("");
  document.querySelectorAll("[data-nc-section]").forEach((section) => {
    const setting = (ncConfiguration.sections || []).find((item) => item.key === section.dataset.ncSection);
    const isActive = setting ? setting.active !== false : true;
    section.hidden = !isActive;
    section.querySelectorAll("[required]").forEach((field) => { field.required = isActive; });
  });
  document.querySelectorAll("[data-nc-nav]").forEach((link) => {
    const setting = (ncConfiguration.sections || []).find((item) => item.key === link.dataset.ncNav);
    link.hidden = setting ? setting.active === false : false;
  });
  const limit = ncConfiguration.maxEvidenceImages || 10;
  document.querySelector(".nc-evidence-hint").textContent = `PNG, JPG ou WEBP \u00b7 at\u00e9 ${limit} imagem(ns). Para cada imagem, informe o nome e o que ela comprova.`;
}

function normalizeEvidenceImages(images = []) {
  return (Array.isArray(images) ? images : []).filter(Boolean).slice(0, ncConfiguration.maxEvidenceImages || 10).map((entry, index) => {
    if (typeof entry === "string") return { image: entry, label: `Evidência ${index + 1}`, description: "" };
    return { image: entry.image || entry.data || "", label: entry.label || `Evidência ${index + 1}`, description: entry.description || "" };
  }).filter((entry) => entry.image);
}

function renderEvidenceImages(images = []) {
  evidenceImages = normalizeEvidenceImages(images);
  evidencePreview.innerHTML = evidenceImages.map((entry, index) => `<article class="nc-evidence-item">
    <div class="nc-evidence-thumb"><img src="${escapeHtml(entry.image)}" alt="${escapeHtml(entry.label || `Evidência ${index + 1}`)}"><button type="button" class="nc-evidence-thumb-remove" data-remove-evidence="${index}" aria-label="Remover evidência ${index + 1}">×</button></div>
    <div class="nc-evidence-details">
      <label><span>Nome da evidência</span><input data-evidence-field="label" data-evidence-index="${index}" value="${escapeHtml(entry.label)}" placeholder="Evidência ${index + 1}"></label>
      <label><span>Descrição da evidência</span><textarea data-evidence-field="description" data-evidence-index="${index}" placeholder="Descreva o que a imagem comprova.">${escapeHtml(entry.description)}</textarea></label>
    </div>
  </article>`).join("");
  evidenceFileName.textContent = evidenceImages.length ? `${evidenceImages.length} imagem(ns) no registro` : "Nenhuma imagem selecionada";
  removeEvidenceImage.hidden = !evidenceImages.length;
}

function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const image = new Image();
      image.onerror = reject;
      image.onload = () => {
        const scale = Math.min(1, 1400 / image.width, 1400 / image.height);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png"));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function renderActions(actions = []) {
  const rows = actions.length ? actions : [{ actionId: "acao-1", description: "", responsible: "", dueDate: "", status: "Pendente", evidence: "" }];
  actionsList.innerHTML = rows.map((action, index) => `
    <div class="nc-action-row" data-action-id="${escapeHtml(action.actionId || `acao-${index + 1}`)}">
      <div class="nc-action-number">${index + 1}</div>
      <label class="nc-action-description"><span>Ação corretiva</span><textarea data-action-field="description" placeholder="Ação corretiva a executar">${escapeHtml(action.description)}</textarea></label>
      <label><span>Responsável</span><input data-action-field="responsible" value="${escapeHtml(action.responsible)}" placeholder="Nome"></label>
      <label><span>Prazo</span><input type="date" data-action-field="dueDate" value="${escapeHtml(action.dueDate)}"></label>
      <label><span>Status</span><select data-action-field="status"><option ${action.status === "Pendente" ? "selected" : ""}>Pendente</option><option ${action.status === "Em andamento" ? "selected" : ""}>Em andamento</option><option ${action.status === "Concluída" ? "selected" : ""}>Concluída</option></select></label>
      <label class="nc-action-evidence"><span>Evidência</span><textarea data-action-field="evidence" placeholder="Como foi concluída">${escapeHtml(action.evidence)}</textarea></label>
      <button type="button" class="icon-danger-button" data-remove-action aria-label="Remover ação">×</button>
    </div>
  `).join("");
}

function renderEditor(data) {
  current = data;
  isDirty = false;
  editorTitle.textContent = data.nonconformityId ? `Editar ${data.documentCode}` : "Nova não conformidade";
  formError.textContent = "";
  saveStatus.textContent = "";
  ["documentCode", "issueDate", "origin", "status", "title", "sector", "reporter", "responsible", "affectedItem", "description", "evidence", "containment", "containmentResponsible", "containmentDate", "causeMethod", "causeAnalysis", "rootCause", "effectivenessDate", "effectivenessVerifier", "effectivenessResult", "closureApprover", "closureDate", "closureNotes"].forEach((field) => setField(field, data[field]));
  setField("effective", data.effective === null ? "" : String(data.effective));
  renderEvidenceImages(data.evidenceImages || (data.evidenceImage ? [data.evidenceImage] : []));
  renderActions(data.actions);
  [previewNcPdfButton, downloadNcPdfButton].forEach((button) => { button.disabled = !data.nonconformityId; });
  showEditor();
}

function collectData() {
  const data = {};
  form.querySelectorAll("[data-field]").forEach((field) => {
    if (field.type === "checkbox") data[field.dataset.field] = field.checked;
    else data[field.dataset.field] = field.value;
  });
  data.effective = data.effective === "" ? null : data.effective === "true";
  evidencePreview.querySelectorAll("[data-evidence-field]").forEach((field) => {
    const entry = evidenceImages[Number(field.dataset.evidenceIndex)];
    if (entry) entry[field.dataset.evidenceField] = field.value;
  });
  data.evidenceImages = evidenceImages;
  data.actions = [...actionsList.querySelectorAll(".nc-action-row")].map((row) => {
    const value = { actionId: row.dataset.actionId };
    row.querySelectorAll("[data-action-field]").forEach((field) => { value[field.dataset.actionField] = field.value; });
    return value;
  });
  if (current?.nonconformityId) data.nonconformityId = current.nonconformityId;
  return data;
}

async function loadRecords() {
  const data = await request("/");
  records = data.nonconformities || [];
  renderList();
}

async function loadNonconformityConfiguration() {
  const data = await request("/configuration");
  if (data.configuration) ncConfiguration = { ...ncConfiguration, ...data.configuration };
  applyNonconformityConfiguration();
}

async function openNew() {
  try {
    await window.SharedModuleLock?.release?.();
    renderEditor((await request("/new")).nonconformity);
    setEditorUrl("novo");
  } catch (error) { formError.textContent = error.message; }
}

async function openExisting(id) {
  try {
    renderEditor((await request(`/${encodeURIComponent(id)}`)).nonconformity);
    await window.SharedModuleLock?.acquire?.("nao-conformidades", id);
    setEditorUrl("editar", id);
  } catch (error) { formError.textContent = error.message; }
}

async function requestPdf(id) {
  const token = sessionStorage.getItem(tokenKey) || "";
  const response = await fetch(`/api/nonconformities/${encodeURIComponent(id)}/pdf`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Não foi possível gerar o PDF.");
  }
  return response.blob();
}

function showPdfPreview(blob) {
  const url = URL.createObjectURL(blob);
  const backdrop = document.createElement("div");
  backdrop.className = "nc-pdf-preview-backdrop";
  backdrop.innerHTML = `<section class="nc-pdf-preview-dialog" role="dialog" aria-modal="true" aria-label="Visualização do PDF">
    <header><strong>Visualização do PDF</strong><button type="button" class="nc-pdf-preview-close" aria-label="Fechar visualização">×</button></header>
    <iframe title="Visualização do documento PDF" src="${url}"></iframe>
  </section>`;
  document.body.appendChild(backdrop);
  let onKey;
  const close = () => { URL.revokeObjectURL(url); backdrop.remove(); if (onKey) document.removeEventListener("keydown", onKey); };
  backdrop.querySelector(".nc-pdf-preview-close").addEventListener("click", close);
  backdrop.addEventListener("click", (event) => { if (event.target === backdrop) close(); });
  onKey = (event) => { if (event.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
}

function showPdfNotice(message) {
  const notice = document.createElement("div");
  notice.className = "nc-pdf-notice";
  notice.setAttribute("role", "alert");
  notice.textContent = message;
  document.body.appendChild(notice);
  window.setTimeout(() => notice.remove(), 4200);
}

async function previewPdf(id, button) {
  const label = button.textContent;
  button.disabled = true;
  button.textContent = "Gerando...";
  try { showPdfPreview(await requestPdf(id)); }
  catch (error) { showPdfNotice(error.message); }
  finally { button.disabled = false; button.textContent = label; }
}

async function downloadPdf(id, button) {
  const label = button.textContent;
  button.disabled = true;
  button.textContent = "Baixando...";
  try {
    const item = records.find((record) => record.nonconformityId === id);
    const url = URL.createObjectURL(await requestPdf(id));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${item?.documentCode || "nao-conformidade"}.pdf`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  } catch (error) { showPdfNotice(error.message); }
  finally { button.disabled = false; button.textContent = label; }
}

previewNcPdfButton.addEventListener("click", () => {
  if (current?.nonconformityId) previewPdf(current.nonconformityId, previewNcPdfButton);
});

downloadNcPdfButton.addEventListener("click", () => {
  if (current?.nonconformityId) downloadPdf(current.nonconformityId, downloadNcPdfButton);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  formError.textContent = "";
  const submit = document.querySelector('button[type="submit"][form="ncForm"]') || form.querySelector('button[type="submit"]');
  if (submit) submit.disabled = true;
  try {
    const data = collectData();
    const path = current?.nonconformityId ? `/${encodeURIComponent(current.nonconformityId)}` : "/";
    const response = await request(path, { method: current?.nonconformityId ? "PUT" : "POST", body: JSON.stringify({ nonconformity: data }) });
    renderEditor(response.nonconformity);
    await window.SharedModuleLock?.acquire?.("nao-conformidades", response.nonconformity.nonconformityId);
    setEditorUrl("editar", response.nonconformity.nonconformityId);
    await loadRecords();
    saveStatus.textContent = "Salvo";
  } catch (error) { formError.textContent = error.message; formError.scrollIntoView({ behavior: "smooth", block: "center" }); } finally { if (submit) submit.disabled = false; }
});

document.querySelector("#newNonconformity").addEventListener("click", openNew);
document.querySelector("#cancelNcEdit").addEventListener("click", requestCloseEditor);
document.querySelector("#backToNcList").addEventListener("click", requestCloseEditor);
document.querySelector("#addNcAction").addEventListener("click", () => {
  const actions = collectData().actions;
  if (actions.length === 1 && !actions[0].description && !actions[0].responsible) actions.length = 0;
  actions.push({ actionId: `acao-${Date.now()}`, status: "Pendente" });
  renderActions(actions);
});
actionsList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-action]");
  if (!button) return;
  const rows = [...actionsList.querySelectorAll(".nc-action-row")];
  if (rows.length === 1) { renderActions([]); return; }
  button.closest(".nc-action-row").remove();
  [...actionsList.querySelectorAll(".nc-action-number")].forEach((item, index) => { item.textContent = index + 1; });
});
list.addEventListener("click", (event) => {
  const previewButton = event.target.closest("[data-nc-pdf-preview]");
  if (previewButton) { previewPdf(previewButton.dataset.ncPdfPreview, previewButton); return; }
  const downloadButton = event.target.closest("[data-nc-pdf-download]");
  if (downloadButton) { downloadPdf(downloadButton.dataset.ncPdfDownload, downloadButton); return; }
  const button = event.target.closest("[data-open-nc]");
  if (button) openExisting(button.dataset.openNc);
});
search.addEventListener("input", renderList);
statusFilter.addEventListener("change", renderList);
form.addEventListener("input", () => { isDirty = true; });
form.addEventListener("change", () => { isDirty = true; });
removeEvidenceImage.addEventListener("click", () => {
  evidenceImages = [];
  evidenceImageInput.value = "";
  renderEvidenceImages([]);
  isDirty = true;
});
evidenceImageInput.addEventListener("change", async () => {
  const files = [...(evidenceImageInput.files || [])].slice(0, ncConfiguration.maxEvidenceImages || 10);
  if (!files.length) return;
  try {
    const images = await Promise.all(files.map(resizeImage));
    const additions = images.map((image, index) => ({ image, label: `Evidência ${evidenceImages.length + index + 1}`, description: "" }));
    renderEvidenceImages([...evidenceImages, ...additions]);
    evidenceFileName.textContent = `${evidenceImages.length} imagem(ns) selecionada(s)`;
    isDirty = true;
    formError.textContent = "";
  } catch (error) {
    formError.textContent = "Não foi possível carregar a imagem da evidência.";
    evidenceImageInput.value = "";
  }
});
evidencePreview.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-evidence]");
  if (!button) return;
  evidenceImages.splice(Number(button.dataset.removeEvidence), 1);
  renderEvidenceImages(evidenceImages);
  isDirty = true;
});
evidencePreview.addEventListener("input", (event) => {
  const field = event.target.closest("[data-evidence-field]");
  if (!field) return;
  const entry = evidenceImages[Number(field.dataset.evidenceIndex)];
  if (entry) entry[field.dataset.evidenceField] = field.value;
  isDirty = true;
});

function requestCloseEditor() {
  if (!isDirty) { showList(); return; }
  unsavedDialog.classList.remove("is-hidden");
  keepEditingButton.focus();
}

keepEditingButton.addEventListener("click", () => unsavedDialog.classList.add("is-hidden"));
discardChangesButton.addEventListener("click", () => { isDirty = false; unsavedDialog.classList.add("is-hidden"); showList(); });
window.addEventListener("beforeunload", (event) => {
  if (!isDirty) return;
  event.preventDefault();
  event.returnValue = "";
});

async function boot() {
  if (!sessionStorage.getItem(tokenKey)) { window.location.href = "index.html"; return; }
  try {
    await loadNonconformityConfiguration();
    await request("/");
    app.classList.remove("is-locked");
    await loadRecords();
    const params = new URLSearchParams(window.location.search);
    if (params.get("modo") === "novo") await openNew();
    if (params.get("modo") === "editar" && params.get("id")) await openExisting(params.get("id"));
  } catch (error) {
    if (error.status === 401 || error.status === 403) window.location.href = "index.html";
    else { app.classList.remove("is-locked"); list.innerHTML = `<div class="nc-empty"><strong>Não foi possível carregar o módulo.</strong><span>${escapeHtml(error.message)}</span></div>`; window.AppBoot?.error(error.message, () => boot()); }
  }
}

boot().finally(() => window.AppBoot?.ready());

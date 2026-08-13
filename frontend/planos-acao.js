const app = document.querySelector("#actionPlanApp");
const listPanel = document.querySelector("#actionPlanListPanel");
const editorPanel = document.querySelector("#actionPlanEditor");
const list = document.querySelector("#actionPlanList");
const count = document.querySelector("#actionPlanCount");
const form = document.querySelector("#actionPlanForm");
const formError = document.querySelector("#actionPlanFormError");
const search = document.querySelector("#actionPlanSearch");
const statusFilter = document.querySelector("#actionPlanStatus");
const actionsList = document.querySelector("#actionPlanActionsList");
const editorTitle = document.querySelector("#actionPlanEditorTitle");
const saveStatus = document.querySelector("#actionPlanSaveStatus");
const previewPdfButton = document.querySelector("#previewActionPlanPdf");
const downloadPdfButton = document.querySelector("#downloadActionPlanPdf");
form.querySelectorAll("[required]").forEach((field) => field.closest("label")?.classList.add("module-required"));
const tokenKey = "procedure-quality-token";
const roleKey = "procedure-user-role";
let records = [];
let current = null;
let isDirty = false;

const ACTION_TYPES = ["Correção", "Ação corretiva", "Ação preventiva", "Melhoria"];
const ACTION_STATUSES = ["Não iniciada", "Em andamento", "Aguardando evidência", "Concluída", "Cancelada", "Atrasada"];

function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
function optionList(values, selected) { return values.map((value) => `<option ${value === selected ? "selected" : ""}>${escapeHtml(value)}</option>`).join(""); }
function isManager() { return ["manager", "quality"].includes(sessionStorage.getItem(roleKey)); }

async function request(path, options = {}) {
  const token = sessionStorage.getItem(tokenKey) || "";
  const response = await fetch(`/api/action-plans${path}`, { ...options, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(window.SharedModuleLock?.headers?.() || {}), ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(data.error || "Não foi possível concluir a operação."); error.status = response.status; throw error; }
  return data;
}

function showList() { window.SharedModuleLock?.release?.(); listPanel.classList.remove("is-hidden"); editorPanel.classList.add("is-hidden"); window.history.replaceState({}, "", "planos-acao.html"); window.scrollTo({ top: 0, behavior: "smooth" }); }
function showEditor() { listPanel.classList.add("is-hidden"); editorPanel.classList.remove("is-hidden"); window.scrollTo({ top: 0, behavior: "smooth" }); }
function setUrl(mode, id = "") { window.history.replaceState({}, "", `planos-acao.html?modo=${mode}${id ? `&id=${encodeURIComponent(id)}` : ""}`); }
function statusClass(value) { return `action-plan-status action-plan-status-${String(value || "rascunho").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replaceAll(" ", "-")}`; }

function renderList() {
  const term = search.value.trim().toLowerCase();
  const status = statusFilter.value;
  const filtered = records.filter((item) => [item.documentCode, item.title, item.sector, item.responsible, item.origin].join(" ").toLowerCase().includes(term) && (!status || item.status === status));
  count.textContent = `${filtered.length} ${filtered.length === 1 ? "plano" : "planos"}`;
  if (!filtered.length) { list.innerHTML = '<div class="action-plan-empty"><strong>Nenhum plano encontrado.</strong><span>Crie um plano para iniciar o acompanhamento.</span></div>'; return; }
  list.innerHTML = filtered.map((item) => `<article class="action-plan-list-row"><div class="action-plan-list-code">${escapeHtml(item.documentCode)}</div><div class="action-plan-list-main"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.type)} · ${escapeHtml(item.origin)} · ${escapeHtml(item.responsible || "Responsável não informado")}</p></div><span class="${statusClass(item.status)}">${escapeHtml(item.status)}</span><span class="action-plan-priority">${escapeHtml(item.priority)}</span><button type="button" class="primary-button" data-open-plan="${escapeHtml(item.planId)}">Abrir</button></article>`).join("");
}

function decorateListActions() {
  list.querySelectorAll(".action-plan-list-row").forEach((row) => {
    const openButton = row.querySelector("[data-open-plan]");
    if (!openButton || openButton.parentElement.classList.contains("action-plan-list-actions")) return;
    const actions = document.createElement("div");
    actions.className = "action-plan-list-actions";
    openButton.replaceWith(actions);
    actions.append(openButton);
    if (isManager()) {
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "danger-button";
      deleteButton.dataset.deletePlan = row.querySelector("[data-open-plan]").dataset.openPlan;
      deleteButton.textContent = "Excluir";
      actions.append(deleteButton);
    }
  });
}

const renderPlanList = renderList;
renderList = () => { renderPlanList(); decorateListActions(); };

function setField(name, value) { const field = form.querySelector(`[data-field="${name}"]`); if (field) field.value = value ?? ""; }
function updateWhyFields() { document.querySelector("#actionPlanWhys").classList.toggle("is-hidden", form.querySelector('[data-field="causeMethod"]').value !== "5 Porquês"); }

function renderActions(actions = []) {
  const rows = actions.length ? actions : [{ actionId: `acao-${Date.now()}`, type: "Ação corretiva", status: "Não iniciada" }];
  actionsList.innerHTML = rows.map((action, index) => `<article class="action-plan-action-row" data-action-id="${escapeHtml(action.actionId || `acao-${index + 1}`)}"><div class="action-plan-action-number">${index + 1}</div><label class="field-span-two">Descrição da ação<textarea data-action-field="description" placeholder="Descreva a ação a executar.">${escapeHtml(action.description)}</textarea></label><label>Tipo da ação<select data-action-field="type">${optionList(ACTION_TYPES, action.type)}</select></label><label>Responsável<input data-action-field="responsible" value="${escapeHtml(action.responsible)}"></label><label>Setor responsável<input data-action-field="responsibleSector" value="${escapeHtml(action.responsibleSector)}"></label><label>Data prevista<input type="date" data-action-field="dueDate" value="${escapeHtml(action.dueDate)}"></label><label>Data de início<input type="date" data-action-field="startDate" value="${escapeHtml(action.startDate)}"></label><label>Data de conclusão<input type="date" data-action-field="completionDate" value="${escapeHtml(action.completionDate)}"></label><label>Situação<select data-action-field="status">${optionList(ACTION_STATUSES, action.status)}</select></label><label>Percentual de conclusão<input type="number" min="0" max="100" data-action-field="completionPercent" value="${Number(action.completionPercent) || 0}"></label><label class="field-span-two">Evidência de execução<textarea data-action-field="evidence" placeholder="Registro que comprova a execução.">${escapeHtml(action.evidence)}</textarea></label><label class="field-span-two">Comentário do responsável<textarea data-action-field="comment">${escapeHtml(action.comment)}</textarea></label><label>Custo estimado<input data-action-field="estimatedCost" value="${escapeHtml(action.estimatedCost)}" placeholder="R$ 0,00"></label><label>Custo realizado<input data-action-field="actualCost" value="${escapeHtml(action.actualCost)}" placeholder="R$ 0,00"></label><button type="button" class="icon-danger-button" data-remove-action aria-label="Remover ação">×</button></article>`).join("");
}

function renderEditor(data) {
  current = data;
  isDirty = false;
  editorTitle.textContent = data.documentCode ? `Editar ${data.documentCode}` : "Novo plano";
  formError.textContent = "";
  saveStatus.textContent = "";
  ["documentCode", "title", "type", "origin", "sourceDocument", "sector", "responsible", "openingDate", "priority", "status", "problemDescription", "situationDescription", "impact", "initialEvidence", "attachments", "containment", "containmentDate", "containmentResponsible", "causeMethod", "rootCause", "causeCategory", "participants", "causeEvidence", "causeAttachments", "closureDate", "closureApprover"].forEach((field) => setField(field, data[field]));
  form.querySelectorAll("[data-why-index]").forEach((field) => { field.value = data.whys?.[Number(field.dataset.whyIndex)] || ""; });
  form.querySelectorAll("[data-effectiveness]").forEach((field) => { const value = data.effectiveness?.[field.dataset.effectiveness]; if (field.type === "checkbox") field.checked = value === true; else field.value = value ?? ""; });
  renderActions(data.actions);
  updateWhyFields();
  showEditor();
}

function collectData() {
  const data = {};
  form.querySelectorAll("[data-field]").forEach((field) => { data[field.dataset.field] = field.value; });
  data.whys = [...form.querySelectorAll("[data-why-index]")].map((field) => field.value);
  data.effectiveness = {};
  form.querySelectorAll("[data-effectiveness]").forEach((field) => { data.effectiveness[field.dataset.effectiveness] = field.type === "checkbox" ? field.checked : field.value; });
  data.actions = [...actionsList.querySelectorAll("[data-action-id]")].map((row) => { const action = { actionId: row.dataset.actionId }; row.querySelectorAll("[data-action-field]").forEach((field) => { action[field.dataset.actionField] = field.value; }); return action; });
  if (current?.planId) data.planId = current.planId;
  return data;
}

async function loadRecords() { records = (await request("/")).plans || []; renderList(); }
async function openNew() { try { await window.SharedModuleLock?.release?.(); renderEditor((await request("/new")).plan); setUrl("novo"); } catch (error) { formError.textContent = error.message; } }
async function openExisting(id) { try { renderEditor((await request(`/${encodeURIComponent(id)}`)).plan); await window.SharedModuleLock?.acquire?.("planos-acao", id); setUrl("editar", id); } catch (error) { formError.textContent = error.message; } }

function confirmDelete() {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "action-plan-confirm-backdrop";
    backdrop.innerHTML = '<section class="action-plan-confirm" role="dialog" aria-modal="true"><strong>!</strong><div><h2>Excluir plano?</h2><p>Este registro será removido permanentemente.</p></div><div class="action-plan-confirm-actions"><button type="button" class="secondary-button" data-cancel>Cancelar</button><button type="button" class="danger-button" data-confirm>Excluir</button></div></section>';
    document.body.append(backdrop);
    const finish = (value) => { backdrop.remove(); resolve(value); };
    backdrop.addEventListener("click", (event) => { if (event.target === backdrop) finish(false); });
    backdrop.querySelector("[data-cancel]").addEventListener("click", () => finish(false));
    backdrop.querySelector("[data-confirm]").addEventListener("click", () => finish(true));
    backdrop.querySelector("[data-cancel]").focus();
  });
}

function confirmDiscard() {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "action-plan-confirm-backdrop";
    backdrop.innerHTML = '<section class="action-plan-confirm" role="dialog" aria-modal="true" aria-labelledby="discardPlanTitle"><strong>!</strong><div><h2 id="discardPlanTitle">Sair sem salvar?</h2><p>As alterações deste plano serão perdidas.</p></div><div class="action-plan-confirm-actions"><button type="button" class="secondary-button" data-cancel>Continuar editando</button><button type="button" class="danger-button" data-confirm>Sair sem salvar</button></div></section>';
    document.body.append(backdrop);
    const finish = (value) => { backdrop.remove(); resolve(value); };
    backdrop.addEventListener("click", (event) => { if (event.target === backdrop) finish(false); });
    backdrop.querySelector("[data-cancel]").addEventListener("click", () => finish(false));
    backdrop.querySelector("[data-confirm]").addEventListener("click", () => finish(true));
    backdrop.querySelector("[data-cancel]").focus();
  });
}

async function requestPdf() {
  const token = sessionStorage.getItem(tokenKey) || "";
  const response = await fetch(`/api/action-plans/${encodeURIComponent(current.planId)}/pdf`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || "Não foi possível gerar o PDF."); }
  return response.blob();
}

function showPdfPreview(blob) {
  const url = URL.createObjectURL(blob); const backdrop = document.createElement("div"); backdrop.className = "action-plan-confirm-backdrop";
  backdrop.innerHTML = `<section class="action-plan-pdf-dialog" role="dialog" aria-modal="true"><header><strong>Visualização do PDF</strong><button type="button" class="secondary-button" data-close-pdf>Fechar</button></header><iframe title="Visualização do plano em PDF" src="${url}"></iframe></section>`;
  document.body.append(backdrop); const close = () => { URL.revokeObjectURL(url); backdrop.remove(); }; backdrop.querySelector("[data-close-pdf]").addEventListener("click", close); backdrop.addEventListener("click", (event) => { if (event.target === backdrop) close(); });
}

async function withPdfButton(button, operation) { const label = button.textContent; button.disabled = true; button.textContent = "Gerando..."; try { await operation(); } catch (error) { formError.textContent = error.message; } finally { button.disabled = false; button.textContent = label; } }

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  formError.textContent = "";
  const submit = document.querySelector('button[type="submit"][form="actionPlanForm"]');
  if (submit) submit.disabled = true;
  try {
    const data = collectData();
    const path = current?.planId ? `/${encodeURIComponent(current.planId)}` : "/";
    const response = await request(path, { method: current?.planId ? "PUT" : "POST", body: JSON.stringify({ plan: data }) });
    renderEditor(response.plan); await window.SharedModuleLock?.acquire?.("planos-acao", response.plan.planId); setUrl("editar", response.plan.planId); await loadRecords(); saveStatus.textContent = "Salvo";
  } catch (error) { formError.textContent = error.message; formError.scrollIntoView({ behavior: "smooth", block: "center" }); } finally { if (submit) submit.disabled = false; }
});

document.querySelector("#newActionPlan").addEventListener("click", openNew);
document.querySelector("#cancelActionPlan").addEventListener("click", async () => { if (!isDirty || await confirmDiscard()) showList(); });
document.querySelector("#backToActionPlans").addEventListener("click", async () => { if (!isDirty || await confirmDiscard()) showList(); });
document.querySelector("#deleteActionPlan").addEventListener("click", async () => { if (!current?.planId || !isManager() || !await confirmDelete()) return; try { await request(`/${encodeURIComponent(current.planId)}`, { method: "DELETE" }); isDirty = false; await loadRecords(); showList(); } catch (error) { formError.textContent = error.message; } });
previewPdfButton.addEventListener("click", () => { if (current?.planId) withPdfButton(previewPdfButton, async () => showPdfPreview(await requestPdf())); });
downloadPdfButton.addEventListener("click", () => { if (current?.planId) withPdfButton(downloadPdfButton, async () => { const url = URL.createObjectURL(await requestPdf()); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${current.documentCode || "plano-de-acao"}.pdf`; anchor.click(); URL.revokeObjectURL(url); }); });
document.querySelector("#addActionPlanAction").addEventListener("click", () => { const actions = collectData().actions; if (actions.length === 1 && !actions[0].description) actions.length = 0; actions.push({ actionId: `acao-${Date.now()}`, type: "Ação corretiva", status: "Não iniciada" }); renderActions(actions); isDirty = true; });
actionsList.addEventListener("click", (event) => { const button = event.target.closest("[data-remove-action]"); if (!button) return; button.closest("[data-action-id]").remove(); [...actionsList.querySelectorAll(".action-plan-action-number")].forEach((item, index) => { item.textContent = index + 1; }); isDirty = true; });
list.addEventListener("click", (event) => { const button = event.target.closest("[data-open-plan]"); if (button) openExisting(button.dataset.openPlan); });
list.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-delete-plan]");
  if (!button) return;
  if (!isManager() || !await confirmDelete()) return;
  button.disabled = true;
  try { await request(`/${encodeURIComponent(button.dataset.deletePlan)}`, { method: "DELETE" }); await loadRecords(); }
  catch (error) { formError.textContent = error.message; }
  finally { button.disabled = false; }
});
search.addEventListener("input", renderList); statusFilter.addEventListener("change", renderList); form.addEventListener("input", () => { isDirty = true; }); form.addEventListener("change", () => { isDirty = true; });
form.querySelector('[data-field="causeMethod"]').addEventListener("change", (event) => { document.querySelector("#actionPlanWhys").classList.toggle("is-hidden", event.target.value !== "5 Porquês"); });
window.addEventListener("beforeunload", (event) => { if (!isDirty) return; event.preventDefault(); event.returnValue = ""; });

async function boot() {
  if (!sessionStorage.getItem(tokenKey)) { window.location.href = "index.html"; return; }
  try {
    app.classList.remove("is-locked");
    document.querySelector("#deleteActionPlan").hidden = !isManager();
    await loadRecords();
    const params = new URLSearchParams(window.location.search);
    if (params.get("modo") === "novo") await openNew();
    if (params.get("modo") === "editar" && params.get("id")) await openExisting(params.get("id"));
  } catch (error) { if (error.status === 401 || error.status === 403) window.location.href = "index.html"; else { list.innerHTML = `<div class="action-plan-empty"><strong>Não foi possível carregar o módulo.</strong><span>${escapeHtml(error.message)}</span></div>`; window.AppBoot?.error(error.message, () => boot()); } }
}
boot().finally(() => window.AppBoot?.ready());

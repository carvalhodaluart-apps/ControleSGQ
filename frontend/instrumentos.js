const app = document.querySelector("#instrumentApp");
const listPanel = document.querySelector("#instrumentListPanel");
const editorPanel = document.querySelector("#instrumentEditor");
const list = document.querySelector("#instrumentList");
const count = document.querySelector("#instrumentCount");
const form = document.querySelector("#instrumentForm");
const errorBox = document.querySelector("#instrumentFormError");
const search = document.querySelector("#instrumentSearch");
const situationFilter = document.querySelector("#instrumentSituationFilter");
const quickSituationFilters = [...document.querySelectorAll("[data-situation-filter]")];
const maintenanceList = document.querySelector("#instrumentMaintenanceList");
const editorTitle = document.querySelector("#instrumentEditorTitle");
const saveStatus = document.querySelector("#instrumentSaveStatus");
const previewPdfButton = document.querySelector("#previewInstrumentPdf");
const downloadPdfButton = document.querySelector("#downloadInstrumentPdf");
const tokenKey = "procedure-quality-token";
const roleKey = "procedure-user-role";
let records = [];
let current = null;
let dirty = false;
let certificate = { name: "", data: "" };
function updateCertificateLink() {
  const nameNode = document.querySelector("#instrumentCertificateName");
  if (!nameNode) return;
  let link = document.querySelector("#instrumentCertificateLink");
  if (!link) {
    link = document.createElement("a");
    link.id = "instrumentCertificateLink";
    link.className = "module-file-link is-hidden";
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "Abrir certificado";
    nameNode.after(link);
  }
  const available = Boolean(certificate.data && certificate.data.startsWith("data:application/pdf"));
  link.classList.toggle("is-hidden", !available);
  if (available) link.href = certificate.data;
}
new MutationObserver(updateCertificateLink).observe(document.querySelector("#instrumentCertificateName"), { childList: true, characterData: true, subtree: true });
document.querySelectorAll("[required]").forEach((field) => field.closest("label")?.classList.add("module-required"));
const MAINTENANCE_TYPES = ["Manutenção preventiva", "Manutenção corretiva", "Limpeza", "Ajuste", "Verificação intermediária"];
const MAINTENANCE_RESULTS = ["Conforme", "Não conforme", "Liberado", "Bloqueado", "Pendente"];

function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
function options(values, selected) { return values.map((value) => `<option ${value === selected ? "selected" : ""}>${escapeHtml(value)}</option>`).join(""); }
function manager() { return ["manager", "quality"].includes(sessionStorage.getItem(roleKey)); }
async function request(path, init = {}) { const token = sessionStorage.getItem(tokenKey) || ""; const response = await fetch(`/api/instruments${path}`, { ...init, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) } }); const data = await response.json().catch(() => ({})); if (!response.ok) { const failure = new Error(data.error || "Não foi possível concluir a operação."); failure.status = response.status; throw failure; } return data; }
function showList() { listPanel.classList.remove("is-hidden"); editorPanel.classList.add("is-hidden"); history.replaceState({}, "", "instrumentos.html"); window.scrollTo({ top: 0, behavior: "smooth" }); }
function showEditor() { listPanel.classList.add("is-hidden"); editorPanel.classList.remove("is-hidden"); window.scrollTo({ top: 0, behavior: "smooth" }); }
function setUrl(mode, id = "") { history.replaceState({}, "", `instrumentos.html?modo=${mode}${id ? `&id=${encodeURIComponent(id)}` : ""}`); }
function statusClass(value) { return `instrument-status instrument-status-${String(value || "liberado").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replaceAll(" ", "-")}`; }
function syncQuickSituationFilters(value) { quickSituationFilters.forEach((button) => button.classList.toggle("is-active", button.dataset.situationFilter === value)); }

function renderList() {
  const term = search.value.trim().toLowerCase(); const situation = situationFilter.value;
  const filtered = records.filter((item) => [item.documentCode, item.name, item.type, item.sector, item.serialNumber].join(" ").toLowerCase().includes(term) && (!situation || item.situation === situation));
  count.textContent = `${filtered.length} ${filtered.length === 1 ? "instrumento" : "instrumentos"}`;
  if (!filtered.length) { list.innerHTML = '<div class="instrument-empty"><strong>Nenhum instrumento encontrado.</strong><span>Cadastre o primeiro instrumento para iniciar o controle metrológico.</span></div>'; return; }
  list.innerHTML = filtered.map((item) => `<article class="instrument-list-row"><div class="instrument-code">${escapeHtml(item.documentCode)}</div><div class="instrument-list-main"><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.type)} · ${escapeHtml(item.sector || "Setor não informado")} · Série: ${escapeHtml(item.serialNumber || "Não informada")}</p></div><span class="${statusClass(item.situation)}">${escapeHtml(item.situation)}</span><span class="instrument-next-date">Próxima: ${escapeHtml(item.nextCalibrationDate || "Não informada")}</span><button type="button" class="primary-button" data-open-instrument-record="${escapeHtml(item.instrumentId)}">Abrir</button></article>`).join("");
}
function decorateListActions() {
  list.querySelectorAll(".instrument-list-row").forEach((row) => {
    const openButton = row.querySelector("[data-open-instrument-record]");
    if (!openButton || openButton.parentElement.classList.contains("instrument-list-actions")) return;
    const actions = document.createElement("div");
    actions.className = "instrument-list-actions";
    openButton.replaceWith(actions);
    actions.append(openButton);
    if (manager()) {
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "danger-button";
      deleteButton.dataset.deleteInstrumentRecord = row.querySelector("[data-open-instrument-record]").dataset.openInstrumentRecord;
      deleteButton.textContent = "Excluir";
      actions.append(deleteButton);
    }
  });
}

const renderInstrumentList = renderList;
renderList = () => { renderInstrumentList(); decorateListActions(); };

function setField(name, value) { const field = form.querySelector(`[data-field="${name}"]`); if (field) field.value = value ?? ""; }
function setGroup(group, values = {}) { form.querySelectorAll(`[data-${group}]`).forEach((field) => { const value = values[field.dataset[group]]; if (field.type === "checkbox") field.checked = value === true; else field.value = value ?? ""; }); }
function updateImpact() { const result = form.querySelector('[data-calibration="finalResult"]').value; document.querySelector("#instrument-impact").classList.toggle("is-hidden", result !== "Reprovado"); }
function renderMaintenance(items = []) {
  const rows = items.length ? items : [{ maintenanceId: `man-${Date.now()}`, type: "Manutenção preventiva", result: "Pendente" }];
  maintenanceList.innerHTML = rows.map((item, index) => `<article class="instrument-maintenance-row" data-maintenance-id="${escapeHtml(item.maintenanceId || `man-${index + 1}`)}"><strong>${index + 1}</strong><label>Tipo<select data-maintenance-field="type">${options(MAINTENANCE_TYPES, item.type)}</select></label><label>Data<input type="date" data-maintenance-field="date" value="${escapeHtml(item.date)}"></label><label class="span-two">Serviço realizado<textarea data-maintenance-field="service">${escapeHtml(item.service)}</textarea></label><label>Responsável<input data-maintenance-field="responsible" value="${escapeHtml(item.responsible)}"></label><label>Resultado<select data-maintenance-field="result">${options(MAINTENANCE_RESULTS, item.result)}</select></label><label>Peças substituídas<textarea data-maintenance-field="replacedParts">${escapeHtml(item.replacedParts)}</textarea></label><label>Custo<input data-maintenance-field="cost" value="${escapeHtml(item.cost)}" placeholder="R$ 0,00"></label><label>Anexos<textarea data-maintenance-field="attachments">${escapeHtml(item.attachments)}</textarea></label><label>Próxima manutenção<input type="date" data-maintenance-field="nextMaintenance" value="${escapeHtml(item.nextMaintenance)}"></label><button type="button" class="icon-danger-button" data-remove-maintenance aria-label="Remover manutenção">×</button></article>`).join("");
}
function renderEditor(data) {
  current = data; dirty = false; errorBox.textContent = ""; saveStatus.textContent = ""; editorTitle.textContent = data.documentCode ? `Editar ${data.documentCode}` : "Novo instrumento";
  ["documentCode", "name", "type", "assetNumber", "manufacturer", "model", "serialNumber", "sector", "location", "responsible", "acquisitionDate", "criticality", "situation"].forEach((field) => setField(field, data[field]));
  setGroup("metrology", data.metrology); setGroup("planning", data.planning); setGroup("calibration", data.calibration); setGroup("impact", data.impactAnalysis); certificate = data.calibration?.certificatePdf || { name: "", data: "" }; document.querySelector("#instrumentCertificateName").textContent = certificate.name || "Nenhum certificado selecionado"; renderMaintenance(data.maintenances); updateImpact(); showEditor();
}
function collectData() {
  const data = {}; form.querySelectorAll("[data-field]").forEach((field) => { data[field.dataset.field] = field.value; });
  for (const group of ["metrology", "planning", "calibration", "impact"]) { data[group === "impact" ? "impactAnalysis" : group] = {}; form.querySelectorAll(`[data-${group}]`).forEach((field) => { const target = data[group === "impact" ? "impactAnalysis" : group]; target[field.dataset[group]] = field.type === "checkbox" ? field.checked : field.value; }); }
  data.calibration.certificatePdf = certificate;
  data.maintenances = [...maintenanceList.querySelectorAll("[data-maintenance-id]")].map((row) => { const item = { maintenanceId: row.dataset.maintenanceId }; row.querySelectorAll("[data-maintenance-field]").forEach((field) => { item[field.dataset.maintenanceField] = field.value; }); return item; });
  if (current?.instrumentId) data.instrumentId = current.instrumentId; return data;
}
async function loadRecords() { records = (await request("/")).instruments || []; renderList(); }
async function openNew() { try { renderEditor((await request("/new")).instrument); setUrl("novo"); } catch (failure) { errorBox.textContent = failure.message; } }
async function openExisting(id) { try { renderEditor((await request(`/${encodeURIComponent(id)}`)).instrument); setUrl("editar", id); } catch (failure) { errorBox.textContent = failure.message; } }
function confirmDelete() { return new Promise((resolve) => { const backdrop = document.createElement("div"); backdrop.className = "instrument-confirm-backdrop"; backdrop.innerHTML = '<section class="instrument-confirm" role="dialog" aria-modal="true"><strong>!</strong><div><h2>Excluir instrumento?</h2><p>O cadastro e o histórico serão removidos permanentemente.</p></div><div class="instrument-confirm-actions"><button type="button" class="secondary-button" data-cancel>Cancelar</button><button type="button" class="danger-button" data-confirm>Excluir</button></div></section>'; document.body.append(backdrop); const finish = (value) => { backdrop.remove(); resolve(value); }; backdrop.addEventListener("click", (event) => { if (event.target === backdrop) finish(false); }); backdrop.querySelector("[data-cancel]").addEventListener("click", () => finish(false)); backdrop.querySelector("[data-confirm]").addEventListener("click", () => finish(true)); }); }
function confirmDiscard() { return new Promise((resolve) => { const backdrop = document.createElement("div"); backdrop.className = "instrument-confirm-backdrop"; backdrop.innerHTML = '<section class="instrument-confirm" role="dialog" aria-modal="true" aria-labelledby="discardInstrumentTitle"><strong>!</strong><div><h2 id="discardInstrumentTitle">Sair sem salvar?</h2><p>As alterações deste instrumento serão perdidas.</p></div><div class="instrument-confirm-actions"><button type="button" class="secondary-button" data-cancel>Continuar editando</button><button type="button" class="danger-button" data-confirm>Sair sem salvar</button></div></section>'; document.body.append(backdrop); const finish = (value) => { backdrop.remove(); resolve(value); }; backdrop.addEventListener("click", (event) => { if (event.target === backdrop) finish(false); }); backdrop.querySelector("[data-cancel]").addEventListener("click", () => finish(false)); backdrop.querySelector("[data-confirm]").addEventListener("click", () => finish(true)); backdrop.querySelector("[data-cancel]").focus(); }); }
async function requestPdf() { const token = sessionStorage.getItem(tokenKey) || ""; const response = await fetch(`/api/instruments/${encodeURIComponent(current.instrumentId)}/pdf`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }); if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || "Não foi possível gerar o PDF."); } return response.blob(); }
function showPdfPreview(blob) { const url = URL.createObjectURL(blob); const backdrop = document.createElement("div"); backdrop.className = "instrument-confirm-backdrop"; backdrop.innerHTML = `<section class="instrument-pdf-dialog" role="dialog" aria-modal="true"><header><strong>Visualização do PDF</strong><button type="button" class="secondary-button" data-close-pdf>Fechar</button></header><iframe title="Visualização do instrumento em PDF" src="${url}"></iframe></section>`; document.body.append(backdrop); const close = () => { URL.revokeObjectURL(url); backdrop.remove(); }; backdrop.querySelector("[data-close-pdf]").addEventListener("click", close); backdrop.addEventListener("click", (event) => { if (event.target === backdrop) close(); }); }
async function withPdfButton(button, operation) { const label = button.textContent; button.disabled = true; button.textContent = "Gerando..."; try { await operation(); } catch (failure) { errorBox.textContent = failure.message; } finally { button.disabled = false; button.textContent = label; } }

form.addEventListener("submit", async (event) => { event.preventDefault(); errorBox.textContent = ""; const button = document.querySelector('button[type="submit"][form="instrumentForm"]'); if (button) button.disabled = true; try { const data = collectData(); const path = current?.instrumentId ? `/${encodeURIComponent(current.instrumentId)}` : "/"; const result = await request(path, { method: current?.instrumentId ? "PUT" : "POST", body: JSON.stringify({ instrument: data }) }); renderEditor(result.instrument); setUrl("editar", result.instrument.instrumentId); await loadRecords(); saveStatus.textContent = "Salvo"; } catch (failure) { errorBox.textContent = failure.message; errorBox.scrollIntoView({ behavior: "smooth", block: "center" }); } finally { if (button) button.disabled = false; } });
document.querySelector("#newInstrument").addEventListener("click", openNew); document.querySelector("#cancelInstrument").addEventListener("click", async () => { if (!dirty || await confirmDiscard()) showList(); }); document.querySelector("#backToInstruments").addEventListener("click", async () => { if (!dirty || await confirmDiscard()) showList(); });
document.querySelector("#deleteInstrument").addEventListener("click", async () => { if (!current?.instrumentId || !manager() || !await confirmDelete()) return; try { await request(`/${encodeURIComponent(current.instrumentId)}`, { method: "DELETE" }); dirty = false; await loadRecords(); showList(); } catch (failure) { errorBox.textContent = failure.message; } });
previewPdfButton.addEventListener("click", () => { if (current?.instrumentId) withPdfButton(previewPdfButton, async () => showPdfPreview(await requestPdf())); }); downloadPdfButton.addEventListener("click", () => { if (current?.instrumentId) withPdfButton(downloadPdfButton, async () => { const url = URL.createObjectURL(await requestPdf()); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${current.documentCode || "instrumento"}.pdf`; anchor.click(); URL.revokeObjectURL(url); }); });
document.querySelector("#addMaintenance").addEventListener("click", () => { const items = collectData().maintenances; if (items.length === 1 && !items[0].service) items.length = 0; items.push({ maintenanceId: `man-${Date.now()}`, type: "Manutenção preventiva", result: "Pendente" }); renderMaintenance(items); dirty = true; });
maintenanceList.addEventListener("click", (event) => { const button = event.target.closest("[data-remove-maintenance]"); if (!button) return; button.closest("[data-maintenance-id]").remove(); maintenanceList.querySelectorAll(".instrument-maintenance-row > strong").forEach((item, index) => { item.textContent = index + 1; }); dirty = true; });
list.addEventListener("click", (event) => { const button = event.target.closest("[data-open-instrument-record]"); if (button) openExisting(button.dataset.openInstrumentRecord); });
list.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-delete-instrument-record]");
  if (!button) return;
  if (!manager() || !await confirmDelete()) return;
  button.disabled = true;
  try { await request(`/${encodeURIComponent(button.dataset.deleteInstrumentRecord)}`, { method: "DELETE" }); await loadRecords(); }
  catch (failure) { errorBox.textContent = failure.message; }
  finally { button.disabled = false; }
});
search.addEventListener("input", renderList); situationFilter.addEventListener("change", () => { syncQuickSituationFilters(situationFilter.value); renderList(); }); quickSituationFilters.forEach((button) => button.addEventListener("click", () => { situationFilter.value = button.dataset.situationFilter; syncQuickSituationFilters(situationFilter.value); renderList(); })); form.addEventListener("input", () => { dirty = true; }); form.addEventListener("change", () => { dirty = true; }); form.querySelector('[data-calibration="finalResult"]').addEventListener("change", updateImpact);
document.querySelector("#instrumentCertificate").addEventListener("change", (event) => { const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { certificate = { name: file.name, data: reader.result }; document.querySelector("#instrumentCertificateName").textContent = file.name; dirty = true; }; reader.readAsDataURL(file); });
document.querySelector("#instrumentCertificate").addEventListener("change", (event) => { const file = event.target.files[0]; if (!file) return; if (file.type !== "application/pdf" || file.size > 10 * 1024 * 1024) { certificate = { name: "", data: "" }; event.target.value = ""; document.querySelector("#instrumentCertificateName").textContent = "Selecione um PDF de até 10 MB"; errorBox.textContent = "O certificado deve ser um arquivo PDF de até 10 MB."; } });
window.addEventListener("beforeunload", (event) => { if (!dirty) return; event.preventDefault(); event.returnValue = ""; });
async function boot() { if (!sessionStorage.getItem(tokenKey)) { window.location.href = "index.html"; return; } try { app.classList.remove("is-locked"); document.querySelector("#deleteInstrument").hidden = !manager(); await loadRecords(); const params = new URLSearchParams(window.location.search); if (params.get("modo") === "novo") await openNew(); if (params.get("modo") === "editar" && params.get("id")) await openExisting(params.get("id")); } catch (failure) { if ([401, 403].includes(failure.status)) window.location.href = "index.html"; else list.innerHTML = `<div class="instrument-empty"><strong>Não foi possível carregar o módulo.</strong><span>${escapeHtml(failure.message)}</span></div>`; } }
boot();

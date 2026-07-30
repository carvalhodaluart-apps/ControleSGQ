const masterBody = document.querySelector("#masterTableBody");
const masterError = document.querySelector("#masterError");
const masterCount = document.querySelector("#masterCount");
const masterSyncState = document.querySelector("#masterSyncState");
const masterAuth = document.querySelector("#masterAuth");
const masterAuthForm = document.querySelector("#masterAuthForm");
const masterAuthError = document.querySelector("#masterAuthError");
const masterPassword = document.querySelector("#masterPassword");
const masterSearch = document.querySelector("#masterSearch");
const masterEditButton = document.querySelector("#masterEdit");
const masterActionHead = document.querySelector("#masterActionHead");
const masterAuthTitle = document.querySelector("#masterAuthTitle");
const masterAuthMessage = document.querySelector("#masterAuthMessage");
const masterTokenKey = "procedure-quality-token";
let qualityToken = sessionStorage.getItem(masterTokenKey) || "";
let masterDocuments = [];
let masterQuery = "";
let masterEditMode = false;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

function showAuth(mode = "access") {
  masterAuth.dataset.mode = mode;
  masterAuthTitle.textContent = mode === "edit" ? "Editar lista mestra" : "Senha da qualidade";
  masterAuthMessage.textContent = mode === "edit" ? "Digite a senha para liberar a exclusão de documentos." : "Digite a senha para acessar a lista mestra.";
  masterAuth.classList.remove("is-hidden");
  masterPassword.focus();
}

function normalizeSearch(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function renderDocuments(documents) {
  masterActionHead.hidden = !masterEditMode;
  masterCount.textContent = masterQuery
    ? `${documents.length} de ${masterDocuments.length} documento${masterDocuments.length === 1 ? "" : "s"}`
    : `${documents.length} documento${documents.length === 1 ? "" : "s"}`;
  masterBody.innerHTML = documents.length ? documents.map((document) => `
    <tr>
      <td><strong>${escapeHtml(document.documentCode)}</strong></td>
      <td>${escapeHtml(document.title || "Não informado")}</td>
      <td>${escapeHtml(document.revision || "00")}</td>
      <td>${escapeHtml(document.elaborator || "Não informado")}</td>
      <td>${escapeHtml(document.elaborationDate || "Não informado")}</td>
      <td>${escapeHtml(document.approver || "Não informado")}</td>
      <td>${escapeHtml(document.approvalDate || "Não informado")}</td>
      <td><span class="master-status master-status-${document.status === "Publicado" ? "published" : document.status === "Obsoleto" ? "obsolete" : "draft"}">${escapeHtml(document.status)}</span></td>
      <td class="master-locations">
        <label>Publicado<input type="text" value="${escapeHtml(document.documentPublicLocation)}" data-location-public ${masterEditMode ? "" : "disabled"}></label>
        <label>Qualidade<input type="text" value="${escapeHtml(document.documentOriginalLocation)}" data-location-original ${masterEditMode ? "" : "disabled"}></label>
        <button type="button" class="secondary-button master-location-save" data-location-save="${escapeHtml(document.procedureId)}" ${masterEditMode ? "" : "disabled"}>Salvar</button>
        <small data-location-state></small>
      </td>
      <td ${masterEditMode ? "" : "hidden"}><button type="button" class="danger-button master-delete-button" data-master-delete="${escapeHtml(document.procedureId)}">Excluir</button></td>
    </tr>
  `).join("") : `<tr><td class="master-empty" colspan="${masterEditMode ? 10 : 9}">Nenhum documento cadastrado.</td></tr>`;
}

function filterDocuments() {
  const query = normalizeSearch(masterQuery);
  const filtered = query
    ? masterDocuments.filter((document) => Object.values(document).some((value) => normalizeSearch(value).includes(query)))
    : masterDocuments;
  renderDocuments(filtered);
}

function showMasterDeleteConfirmation(label) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "master-auth-backdrop";
    overlay.innerHTML = `
      <div class="master-auth-dialog" role="dialog" aria-modal="true" aria-labelledby="masterConfirmTitle">
        <div class="master-auth-icon master-confirm-icon">!</div>
        <div>
          <h2 id="masterConfirmTitle">Excluir documento?</h2>
          <p>O documento <strong>${escapeHtml(label)}</strong> será removido da lista mestra e dos rascunhos locais.</p>
        </div>
        <div class="master-auth-actions">
          <button type="button" class="secondary-button" data-confirm-cancel>Cancelar</button>
          <button type="button" class="danger-button" data-confirm-delete>Excluir</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const close = (confirmed) => { overlay.remove(); resolve(confirmed); };
    overlay.querySelector("[data-confirm-cancel]").addEventListener("click", () => close(false));
    overlay.querySelector("[data-confirm-delete]").addEventListener("click", () => close(true));
  });
}

async function loadMasterList() {
  masterError.textContent = "";
  masterSyncState.textContent = "Atualizando...";
  const response = await fetch("/api/procedures/master", { headers: { Authorization: `Bearer ${qualityToken}` } });
  if (response.status === 401) {
    qualityToken = "";
    sessionStorage.removeItem(masterTokenKey);
    showAuth();
    return;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Não foi possível carregar a lista mestra.");
  masterDocuments = data.documents || [];
  filterDocuments();
  masterSyncState.textContent = "Sincronizado";
}

masterAuthForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  masterAuthError.textContent = "";
  const authMode = masterAuth.dataset.mode || "access";
  try {
    const response = await fetch("/api/procedures/auth/quality", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: masterPassword.value }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Senha incorreta.");
    qualityToken = data.token;
    sessionStorage.setItem(masterTokenKey, qualityToken);
    if (authMode === "edit") {
      masterEditMode = true;
      masterEditButton.textContent = "Sair da edição";
    }
    masterAuth.classList.add("is-hidden");
    masterPassword.value = "";
    await loadMasterList();
  } catch (error) {
    masterAuthError.textContent = error.message;
  }
});

document.querySelector("#masterRefresh").addEventListener("click", () => loadMasterList().catch((error) => { masterError.textContent = error.message; }));
masterEditButton.addEventListener("click", () => {
  if (masterEditMode) {
    masterEditMode = false;
    masterEditButton.textContent = "Editar";
    filterDocuments();
    return;
  }
  showAuth("edit");
});
masterBody.addEventListener("click", async (event) => {
  const deleteButton = event.target.closest("[data-master-delete]");
  if (deleteButton) {
    const record = masterDocuments.find((item) => item.procedureId === deleteButton.dataset.masterDelete);
    if (!record || !(await showMasterDeleteConfirmation(record.documentCode))) return;
    deleteButton.disabled = true;
    try {
      const response = await fetch(`/api/procedures/delete?id=${encodeURIComponent(record.procedureId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${qualityToken}` },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível excluir o documento.");
      masterDocuments = masterDocuments.filter((item) => item.procedureId !== record.procedureId);
      filterDocuments();
    } catch (error) {
      masterError.textContent = error.message;
      deleteButton.disabled = false;
    }
    return;
  }
  const button = event.target.closest("[data-location-save]");
  if (!button) return;
  const row = button.closest("tr");
  const state = row.querySelector("[data-location-state]");
  button.disabled = true;
  state.textContent = "Salvando...";
  try {
    const response = await fetch("/api/procedures/master/locations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${qualityToken}` },
      body: JSON.stringify({
        procedureId: button.dataset.locationSave,
        documentPublicLocation: row.querySelector("[data-location-public]").value,
        documentOriginalLocation: row.querySelector("[data-location-original]").value,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Não foi possível salvar a localização.");
    const document = masterDocuments.find((item) => item.procedureId === button.dataset.locationSave);
    if (document) {
      document.documentPublicLocation = data.document.documentPublicLocation;
      document.documentOriginalLocation = data.document.documentOriginalLocation;
    }
    state.textContent = "Salvo";
  } catch (error) {
    state.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
masterSearch.addEventListener("input", () => {
  masterQuery = masterSearch.value;
  filterDocuments();
});
loadMasterList().catch((error) => { masterError.textContent = error.message; });

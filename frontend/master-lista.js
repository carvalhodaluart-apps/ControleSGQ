const masterBody = document.querySelector("#masterTableBody");
const masterError = document.querySelector("#masterError");
const masterCount = document.querySelector("#masterCount");
const masterSyncState = document.querySelector("#masterSyncState");
const masterAuth = document.querySelector("#masterAuth");
const masterAuthForm = document.querySelector("#masterAuthForm");
const masterAuthError = document.querySelector("#masterAuthError");
const masterPassword = document.querySelector("#masterPassword");
const masterTokenKey = "procedure-quality-token";
let qualityToken = sessionStorage.getItem(masterTokenKey) || "";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

function showAuth() {
  masterAuth.classList.remove("is-hidden");
  masterPassword.focus();
}

function renderDocuments(documents) {
  masterCount.textContent = `${documents.length} documento${documents.length === 1 ? "" : "s"}`;
  masterBody.innerHTML = documents.length ? documents.map((document) => `
    <tr>
      <td><strong>${escapeHtml(document.documentCode)}</strong></td>
      <td>${escapeHtml(document.title || "Não informado")}</td>
      <td>${escapeHtml(document.revision || "00")}</td>
      <td>${escapeHtml(document.elaborator || "Não informado")}</td>
      <td>${escapeHtml(document.elaborationDate || "Não informado")}</td>
      <td>${escapeHtml(document.approver || "Não informado")}</td>
      <td>${escapeHtml(document.approvalDate || "Não informado")}</td>
      <td><span class="master-status master-status-${document.status === "Publicado" ? "published" : "draft"}">${escapeHtml(document.status)}</span></td>
    </tr>
  `).join("") : `<tr><td class="master-empty" colspan="8">Nenhum documento cadastrado.</td></tr>`;
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
  renderDocuments(data.documents || []);
  masterSyncState.textContent = "Sincronizado";
}

masterAuthForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  masterAuthError.textContent = "";
  try {
    const response = await fetch("/api/procedures/auth/quality", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: masterPassword.value }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Senha incorreta.");
    qualityToken = data.token;
    sessionStorage.setItem(masterTokenKey, qualityToken);
    masterAuth.classList.add("is-hidden");
    masterPassword.value = "";
    await loadMasterList();
  } catch (error) {
    masterAuthError.textContent = error.message;
  }
});

document.querySelector("#masterRefresh").addEventListener("click", () => loadMasterList().catch((error) => { masterError.textContent = error.message; }));
loadMasterList().catch((error) => { masterError.textContent = error.message; });

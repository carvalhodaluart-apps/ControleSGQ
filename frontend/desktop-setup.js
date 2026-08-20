(() => {
  const backdrop = document.querySelector("#desktopSetup");
  const form = document.querySelector("#desktopSetupForm");
  const password = document.querySelector("#desktopSetupPassword");
  const confirmation = document.querySelector("#desktopSetupPasswordConfirm");
  const displayName = document.querySelector("#desktopSetupDisplayName");
  const role = document.querySelector("#desktopSetupRole");
  const editorFields = document.querySelector("#desktopSetupEditorFields");
  const username = document.querySelector("#desktopSetupUsername");
  const backupInput = document.querySelector("#desktopSetupBackup");
  const errorMessage = document.querySelector("#desktopSetupError");
  const submit = document.querySelector("#desktopSetupSubmit");
  const createShared = document.querySelector("#desktopSetupCreateShared");
  const sharedFields = document.querySelector("#desktopSetupSharedFields");
  const sharedPassword = document.querySelector("#desktopSetupSharedPassword");
  const sharedPasswordConfirm = document.querySelector("#desktopSetupSharedPasswordConfirm");
  const hostResult = document.querySelector("#desktopSetupHostResult");
  const hostPath = document.querySelector("#desktopSetupHostPath");
  const copyHostPath = document.querySelector("#desktopSetupCopyHostPath");
  const finishHostSetup = document.querySelector("#desktopSetupFinish");
  if (!backdrop || !form) return;

  const sharedBackdrop = document.querySelector("#sharedFolderSetup");
  const sharedSelect = document.querySelector("#sharedFolderSetupSelect");
  const sharedSkip = document.querySelector("#sharedFolderSetupSkip");
  const sharedError = document.querySelector("#sharedFolderSetupError");

  if (!window.desktopSharedFolder?.supported) {
    createShared?.closest("label")?.classList.add("is-hidden");
    if (createShared) {
      createShared.checked = false;
      createShared.disabled = true;
    }
    sharedFields?.classList.add("is-hidden");
    sharedBackdrop?.classList.add("is-hidden");
    hostResult?.classList.add("is-hidden");
  }

  function showError(message) {
    errorMessage.textContent = message || "Nao foi possivel concluir a configuracao.";
  }

  async function request(path, options = {}) {
    const response = await fetch(path, { cache: "no-store", ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Nao foi possivel comunicar com o aplicativo.");
    return data;
  }

  async function loadStatus() {
    try {
      const status = await request("/api/procedures/setup/status");
      if (!status.supported || status.configured) return;
      backdrop.classList.remove("is-hidden");
      password.focus();
    } catch (error) {
      showError(error.message);
      backdrop.classList.remove("is-hidden");
    }
  }

  async function loadSharedFolderStatus() {
    if (!sharedBackdrop || !window.desktopSharedFolder?.supported) return;
    const setupStatus = await request("/api/procedures/setup/status").catch(() => ({ configured: false }));
    if (!setupStatus.configured) return;
    const status = await window.desktopSharedFolder.getStatus().catch(() => ({ configured: false }));
    if (!status.configured) sharedBackdrop.classList.remove("is-hidden");
  }

  sharedSelect?.addEventListener("click", async () => {
    sharedError.textContent = "";
    sharedSelect.disabled = true;
    try {
      const result = await window.desktopSharedFolder.select();
      if (!result?.canceled) sharedBackdrop.classList.add("is-hidden");
    } catch (error) {
      sharedError.textContent = error.message || "Não foi possível conectar a pasta de rede.";
    } finally {
      sharedSelect.disabled = false;
    }
  });
  sharedSkip?.addEventListener("click", () => sharedBackdrop?.classList.add("is-hidden"));
  copyHostPath?.addEventListener("click", async () => {
    if (!hostPath?.textContent) return;
    await navigator.clipboard?.writeText(hostPath.textContent);
    copyHostPath.textContent = "Copiado";
  });
  finishHostSetup?.addEventListener("click", () => window.location.reload());
  createShared?.addEventListener("change", () => {
    sharedFields?.classList.toggle("is-hidden", !createShared.checked);
    if (createShared.checked) sharedPassword?.focus();
  });
  role?.addEventListener("change", () => {
    const isEditor = role.value === "editor";
    editorFields?.classList.toggle("is-hidden", !isEditor);
    if (isEditor) {
      displayName.value = displayName.value === "Qualidade" ? "" : displayName.value;
      createShared.checked = false;
      createShared.disabled = true;
      sharedFields?.classList.add("is-hidden");
      username?.focus();
    } else {
      if (!displayName.value) displayName.value = "Qualidade";
      createShared.disabled = false;
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorMessage.textContent = "";
    if (password.value.length < 8) return showError("A senha inicial deve ter pelo menos 8 caracteres.");
    if (password.value !== confirmation.value) return showError("As senhas nao conferem.");
    if (role?.value === "editor" && !/^[a-z0-9][a-z0-9._-]{2,59}$/i.test(username?.value.trim() || "")) return showError("Informe um usuario de editor valido.");
    if (createShared?.checked && role?.value !== "manager") return showError("Somente o gestor pode configurar o computador central.");
    if (createShared?.checked && !window.desktopSharedFolder?.supported) return showError("Esta versao usa apenas dados locais.");
    if (createShared?.checked) {
      if (sharedPassword.value.length < 8) return showError("A senha da pasta deve ter pelo menos 8 caracteres.");
      if (sharedPassword.value !== sharedPasswordConfirm.value) return showError("As senhas da pasta nao conferem.");
      if (!window.desktopSharedFolder?.createHost) return showError("Abra o aplicativo instalado para configurar a pasta central.");
    }
    submit.disabled = true;
    submit.textContent = "Preparando...";
    try {
      const setupResult = await request("/api/procedures/setup", { method: "POST", body: JSON.stringify({ password: password.value, displayName: displayName.value, role: role?.value || "manager", username: username?.value.trim() || "" }) });
      const backupFile = backupInput.files?.[0];
      if (backupFile) {
        let backup;
        try { backup = JSON.parse(await backupFile.text()); } catch (_error) { throw new Error("O arquivo selecionado n\u00e3o \u00e9 v\u00e1lido."); }
        submit.textContent = "Importando backup...";
        await request("/api/procedures/setup/import", { method: "POST", headers: { "X-Setup-Token": setupResult.setupToken }, body: JSON.stringify({ backup }) });
      }
      if (createShared?.checked) {
        submit.textContent = "Criando pasta central...";
        const hostSetup = await window.desktopSharedFolder.createHost({ password: sharedPassword.value });
        if (hostSetup?.networkPath && hostResult && hostPath) {
          hostPath.textContent = hostSetup.networkPath;
          form.classList.add("is-hidden");
          hostResult.classList.remove("is-hidden");
          return;
        }
      }
      window.location.reload();
    } catch (error) {
      showError(error.message);
      submit.disabled = false;
      submit.textContent = "Criar acesso e continuar";
    }
  });

  loadStatus();
  loadSharedFolderStatus();
})();

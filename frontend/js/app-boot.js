(function () {
  const state = document.querySelector("#appBootState");

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>\"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;" }[character]));
  }

  function ready() {
    if (state?.dataset.failed === "true") return;
    state?.setAttribute("hidden", "");
  }

  function error(message, retry) {
    if (!state) return;
    state.dataset.failed = "true";
    state.innerHTML = `<strong>Nao foi possivel carregar esta tela</strong><span>${escapeHtml(message || "Tente novamente.")}</span>${retry ? '<button type="button" class="primary-button" data-app-retry>Tentar novamente</button>' : ""}`;
    state.querySelector("[data-app-retry]")?.addEventListener("click", () => {
      delete state.dataset.failed;
      state.removeAttribute("hidden");
      state.innerHTML = '<span class="app-boot-spinner" aria-hidden="true"></span><strong>Carregando...</strong>';
      retry();
    }, { once: true });
  }

  window.AppBoot = { ready, error };
}());

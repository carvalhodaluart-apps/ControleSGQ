const { dialog, shell } = require("electron");

function compareVersions(left, right) {
  const parse = (value) => String(value || "0")
    .replace(/^v/i, "")
    .split(/[.-]/)
    .slice(0, 3)
    .map((part) => Number.parseInt(part, 10) || 0);
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

function isAllowedManifestUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || (
      url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)
    );
  } catch (_error) {
    return false;
  }
}

async function checkForUpdates({ currentVersion, manifestUrl, ownerWindow } = {}) {
  const url = manifestUrl || process.env.UPDATE_MANIFEST_URL;
  if (!url || !isAllowedManifestUrl(url) || typeof fetch !== "function") return null;

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`Manifesto respondeu HTTP ${response.status}`);
    const manifest = await response.json();
    if (!manifest?.version || compareVersions(manifest.version, currentVersion) <= 0) return null;

    const downloadUrl = typeof manifest.url === "string" ? manifest.url : "";
    if (!isAllowedManifestUrl(downloadUrl)) return null;

    const result = await dialog.showMessageBox(ownerWindow, {
      type: "info",
      title: "Atualizacao disponivel",
      message: `O Controle SGQ ${manifest.version} esta disponivel.`,
      detail: "Abra a pagina de download para instalar a nova versao quando for conveniente.",
      buttons: ["Ver atualizacao", "Agora nao"],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    if (result.response === 0) await shell.openExternal(downloadUrl);
    return manifest;
  } catch (error) {
    console.warn("Verificacao de atualizacao ignorada:", error.message);
    return null;
  }
}

module.exports = { checkForUpdates, compareVersions };

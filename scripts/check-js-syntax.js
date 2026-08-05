const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const jsFiles = [
  "backend/server.js",
  "frontend/script.js",
  "frontend/procedimentos.js",
  "backend/routes/procedures.js",
  "backend/routes/admin.js",
  "backend/services/procedureRules.js",
  "backend/services/procedureAuth.js",
  "backend/services/procedureAudit.js",
  "backend/services/databaseBackup.js",
  "backend/services/procedureStorage.js",
  "backend/services/procedurePdf.js",
  "backend/services/procedureSceneGraph.js",
  "frontend/js/scene-graph-core.js",
  "frontend/js/scene-graph.js",
  "frontend/js/fabric-scene-renderer.js",
  "frontend/js/fabric-object-factory.js",
  "frontend/js/fabric-annotation-layer.js",
  "frontend/js/fabric-editor-history.js",
  "frontend/js/fabric-editor-session.js",
  "frontend/js/fabric-editor-transform.js",
  "frontend/js/fabric-editor-hierarchy.js",
  "frontend/js/fabric-editor-image.js",
  "frontend/js/fabric-editor-text.js",
  "frontend/js/fabric-editor-toolbar.js",
  "frontend/js/fabric-property-panel.js",
  "frontend/js/fabric-step-editor.js",
  "frontend/js/fabric-editor-manual-test.js",
  "frontend/js/pdf-render-hints.js",
  "backend/routes/nonconformities.js",
  "backend/services/nonconformityRules.js",
  "backend/services/nonconformityDatabase.js",
  "backend/services/nonconformityPdf.js",
  "frontend/nao-conformidades.js",
];

function appendJavaScriptFiles(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (file === path.join("frontend", "vendor")) continue;
      appendJavaScriptFiles(file);
    } else if (entry.isFile() && entry.name.endsWith(".js") && !jsFiles.includes(file)) {
      jsFiles.push(file);
    }
  }
}

["backend", "frontend", "scripts"].forEach(appendJavaScriptFiles);

let hasError = false;

for (const file of jsFiles) {
  if (!fs.existsSync(file)) {
    console.error(`Arquivo JS nao encontrado: ${file}`);
    hasError = true;
    continue;
  }

  const result = spawnSync(process.execPath, ["--check", file], {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    hasError = true;
    console.error(`\nErro de sintaxe em ${file}:`);
    if (result.stdout) console.error(result.stdout.trim());
    if (result.stderr) console.error(result.stderr.trim());
  }
}

if (hasError) {
  process.exit(1);
}

console.log("Sintaxe JavaScript validada com sucesso.");

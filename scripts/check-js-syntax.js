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
  "backend/routes/nonconformities.js",
  "backend/services/nonconformityRules.js",
  "backend/services/nonconformityDatabase.js",
  "backend/services/nonconformityPdf.js",
  "frontend/nao-conformidades.js",
];

const splitDir = path.join("frontend", "js", "procedimentos");

if (fs.existsSync(splitDir)) {
  for (const fileName of fs.readdirSync(splitDir).sort()) {
    if (fileName.endsWith(".js")) {
      jsFiles.push(path.join(splitDir, fileName));
    }
  }
}

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

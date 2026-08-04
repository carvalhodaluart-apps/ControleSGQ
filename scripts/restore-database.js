const fs = require("fs").promises;
const path = require("path");
const { initDatabase } = require("../backend/services/procedureDatabase");
const { restoreDatabaseBackup } = require("../backend/services/databaseBackup");

async function main() {
  const input = process.argv[2];
  if (!input) throw new Error("Informe o caminho do arquivo de backup JSON.");
  const backupPath = path.resolve(process.cwd(), input);
  const backup = JSON.parse(await fs.readFile(backupPath, "utf8"));
  await initDatabase();
  const result = await restoreDatabaseBackup(backup);
  console.log(`Backup restaurado: ${JSON.stringify(result.counts)}`);
  if (result.userCredentialsRestored === false) console.log("Usuarios existentes foram mantidos; o backup nao continha hashes de senha.");
}

main().catch((error) => {
  console.error(`Nao foi possivel restaurar o backup: ${error.message}`);
  process.exitCode = 1;
});

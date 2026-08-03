const fs = require("fs").promises;
const path = require("path");
const { initDatabase } = require("../backend/services/procedureDatabase");
const { createDatabaseBackup } = require("../backend/services/databaseBackup");

async function main() {
  await initDatabase();
  const backup = await createDatabaseBackup();
  const folder = path.resolve(__dirname, "..", "backups");
  await fs.mkdir(folder, { recursive: true });
  const stamp = backup.createdAt.replace(/[.:]/g, "-");
  const output = path.join(folder, `controle-sgq-${stamp}.json`);
  await fs.writeFile(output, `${JSON.stringify(backup, null, 2)}\n`, "utf8");
  console.log(`Backup criado em: ${output}`);
}

main().catch((error) => {
  console.error(`Nao foi possivel criar o backup: ${error.message}`);
  process.exitCode = 1;
});

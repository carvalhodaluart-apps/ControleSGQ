const assert = require("node:assert/strict");

const databaseModule = require.resolve("../backend/services/procedureDatabase");
let active = true;
let account;
require.cache[databaseModule] = {
  exports: {
    getDatabasePool: () => ({
      query: async () => ({ rows: active ? [account] : [] }),
    }),
  },
};

process.env.SESSION_SECRET = "security-check-secret";
process.env.QUALITY_PASSWORD = "quality-check-password";

async function run() {
  const { sanitizeImageData, sanitizePdfData } = require("../backend/services/securityInputRules");
  const { normalizeProcedure } = require("../backend/services/procedureRules");
  const auth = require("../backend/services/procedureAuth");
  const safeImage = `data:image/png;base64,${"A".repeat(32)}`;

  assert.equal(sanitizeImageData("javascript:alert(1)"), "");
  assert.equal(sanitizePdfData("data:application/pdf;base64,AA"), "data:application/pdf;base64,AA");
  const procedure = normalizeProcedure({
    title: "Teste",
    documentCode: "IT_NOVO_00",
    equipmentCode: "NOVO",
    customEquipmentImage: "javascript:alert(1)",
    sections: [{ images: ["javascript:alert(1)", safeImage], stepCards: [] }],
  });
  assert.equal(procedure.customEquipmentImage, "");
  assert.deepEqual(procedure.sections[0].images, [safeImage]);

  account = {
    userId: 7,
    username: "teste",
    displayName: "Teste",
    passwordHash: await auth.hashPassword("senha-segura-123"),
    role: "editor",
    active: true,
  };
  const session = await auth.createUserSession("teste", "senha-segura-123");
  let firstError;
  await auth.requireProcedureEditor({ headers: { authorization: `Bearer ${session.token}` } }, {}, (error) => { firstError = error; });
  assert.equal(firstError, undefined);
  active = false;
  let secondError;
  await auth.requireProcedureEditor({ headers: { authorization: `Bearer ${session.token}` } }, {}, (error) => { secondError = error; });
  assert.equal(secondError?.status, 401);
  assert.throws(() => auth.createQualitySession("A".repeat(257)), { status: 401 });
  console.log("Security checks: ok");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

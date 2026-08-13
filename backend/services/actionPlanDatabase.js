const crypto = require("crypto");
const { getDatabasePool } = require("./procedureDatabase");
const { normalizePlan } = require("./actionPlanRules");
const sharedStorage = require("./sharedProcedureStorage");

function createId() { return `pac-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`; }

function metadata(row) {
  return {
    planId: row.planId,
    documentCode: row.documentCode,
    title: row.title,
    type: row.content?.type || "",
    priority: row.content?.priority || "",
    status: row.status,
    origin: row.content?.origin || "",
    responsible: row.content?.responsible || "",
    openingDate: row.content?.openingDate || "",
    updatedAt: row.updatedAt,
  };
}

async function reserveCode(client) {
  const result = await client.query(`
    INSERT INTO action_plan_sequences (sequence_key, next_number) VALUES ('PAC', 2)
    ON CONFLICT (sequence_key) DO UPDATE SET next_number = action_plan_sequences.next_number + 1
    RETURNING next_number - 1 AS number
  `);
  return `PAC-${String(result.rows[0].number).padStart(4, "0")}`;
}

async function listActionPlans() {
  if (sharedStorage.isConfigured()) {
    const records = await sharedStorage.listModuleRecords("planos-acao");
    return Promise.all(records.map(async (record) => {
      const lock = await sharedStorage.getModuleLock("planos-acao", record.planId);
      return { ...metadata({ ...record, content: record, updatedAt: record.updatedAt }), ...(lock ? { editingBy: lock.displayName, editingMachine: lock.machine, editingAt: lock.acquiredAt } : {}) };
    }));
  }
  const result = await getDatabasePool().query(`
    SELECT plan_id AS "planId", document_code AS "documentCode", title, status, content,
      updated_at AS "updatedAt"
    FROM action_plan_documents ORDER BY updated_at DESC, document_code
  `);
  return result.rows.map(metadata);
}

async function getActionPlan(planId) {
  if (sharedStorage.isConfigured()) {
    const record = await sharedStorage.loadModuleRecord("planos-acao", planId);
    if (!record) return null;
    return { ...normalizePlan(record), planId: record.planId, documentCode: record.documentCode, title: record.title, status: record.status, updatedAt: record.updatedAt };
  }
  const result = await getDatabasePool().query(`
    SELECT plan_id AS "planId", document_code AS "documentCode", title, status, content,
      updated_at AS "updatedAt"
    FROM action_plan_documents WHERE plan_id = $1
  `, [String(planId || "")]);
  if (!result.rows.length) return null;
  const row = result.rows[0];
  return { ...normalizePlan(row.content), ...metadata(row), planId: row.planId, documentCode: row.documentCode, title: row.title, status: row.status };
}

async function createActionPlan(input, user) {
  if (sharedStorage.isConfigured()) {
    const planId = createId();
    const code = await sharedStorage.reserveModuleCode("planos-acao", "PAC-");
    const content = normalizePlan({ ...input, planId, documentCode: code, createdBy: user.displayName, updatedBy: user.displayName });
    return sharedStorage.saveModuleRecord("planos-acao", content);
  }
  const client = await getDatabasePool().connect();
  const planId = createId();
  try {
    await client.query("BEGIN");
    const code = await reserveCode(client);
    const content = normalizePlan({ ...input, planId, documentCode: code, createdBy: user.displayName, updatedBy: user.displayName });
    await client.query(`
      INSERT INTO action_plan_documents (plan_id, document_code, title, status, content, created_by, updated_by)
      VALUES ($1,$2,$3,$4,$5::jsonb,$6,$6)
    `, [planId, code, content.title, content.status, JSON.stringify(content), String(user.username || "qualidade")]);
    await client.query("COMMIT");
    return content;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

async function updateActionPlan(planId, input, user) {
  if (sharedStorage.isConfigured()) {
    const current = await sharedStorage.loadModuleRecord("planos-acao", planId);
    if (!current) throw Object.assign(new Error("Plano de aÃ§Ã£o nÃ£o encontrado."), { status: 404 });
    const content = normalizePlan({ ...input, planId: String(planId || ""), documentCode: current.documentCode, createdBy: current.createdBy || user.displayName, updatedBy: user.displayName });
    return sharedStorage.saveModuleRecord("planos-acao", content, input.updatedAt || null);
  }
  const content = normalizePlan({ ...input, planId: String(planId || "") });
  const result = await getDatabasePool().query(`
    UPDATE action_plan_documents SET title = $2, status = $3, content = $4::jsonb,
      updated_by = $5, updated_at = NOW() WHERE plan_id = $1
    RETURNING plan_id AS "planId", document_code AS "documentCode", title, status
  `, [content.planId, content.title, content.status, JSON.stringify(content), String(user.username || "qualidade")]);
  if (!result.rows.length) throw Object.assign(new Error("Plano de ação não encontrado."), { status: 404 });
  return { ...content, documentCode: result.rows[0].documentCode };
}

async function deleteActionPlan(planId) {
  if (sharedStorage.isConfigured()) {
    if (!await sharedStorage.deleteModuleRecord("planos-acao", planId)) throw Object.assign(new Error("Plano de aÃ§Ã£o nÃ£o encontrado."), { status: 404 });
    return;
  }
  const result = await getDatabasePool().query("DELETE FROM action_plan_documents WHERE plan_id = $1", [String(planId || "")]);
  if (!result.rowCount) throw Object.assign(new Error("Plano de ação não encontrado."), { status: 404 });
}

module.exports = { createActionPlan, deleteActionPlan, getActionPlan, listActionPlans, updateActionPlan };

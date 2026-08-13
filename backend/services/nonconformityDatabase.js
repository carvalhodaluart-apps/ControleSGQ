const crypto = require("crypto");
const { getDatabasePool } = require("./procedureDatabase");
const { normalizeNonconformity } = require("./nonconformityRules");
const sharedStorage = require("./sharedProcedureStorage");

function createId() {
  return `nc-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
}

function metadata(row) {
  return {
    nonconformityId: row.nonconformityId,
    documentCode: row.documentCode,
    title: row.title,
    status: row.status,
    issueDate: row.content?.issueDate || "",
    origin: row.content?.origin || "",
    sector: row.content?.sector || "",
    responsible: row.content?.responsible || "",
    updatedAt: row.updatedAt,
  };
}

async function reserveCode(client) {
  const result = await client.query(`
    INSERT INTO nonconformity_sequences (sequence_key, next_number)
    VALUES ('NC', 2)
    ON CONFLICT (sequence_key) DO UPDATE SET next_number = nonconformity_sequences.next_number + 1
    RETURNING next_number - 1 AS number
  `);
  return `NC_${String(result.rows[0].number).padStart(4, "0")}`;
}

async function listNonconformities() {
  if (sharedStorage.isConfigured()) {
    const records = await sharedStorage.listModuleRecords("nao-conformidades");
    return Promise.all(records.map(async (record) => {
      const lock = await sharedStorage.getModuleLock("nao-conformidades", record.nonconformityId);
      return { ...metadata({ ...record, content: record, updatedAt: record.updatedAt }), ...(lock ? { editingBy: lock.displayName, editingMachine: lock.machine, editingAt: lock.acquiredAt } : {}) };
    }));
  }
  const result = await getDatabasePool().query(`
    SELECT nonconformity_id AS "nonconformityId", document_code AS "documentCode", title,
      status, content, updated_at AS "updatedAt"
    FROM nonconformity_documents
    ORDER BY updated_at DESC, document_code
  `);
  return result.rows.map(metadata);
}

async function getNonconformity(nonconformityId) {
  if (sharedStorage.isConfigured()) {
    const record = await sharedStorage.loadModuleRecord("nao-conformidades", nonconformityId);
    if (!record) return null;
    return { ...normalizeNonconformity(record), documentCode: record.documentCode, title: record.title, status: record.status, nonconformityId: record.nonconformityId, updatedAt: record.updatedAt };
  }
  const result = await getDatabasePool().query(`
    SELECT nonconformity_id AS "nonconformityId", document_code AS "documentCode", title,
      status, content, updated_at AS "updatedAt"
    FROM nonconformity_documents WHERE nonconformity_id = $1
  `, [String(nonconformityId || "")]);
  if (!result.rows.length) return null;
  const row = result.rows[0];
  return { ...normalizeNonconformity(row.content), ...metadata(row), documentCode: row.documentCode, title: row.title, status: row.status };
}

async function createNonconformity(input, user) {
  if (sharedStorage.isConfigured()) {
    const id = createId();
    const code = await sharedStorage.reserveModuleCode("nao-conformidades", "NC_");
    const content = normalizeNonconformity({ ...input, nonconformityId: id, documentCode: code });
    return sharedStorage.saveModuleRecord("nao-conformidades", { ...content, createdBy: user.displayName, updatedBy: user.displayName });
  }
  const client = await getDatabasePool().connect();
  const id = createId();
  try {
    await client.query("BEGIN");
    const code = await reserveCode(client);
    const content = normalizeNonconformity({ ...input, nonconformityId: id, documentCode: code });
    await client.query(`
      INSERT INTO nonconformity_documents (nonconformity_id, document_code, title, status, content, created_by, updated_by)
      VALUES ($1,$2,$3,$4,$5::jsonb,$6,$6)
    `, [id, code, content.title, content.status, JSON.stringify(content), String(user.username || "qualidade")]);
    await client.query("COMMIT");
    return content;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function updateNonconformity(nonconformityId, input, user) {
  if (sharedStorage.isConfigured()) {
    const current = await sharedStorage.loadModuleRecord("nao-conformidades", nonconformityId);
    if (!current) throw Object.assign(new Error("NÃ£o conformidade nÃ£o encontrada."), { status: 404 });
    const content = normalizeNonconformity({ ...input, nonconformityId: String(nonconformityId || ""), documentCode: current.documentCode });
    return sharedStorage.saveModuleRecord("nao-conformidades", { ...content, createdBy: current.createdBy || user.displayName, updatedBy: user.displayName }, input.updatedAt || null);
  }
  const content = normalizeNonconformity({ ...input, nonconformityId: String(nonconformityId || "") });
  const result = await getDatabasePool().query(`
    UPDATE nonconformity_documents
    SET title = $2, status = $3, content = $4::jsonb, updated_by = $5, updated_at = NOW()
    WHERE nonconformity_id = $1
    RETURNING nonconformity_id AS "nonconformityId", document_code AS "documentCode", title, status, content
  `, [content.nonconformityId, content.title, content.status, JSON.stringify(content), String(user.username || "qualidade")]);
  if (!result.rows.length) throw Object.assign(new Error("Não conformidade não encontrada."), { status: 404 });
  return { ...content, documentCode: result.rows[0].documentCode };
}

async function deleteNonconformity(nonconformityId) {
  if (sharedStorage.isConfigured()) {
    if (!await sharedStorage.deleteModuleRecord("nao-conformidades", nonconformityId)) throw Object.assign(new Error("NÃ£o conformidade nÃ£o encontrada."), { status: 404 });
    return;
  }
  const result = await getDatabasePool().query("DELETE FROM nonconformity_documents WHERE nonconformity_id = $1", [String(nonconformityId || "")]);
  if (!result.rowCount) throw Object.assign(new Error("Não conformidade não encontrada."), { status: 404 });
}

module.exports = { createNonconformity, deleteNonconformity, getNonconformity, listNonconformities, updateNonconformity };

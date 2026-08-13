const crypto = require("crypto");
const { getDatabasePool } = require("./procedureDatabase");
const { normalizeInstrument } = require("./instrumentRules");
const sharedStorage = require("./sharedProcedureStorage");

function createId() { return `ins-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`; }
function metadata(row) { return { instrumentId: row.instrumentId, documentCode: row.documentCode, name: row.name, type: row.content?.type || "", sector: row.content?.sector || "", serialNumber: row.content?.serialNumber || "", situation: row.situation, criticality: row.content?.criticality || "", nextCalibrationDate: row.content?.planning?.nextCalibrationDate || "", updatedAt: row.updatedAt }; }
async function reserveCode(client) { const result = await client.query(`INSERT INTO instrument_sequences (sequence_key, next_number) VALUES ('INS', 2) ON CONFLICT (sequence_key) DO UPDATE SET next_number = instrument_sequences.next_number + 1 RETURNING next_number - 1 AS number`); return `INS-${String(result.rows[0].number).padStart(4, "0")}`; }

async function listInstruments() {
  if (sharedStorage.isConfigured()) {
    const records = await sharedStorage.listModuleRecords("instrumentos");
    return Promise.all(records.map(async (record) => {
      const lock = await sharedStorage.getModuleLock("instrumentos", record.instrumentId);
      return { ...metadata({ ...record, content: record, updatedAt: record.updatedAt }), ...(lock ? { editingBy: lock.displayName, editingMachine: lock.machine, editingAt: lock.acquiredAt } : {}) };
    }));
  }
  const result = await getDatabasePool().query(`SELECT instrument_id AS "instrumentId", document_code AS "documentCode", name, situation, content, updated_at AS "updatedAt" FROM metrology_instruments ORDER BY document_code`);
  return result.rows.map(metadata);
}

async function getInstrument(id) {
  if (sharedStorage.isConfigured()) {
    const record = await sharedStorage.loadModuleRecord("instrumentos", id);
    if (!record) return null;
    return { ...normalizeInstrument(record), instrumentId: record.instrumentId, documentCode: record.documentCode, name: record.name, situation: record.situation, updatedAt: record.updatedAt };
  }
  const result = await getDatabasePool().query(`SELECT instrument_id AS "instrumentId", document_code AS "documentCode", name, situation, content, updated_at AS "updatedAt" FROM metrology_instruments WHERE instrument_id = $1`, [String(id || "")]);
  if (!result.rows.length) return null;
  const row = result.rows[0];
  return { ...normalizeInstrument(row.content), ...metadata(row), instrumentId: row.instrumentId, documentCode: row.documentCode, name: row.name, situation: row.situation };
}

async function createInstrument(input, user) {
  if (sharedStorage.isConfigured()) {
    const instrumentId = createId();
    const code = await sharedStorage.reserveModuleCode("instrumentos", "INS-");
    const content = normalizeInstrument({ ...input, instrumentId, documentCode: code, createdBy: user.displayName, updatedBy: user.displayName });
    return sharedStorage.saveModuleRecord("instrumentos", content);
  }
  const client = await getDatabasePool().connect();
  const instrumentId = createId();
  try {
    await client.query("BEGIN");
    const code = await reserveCode(client);
    const content = normalizeInstrument({ ...input, instrumentId, documentCode: code, createdBy: user.displayName, updatedBy: user.displayName });
    await client.query(`INSERT INTO metrology_instruments (instrument_id, document_code, name, situation, content, created_by, updated_by) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$6)`, [instrumentId, code, content.name, content.situation, JSON.stringify(content), String(user.username || "qualidade")]);
    await client.query("COMMIT");
    return content;
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

async function updateInstrument(id, input, user) {
  if (sharedStorage.isConfigured()) {
    const current = await sharedStorage.loadModuleRecord("instrumentos", id);
    if (!current) throw Object.assign(new Error("Instrumento nao encontrado."), { status: 404 });
    const content = normalizeInstrument({ ...input, instrumentId: String(id || ""), documentCode: current.documentCode, createdBy: current.createdBy || user.displayName, updatedBy: user.displayName });
    return sharedStorage.saveModuleRecord("instrumentos", content, input.updatedAt || null);
  }
  const content = normalizeInstrument({ ...input, instrumentId: String(id || "") });
  const result = await getDatabasePool().query(`UPDATE metrology_instruments SET name = $2, situation = $3, content = $4::jsonb, updated_by = $5, updated_at = NOW() WHERE instrument_id = $1 RETURNING instrument_id AS "instrumentId", document_code AS "documentCode"`, [content.instrumentId, content.name, content.situation, JSON.stringify(content), String(user.username || "qualidade")]);
  if (!result.rows.length) throw Object.assign(new Error("Instrumento nao encontrado."), { status: 404 });
  return { ...content, documentCode: result.rows[0].documentCode };
}

async function deleteInstrument(id) {
  if (sharedStorage.isConfigured()) {
    if (!await sharedStorage.deleteModuleRecord("instrumentos", id)) throw Object.assign(new Error("Instrumento nao encontrado."), { status: 404 });
    return;
  }
  const result = await getDatabasePool().query("DELETE FROM metrology_instruments WHERE instrument_id = $1", [String(id || "")]);
  if (!result.rowCount) throw Object.assign(new Error("Instrumento nao encontrado."), { status: 404 });
}

module.exports = { createInstrument, deleteInstrument, getInstrument, listInstruments, updateInstrument };

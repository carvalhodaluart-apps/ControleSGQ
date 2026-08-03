const { getDatabasePool } = require("./procedureDatabase");

const BACKUP_VERSION = 1;
const TABLES = ["masterDocuments", "procedureDocuments", "sequences", "reservations", "configuration", "users", "audit", "actionPlans", "instruments"];

async function createDatabaseBackup() {
  const pool = getDatabasePool();
  const [master, procedures, sequences, reservations, configuration, users, audit, actionPlans, instruments] = await Promise.all([
    pool.query("SELECT * FROM master_documents ORDER BY document_code"),
    pool.query("SELECT * FROM procedure_documents ORDER BY procedure_id"),
    pool.query("SELECT * FROM document_number_sequences ORDER BY document_type, sector, sector_prefix"),
    pool.query("SELECT * FROM procedure_number_reservations ORDER BY document_type, sector, sector_prefix, document_number"),
    pool.query("SELECT * FROM procedure_configuration WHERE configuration_id = 1"),
    pool.query("SELECT * FROM app_users ORDER BY username"),
    pool.query("SELECT * FROM document_audit_log ORDER BY audit_id"),
    pool.query("SELECT * FROM action_plan_documents ORDER BY document_code"),
    pool.query("SELECT * FROM metrology_instruments ORDER BY document_code"),
  ]);
  return {
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    tables: {
      masterDocuments: master.rows,
      procedureDocuments: procedures.rows,
      sequences: sequences.rows,
      reservations: reservations.rows,
      configuration: configuration.rows,
      users: users.rows,
      audit: audit.rows,
      actionPlans: actionPlans.rows,
      instruments: instruments.rows,
    },
  };
}

function validateBackup(backup) {
  if (!backup || backup.version !== BACKUP_VERSION || !backup.tables) throw new Error("Arquivo de backup invalido.");
  for (const table of TABLES) {
    if (table === "reservations" && !Object.prototype.hasOwnProperty.call(backup.tables, table)) { backup.tables[table] = []; continue; }
    if (table === "actionPlans" && !Object.prototype.hasOwnProperty.call(backup.tables, table)) { backup.tables[table] = []; continue; }
    if (table === "instruments" && !Object.prototype.hasOwnProperty.call(backup.tables, table)) { backup.tables[table] = []; continue; }
    if (!Array.isArray(backup.tables[table])) throw new Error(`Backup sem a tabela ${table}.`);
    if (backup.tables[table].length > 10000) throw new Error("Backup excede o limite de registros.");
  }
  return backup;
}

async function restoreDatabaseBackup(input) {
  const backup = validateBackup(input);
  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    await client.query("TRUNCATE master_documents, procedure_documents, document_number_sequences, procedure_number_reservations, procedure_configuration, app_users, document_audit_log, action_plan_documents, action_plan_sequences, metrology_instruments, instrument_sequences RESTART IDENTITY CASCADE");
    for (const row of backup.tables.masterDocuments) {
      await client.query(`
        INSERT INTO master_documents (procedure_id, document_code, document_type, sector, document_number, title, revision, elaborator, elaboration_date, approver, approval_date, status, equipment_code, document_original_location, document_public_location, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,COALESCE($16,NOW()),COALESCE($17,NOW()))
      `, [row.procedure_id, row.document_code, row.document_type, row.sector, row.document_number, row.title, row.revision, row.elaborator, row.elaboration_date, row.approver, row.approval_date, row.status, row.equipment_code, row.document_original_location, row.document_public_location, row.created_at, row.updated_at]);
    }
    for (const row of backup.tables.procedureDocuments) {
      await client.query(`INSERT INTO procedure_documents (procedure_id, content, created_at, updated_at) VALUES ($1,$2::jsonb,COALESCE($3,NOW()),COALESCE($4,NOW()))`, [row.procedure_id, JSON.stringify(row.content), row.created_at, row.updated_at]);
    }
    for (const row of backup.tables.sequences) {
      await client.query(`INSERT INTO document_number_sequences (document_type, sector, sector_prefix, next_number) VALUES ($1,$2,$3,$4)`, [row.document_type, row.sector, row.sector_prefix || "", row.next_number]);
    }
    for (const row of backup.tables.reservations) {
      await client.query(`INSERT INTO procedure_number_reservations (procedure_id, document_type, sector, sector_prefix, document_number, created_at) VALUES ($1,$2,$3,$4,$5,COALESCE($6,NOW()))`, [row.procedure_id, row.document_type, row.sector, row.sector_prefix || "", row.document_number, row.created_at]);
    }
    for (const row of backup.tables.configuration) {
      await client.query(`INSERT INTO procedure_configuration (configuration_id, document_types, sectors, quality_fields, cover, nonconformity, updated_at) VALUES (1,$1::jsonb,$2::jsonb,$3::jsonb,$4::jsonb,$5::jsonb,COALESCE($6,NOW()))`, [JSON.stringify(row.document_types), JSON.stringify(row.sectors), JSON.stringify(row.quality_fields), JSON.stringify(row.cover), JSON.stringify(row.nonconformity || {}), row.updated_at]);
    }
    for (const row of backup.tables.users) {
      await client.query(`INSERT INTO app_users (user_id, username, display_name, password_hash, role, active, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7,NOW()),COALESCE($8,NOW()))`, [row.user_id, row.username, row.display_name, row.password_hash, row.role, row.active, row.created_at, row.updated_at]);
    }
    for (const row of backup.tables.audit) {
      await client.query(`INSERT INTO document_audit_log (audit_id, procedure_id, action, actor_username, actor_role, details, created_at) VALUES ($1,$2,$3,$4,$5,$6::jsonb,COALESCE($7,NOW()))`, [row.audit_id, row.procedure_id, row.action, row.actor_username, row.actor_role, JSON.stringify(row.details || {}), row.created_at]);
    }
    for (const row of backup.tables.actionPlans) {
      await client.query(`INSERT INTO action_plan_documents (plan_id, document_code, title, status, content, created_by, updated_by, created_at, updated_at) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,COALESCE($8,NOW()),COALESCE($9,NOW()))`, [row.plan_id, row.document_code, row.title, row.status, JSON.stringify(row.content || {}), row.created_by, row.updated_by, row.created_at, row.updated_at]);
    }
    await client.query(`
      INSERT INTO action_plan_sequences (sequence_key, next_number)
      SELECT 'PAC', COALESCE(MAX(CAST(SUBSTRING(document_code FROM 'PAC-([0-9]+)$') AS INTEGER)) + 1, 1)
      FROM action_plan_documents
      ON CONFLICT (sequence_key) DO UPDATE SET next_number = EXCLUDED.next_number
    `);
    for (const row of backup.tables.instruments) {
      await client.query(`INSERT INTO metrology_instruments (instrument_id, document_code, name, situation, content, created_by, updated_by, created_at, updated_at) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,COALESCE($8,NOW()),COALESCE($9,NOW()))`, [row.instrument_id, row.document_code, row.name, row.situation, JSON.stringify(row.content || {}), row.created_by, row.updated_by, row.created_at, row.updated_at]);
    }
    await client.query(`INSERT INTO instrument_sequences (sequence_key, next_number) SELECT 'INS', COALESCE(MAX(CAST(SUBSTRING(document_code FROM 'INS-([0-9]+)$') AS INTEGER)) + 1, 1) FROM metrology_instruments ON CONFLICT (sequence_key) DO UPDATE SET next_number = EXCLUDED.next_number`);
    await client.query(`SELECT setval(pg_get_serial_sequence('app_users', 'user_id'), COALESCE(MAX(user_id), 1), MAX(user_id) IS NOT NULL) FROM app_users`);
    await client.query(`SELECT setval(pg_get_serial_sequence('document_audit_log', 'audit_id'), COALESCE(MAX(audit_id), 1), MAX(audit_id) IS NOT NULL) FROM document_audit_log`);
    await client.query("COMMIT");
    return { restored: true, counts: Object.fromEntries(TABLES.map((table) => [table, backup.tables[table].length])) };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { createDatabaseBackup, restoreDatabaseBackup, validateBackup };

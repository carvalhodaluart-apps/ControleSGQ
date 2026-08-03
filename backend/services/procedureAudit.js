const { getDatabasePool } = require("./procedureDatabase");

async function recordAudit({ procedureId = null, action, user = {}, details = {} }) {
  if (!action) return;
  if (action === "saved") {
    const recent = await getDatabasePool().query(`
      SELECT 1 FROM document_audit_log
      WHERE procedure_id IS NOT DISTINCT FROM $1
        AND action = $2 AND actor_username = $3
        AND created_at > NOW() - INTERVAL '5 seconds'
      LIMIT 1
    `, [procedureId, action, String(user.username || "qualidade")]);
    if (recent.rows.length) return;
  }
  await getDatabasePool().query(`
    INSERT INTO document_audit_log (procedure_id, action, actor_username, actor_role, details)
    VALUES ($1, $2, $3, $4, $5::jsonb)
  `, [
    procedureId,
    String(action).slice(0, 80),
    String(user.username || "qualidade").slice(0, 120),
    String(user.role || "quality").slice(0, 40),
    JSON.stringify(details || {}),
  ]);
}

async function listAudit({ procedureId = "", actorUsername = "", date = "", limit = 100 } = {}) {
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100));
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) ? String(date) : "";
  const result = await getDatabasePool().query(`
    SELECT audit_id AS "auditId", procedure_id AS "procedureId", action,
      actor_username AS "actorUsername", actor_role AS "actorRole",
      details, created_at AS "createdAt"
    FROM document_audit_log
    WHERE ($1 = '' OR procedure_id = $1)
      AND ($2 = '' OR actor_username ILIKE '%' || $2 || '%')
      AND ($3 = '' OR (created_at >= $3::date AND created_at < ($3::date + INTERVAL '1 day')))
    ORDER BY created_at DESC
    LIMIT $4
  `, [String(procedureId || ""), String(actorUsername || "").trim().slice(0, 120), safeDate, safeLimit]);
  return result.rows;
}

module.exports = { listAudit, recordAudit };

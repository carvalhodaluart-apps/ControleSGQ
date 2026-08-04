const express = require("express");
const { getDatabasePool } = require("../services/procedureDatabase");
const { getRequestUser, hashPassword, requireQuality } = require("../services/procedureAuth");
const { createDatabaseBackup, restoreDatabaseBackup } = require("../services/databaseBackup");
const { listAudit, recordAudit } = require("../services/procedureAudit");
const { sendError } = require("../services/httpResponse");

const router = express.Router();

function handleError(res, error) {
  sendError(res, error);
}

router.get("/backup", requireQuality, async (req, res) => {
  try {
    const backup = await createDatabaseBackup({ includeUserCredentials: process.env.BACKUP_INCLUDE_USER_CREDENTIALS === "true" });
    await recordAudit({ action: "backup", user: getRequestUser(req), details: { counts: Object.fromEntries(Object.entries(backup.tables).map(([key, rows]) => [key, rows.length])) } });
    const filename = `controle-sgq-backup-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(JSON.stringify(backup, null, 2));
  } catch (error) {
    handleError(res, error);
  }
});

router.post("/restore", requireQuality, async (req, res) => {
  try {
    if ((process.env.NODE_ENV === "production" || process.env.RENDER) && process.env.ALLOW_RESTORE !== "true") {
      return res.status(403).json({ error: "Restauracao bloqueada neste ambiente." });
    }
    const result = await restoreDatabaseBackup(req.body?.backup || req.body);
    await recordAudit({ action: "restore", user: getRequestUser(req), details: result.counts });
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
});

router.get("/audit", requireQuality, async (req, res) => {
  try {
    res.json({ audit: await listAudit({ procedureId: req.query.procedureId, actorUsername: req.query.actorUsername, date: req.query.date, limit: req.query.limit }) });
  } catch (error) {
    handleError(res, error);
  }
});

router.get("/users", requireQuality, async (_req, res) => {
  try {
    const result = await getDatabasePool().query(`
      SELECT user_id AS "userId", username, display_name AS "displayName", role, active, created_at AS "createdAt"
      FROM app_users ORDER BY username
    `);
    res.json({ users: result.rows });
  } catch (error) {
    handleError(res, error);
  }
});

router.post("/users", requireQuality, async (req, res) => {
  try {
    const username = String(req.body?.username || "").trim().toLowerCase();
    const displayName = String(req.body?.displayName || "").trim();
    const role = String(req.body?.role || "editor").trim();
    const password = String(req.body?.password || "");
    if (!/^[a-z0-9._-]{3,60}$/.test(username)) throw Object.assign(new Error("Usuario invalido."), { status: 400 });
    if (!displayName || displayName.length > 120) throw Object.assign(new Error("Nome de exibição invalido."), { status: 400 });
    if (!["editor", "manager"].includes(role)) throw Object.assign(new Error("Perfil de usuario invalido."), { status: 400 });
    if (password.length < 8) throw Object.assign(new Error("A senha deve ter pelo menos 8 caracteres."), { status: 400 });
    const passwordHash = await hashPassword(password);
    const result = await getDatabasePool().query(`
      INSERT INTO app_users (username, display_name, password_hash, role)
      VALUES ($1,$2,$3,$4)
      RETURNING user_id AS "userId", username, display_name AS "displayName", role, active
    `, [username, displayName, passwordHash, role]);
    await recordAudit({ action: "user-created", user: getRequestUser(req), details: { username, role } });
    res.status(201).json({ user: result.rows[0] });
  } catch (error) {
    if (error.code === "23505") error.status = 409;
    handleError(res, error);
  }
});

router.patch("/users/:id", requireQuality, async (req, res) => {
  try {
    const active = Boolean(req.body?.active);
    const result = await getDatabasePool().query(`UPDATE app_users SET active = $2, updated_at = NOW() WHERE user_id = $1 RETURNING user_id AS "userId", username, display_name AS "displayName", role, active`, [req.params.id, active]);
    if (!result.rows.length) return res.status(404).json({ error: "Usuario não encontrado." });
    await recordAudit({ action: active ? "user-enabled" : "user-disabled", user: getRequestUser(req), details: { userId: req.params.id } });
    res.json({ user: result.rows[0] });
  } catch (error) {
    handleError(res, error);
  }
});

module.exports = router;

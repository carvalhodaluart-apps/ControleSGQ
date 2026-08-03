const crypto = require("crypto");

const sessions = new Map();
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function authError(message, status = 401) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(String(password || ""), salt, 64, (error, derivedKey) => {
      if (error) return reject(error);
      resolve(`scrypt:${salt}:${derivedKey.toString("hex")}`);
    });
  });
}

async function verifyPassword(password, storedHash) {
  const [algorithm, salt, expected] = String(storedHash || "").split(":");
  if (algorithm !== "scrypt" || !salt || !expected) return false;
  const calculated = await hashPassword(password, salt);
  return safeEqual(calculated, storedHash);
}

function createSession(user) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { expiresAt: Date.now() + SESSION_TTL_MS, user });
  return { token, expiresIn: SESSION_TTL_MS, user };
}

function createQualitySession(password) {
  const expectedPassword = process.env.QUALITY_PASSWORD;
  if (!expectedPassword) throw authError("A senha da qualidade nao foi configurada no servidor.", 503);
  if (!safeEqual(password, expectedPassword)) throw authError("Senha incorreta.");
  return createSession({ username: "qualidade", displayName: "Qualidade", role: "manager" });
}

async function createUserSession(username, password) {
  const normalizedUsername = String(username || "").trim().toLowerCase();
  if (!normalizedUsername || !password) throw authError("Informe usuario e senha.");
  const { getDatabasePool } = require("./procedureDatabase");
  const result = await getDatabasePool().query(`
    SELECT user_id AS "userId", username, display_name AS "displayName", password_hash AS "passwordHash", role
    FROM app_users WHERE username = $1 AND active = TRUE
  `, [normalizedUsername]);
  const account = result.rows[0];
  if (!account || !(await verifyPassword(password, account.passwordHash))) throw authError("Usuario ou senha incorretos.");
  return createSession({ userId: account.userId, username: account.username, displayName: account.displayName, role: account.role });
}

function getValidSession(token) {
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return session;
}

function requireRole(roles) {
  const allowedRoles = new Set(roles);
  return (req, _res, next) => {
    const authorization = String(req.headers.authorization || "");
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    const session = getValidSession(token);
    if (!session) return next(authError("Acesso autenticado necessario."));
    if (!allowedRoles.has(session.user.role)) return next(authError("Permissao insuficiente.", 403));
    req.qualityToken = token;
    req.user = session.user;
    return next();
  };
}

const requireManager = requireRole(["quality", "manager"]);
const requireQuality = requireManager;
const requireProcedureEditor = requireRole(["quality", "manager", "editor"]);

function getRequestUser(req) {
  return req.user || { username: "qualidade", role: "manager", displayName: "Qualidade" };
}

module.exports = {
  createQualitySession,
  createUserSession,
  getRequestUser,
  hashPassword,
  requireManager,
  requireProcedureEditor,
  requireQuality,
  verifyPassword,
};

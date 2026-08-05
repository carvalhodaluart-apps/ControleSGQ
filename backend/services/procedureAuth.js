const crypto = require("crypto");

const sessions = new Map();
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const sessionCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions) if (session.expiresAt <= now) sessions.delete(token);
}, 15 * 60 * 1000);
sessionCleanupTimer.unref?.();

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

function encodeBase64Url(value) {
  return Buffer.from(value).toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function decodeBase64Url(value) {
  const normalized = String(value || "").replaceAll("-", "+").replaceAll("_", "/");
  return Buffer.from(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="), "base64").toString("utf8");
}

function getSigningSecret() {
  const secret = process.env.SESSION_SECRET || process.env.JWT_SECRET || "";
  if (secret) return secret;
  if (process.env.NODE_ENV === "production" || process.env.RENDER) {
    throw authError("SESSION_SECRET precisa ser configurado no servidor.", 503);
  }
  return process.env.QUALITY_PASSWORD || "";
}

function assertSessionSecret() {
  getSigningSecret();
}

function signTokenPayload(payload) {
  const secret = getSigningSecret();
  if (!secret) return "";
  return encodeBase64Url(crypto.createHmac("sha256", secret).update(payload).digest());
}

function createSignedToken(user, expiresAt) {
  const payload = encodeBase64Url(JSON.stringify({ expiresAt, user }));
  const signature = signTokenPayload(payload);
  if (!signature) return "";
  return `v1.${payload}.${signature}`;
}

function readSignedSession(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;
  const [, payload, signature] = parts;
  const expectedSignature = signTokenPayload(payload);
  if (!expectedSignature || !safeEqual(signature, expectedSignature)) return null;
  try {
    const session = JSON.parse(decodeBase64Url(payload));
    if (!session?.user || session.expiresAt <= Date.now()) return null;
    return { expiresAt: session.expiresAt, user: session.user };
  } catch (_error) {
    return null;
  }
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
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const token = createSignedToken(user, expiresAt) || crypto.randomBytes(32).toString("hex");
  sessions.set(token, { expiresAt, user });
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
  const session = sessions.get(token) || readSignedSession(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  if (!sessions.has(token)) sessions.set(token, session);
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
  assertSessionSecret,
  requireManager,
  requireProcedureEditor,
  requireQuality,
  verifyPassword,
};

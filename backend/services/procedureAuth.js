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

function createQualitySession(password) {
  const expectedPassword = process.env.QUALITY_PASSWORD;
  if (!expectedPassword) throw authError("A senha da qualidade não foi configurada no servidor.", 503);
  if (!safeEqual(password, expectedPassword)) throw authError("Senha incorreta.", 401);

  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return { token, expiresIn: SESSION_TTL_MS };
}

function isValidQualitySession(token) {
  const expiresAt = sessions.get(token);
  if (!expiresAt) return false;
  if (expiresAt <= Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function requireQuality(req, _res, next) {
  const authorization = String(req.headers.authorization || "");
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!isValidQualitySession(token)) return next(authError("Acesso da qualidade necessário.", 401));
  req.qualityToken = token;
  return next();
}

module.exports = { createQualitySession, requireQuality };

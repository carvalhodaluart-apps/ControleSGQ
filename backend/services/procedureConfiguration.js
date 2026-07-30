const { Pool } = require("pg");
const {
  getDefaultConfiguration,
  setProcedureConfiguration,
} = require("./procedureRules");

let pool;

function getPool() {
  if (pool) return pool;
  if (!process.env.DATABASE_URL) {
    const error = new Error("DATABASE_URL não configurada para o PostgreSQL.");
    error.status = 503;
    throw error;
  }
  const useSsl = process.env.DATABASE_SSL === "true" || /neon\.tech|sslmode=require/i.test(process.env.DATABASE_URL);
  pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: useSsl ? { rejectUnauthorized: false } : false });
  return pool;
}

function text(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function keyFor(value, fallback) {
  return text(value, fallback)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || fallback;
}

function isActive(value) {
  return value !== false && value !== 0 && String(value).toLowerCase() !== "false";
}

function normalizeEntries(entries, defaults) {
  const source = Array.isArray(entries) ? entries : defaults;
  return source.map((entry, index) => ({
    key: keyFor(entry?.key, `${defaults[0]?.key || "item"}-${index + 1}`),
    label: text(entry?.label),
    prefix: text(entry?.prefix).toUpperCase(),
    active: isActive(entry?.active),
  }));
}

function normalizeQualityFields(entries, defaults) {
  const source = Array.isArray(entries) ? entries : defaults;
  const provided = new Map(source.map((entry) => [text(entry?.key), entry]));
  return defaults.map((defaultField) => {
    const entry = provided.get(defaultField.key) || defaultField;
    return {
      key: defaultField.key,
      // Os nomes pertencem ao modelo do SGQ; esta tela só controla a exibição.
      label: defaultField.label,
      active: isActive(entry.active),
    };
  });
}

function normalizeCover(cover, defaults) {
  const validPositions = new Set(["top-left", "top-center", "top-right", "center-left", "center", "center-right", "bottom-left", "bottom-center", "bottom-right", "custom"]);
  const imageData = text(cover?.imageData);
  if (imageData && !/^data:image\/(?:png|jpe?g|webp);base64,/i.test(imageData)) {
    throw configurationError("A imagem da capa precisa ser PNG, JPG ou WebP.");
  }
  if (imageData.length > 12_000_000) throw configurationError("A imagem da capa é grande demais. Importe uma imagem menor.");
  const coordinate = (value, fallback) => Number.isFinite(Number(value)) ? Math.max(0, Math.min(1, Number(value))) : fallback;
  return {
    imageData,
    overlayPosition: validPositions.has(cover?.overlayPosition) ? cover.overlayPosition : defaults.overlayPosition,
    overlayX: coordinate(cover?.overlayX, defaults.overlayX),
    overlayY: coordinate(cover?.overlayY, defaults.overlayY),
  };
}

function normalizeConfiguration(input = {}) {
  const defaults = getDefaultConfiguration();
  const configuration = {
    documentTypes: normalizeEntries(input.documentTypes, defaults.documentTypes),
    sectors: normalizeEntries(input.sectors, defaults.sectors),
    qualityFields: normalizeQualityFields(input.qualityFields, defaults.qualityFields),
    cover: normalizeCover(input.cover, defaults.cover),
  };
  validateConfiguration(configuration);
  return configuration;
}

function validateConfiguration(configuration) {
  for (const collectionName of ["documentTypes", "sectors"]) {
    const entries = configuration[collectionName];
    if (!entries.length || !entries.some((entry) => entry.active)) {
      throw configurationError(`Mantenha pelo menos um ${collectionName === "documentTypes" ? "tipo de documento" : "setor"} ativo.`);
    }
    const keys = new Set();
    const prefixes = new Set();
    entries.forEach((entry) => {
      if (!entry.label || !entry.prefix || !/^[A-Z0-9]{1,8}$/.test(entry.prefix)) {
        throw configurationError("Preencha nome e sigla válidos nas configurações.");
      }
      if (keys.has(entry.key) || prefixes.has(entry.prefix)) throw configurationError("Não é permitido repetir nomes técnicos ou siglas.");
      keys.add(entry.key);
      prefixes.add(entry.prefix);
    });
  }
}

function configurationError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

async function ensureProcedureConfiguration() {
  const defaults = getDefaultConfiguration();
  await getPool().query(`
    INSERT INTO procedure_configuration (configuration_id, document_types, sectors, quality_fields, cover)
    VALUES (1, $1::jsonb, $2::jsonb, $3::jsonb, $4::jsonb)
    ON CONFLICT (configuration_id) DO NOTHING
  `, [JSON.stringify(defaults.documentTypes), JSON.stringify(defaults.sectors), JSON.stringify(defaults.qualityFields), JSON.stringify(defaults.cover)]);
  const configuration = await getProcedureConfiguration();
  setProcedureConfiguration(configuration);
  return configuration;
}

async function getProcedureConfiguration() {
  const result = await getPool().query(`
    SELECT document_types AS "documentTypes", sectors, quality_fields AS "qualityFields", cover, updated_at AS "updatedAt"
    FROM procedure_configuration
    WHERE configuration_id = 1
  `);
  if (!result.rows.length) return normalizeConfiguration();
  return { ...normalizeConfiguration(result.rows[0]), updatedAt: result.rows[0].updatedAt };
}

async function saveProcedureConfiguration(input) {
  const configuration = normalizeConfiguration(input);
  const result = await getPool().query(`
    UPDATE procedure_configuration
    SET document_types = $1::jsonb, sectors = $2::jsonb, quality_fields = $3::jsonb, cover = $4::jsonb, updated_at = NOW()
    WHERE configuration_id = 1
    RETURNING updated_at AS "updatedAt"
  `, [JSON.stringify(configuration.documentTypes), JSON.stringify(configuration.sectors), JSON.stringify(configuration.qualityFields), JSON.stringify(configuration.cover)]);
  setProcedureConfiguration(configuration);
  return { ...configuration, updatedAt: result.rows[0]?.updatedAt || null };
}

module.exports = { ensureProcedureConfiguration, getProcedureConfiguration, saveProcedureConfiguration };

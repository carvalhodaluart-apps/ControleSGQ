const IMAGE_DATA_URI = /^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/]+={0,2}$/i;
const ASSET_PREFIX = "@@controle-sgq-asset:image-";
const ASSET_SUFFIX = "@@";
const MAX_ASSET_COUNT = 1000;

function isObject(value) {
  return Boolean(value) && typeof value === "object";
}

function defineEntry(target, key, value) {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

function unpackEmbeddedAssets(procedure) {
  if (!isObject(procedure) || Array.isArray(procedure)) return procedure;
  if (!Object.prototype.hasOwnProperty.call(procedure, "_embeddedAssets")) return procedure;
  const sourceAssets = isObject(procedure._embeddedAssets) && !Array.isArray(procedure._embeddedAssets)
    ? procedure._embeddedAssets
    : {};
  const entries = Object.entries(sourceAssets);
  if (entries.length > MAX_ASSET_COUNT) {
    const error = new Error("O procedimento possui imagens demais.");
    error.status = 413;
    throw error;
  }
  const assets = new Map();
  entries.forEach(([reference, image]) => {
    if (!reference.startsWith(ASSET_PREFIX) || !reference.endsWith(ASSET_SUFFIX) || !IMAGE_DATA_URI.test(String(image || ""))) {
      const error = new Error("A tabela de imagens do procedimento é inválida.");
      error.status = 400;
      throw error;
    }
    assets.set(reference, image);
  });

  const visit = (value) => {
    if (typeof value === "string") return assets.get(value) || value;
    if (Array.isArray(value)) return value.map(visit);
    if (!isObject(value)) return value;
    const result = {};
    Object.entries(value).forEach(([key, child]) => {
      if (key === "_embeddedAssets") return;
      defineEntry(result, assets.get(key) || key, visit(child));
    });
    return result;
  };

  return visit(procedure);
}

function packEmbeddedAssets(procedure) {
  const source = unpackEmbeddedAssets(procedure);
  if (!isObject(source) || Array.isArray(source)) return source;
  const assetByImage = new Map();
  const assets = {};

  const referenceFor = (image) => {
    if (assetByImage.has(image)) return assetByImage.get(image);
    const reference = `${ASSET_PREFIX}${assetByImage.size + 1}${ASSET_SUFFIX}`;
    assetByImage.set(image, reference);
    assets[reference] = image;
    return reference;
  };

  const visit = (value) => {
    if (typeof value === "string") return IMAGE_DATA_URI.test(value) ? referenceFor(value) : value;
    if (Array.isArray(value)) return value.map(visit);
    if (!isObject(value)) return value;
    const result = {};
    Object.entries(value).forEach(([key, child]) => {
      const packedKey = IMAGE_DATA_URI.test(key) ? referenceFor(key) : key;
      defineEntry(result, packedKey, visit(child));
    });
    return result;
  };

  const packed = visit(source);
  if (Object.keys(assets).length) packed._embeddedAssets = assets;
  return packed;
}

module.exports = { packEmbeddedAssets, unpackEmbeddedAssets };

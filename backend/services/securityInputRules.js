const IMAGE_DATA_URI_PATTERN = /^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/]+={0,2}$/i;
const PDF_DATA_URI_PATTERN = /^data:application\/pdf;base64,[A-Za-z0-9+/]+={0,2}$/i;

function sanitizeImageData(value, maxLength = 12_000_000) {
  const image = String(value ?? "").trim();
  if (!image || image.length > maxLength || !IMAGE_DATA_URI_PATTERN.test(image)) return "";
  return image;
}

function sanitizePdfData(value, maxLength = 10 * 1024 * 1024) {
  const pdf = String(value ?? "").trim();
  if (!pdf || pdf.length > maxLength || !PDF_DATA_URI_PATTERN.test(pdf)) return "";
  return pdf;
}

module.exports = { IMAGE_DATA_URI_PATTERN, PDF_DATA_URI_PATTERN, sanitizeImageData, sanitizePdfData };

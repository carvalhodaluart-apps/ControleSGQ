function drawWatermark(document, imageBuffer) {
  if (!document || !imageBuffer) return;
  const pageWidth = document.page.width;
  const pageHeight = document.page.height;
  const bottom = document.page.margins?.bottom || 36;
  const size = 46;
  const x = Math.round((pageWidth - size) / 2);
  const y = pageHeight - bottom - size - 38;
  document.save().opacity(0.78).image(imageBuffer, x, y, { fit: [size, size], align: "center", valign: "center" }).restore();
}

module.exports = { drawWatermark };

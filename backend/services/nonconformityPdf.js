const PDFDocument = require("pdfkit");
const sharp = require("sharp");

const COLORS = {
  navy: "#17233d",
  blue: "#155eef",
  text: "#263957",
  muted: "#60708a",
  line: "#d8e1ef",
  soft: "#f5f8fc",
  orange: "#f97316",
};

function cleanText(value) {
  let result = String(value ?? "");
  for (let attempt = 0; attempt < 2 && /[\u00c3\u00c2\uFFFD]/.test(result); attempt += 1) {
    const fixed = Buffer.from(result, "latin1").toString("utf8");
    if (fixed === result) break;
    result = fixed;
  }
  return result.replace(/[\u2013\u2014]/g, "-").replace(/\u00a0/g, " ").trim();
}

function dataUriToBuffer(value) {
  const match = String(value || "").match(/^data:image\/(?:png|jpe?g|webp);base64,(.+)$/i);
  return match ? Buffer.from(match[1], "base64") : null;
}

async function toPdfImageBuffer(value) {
  const buffer = dataUriToBuffer(value);
  if (!buffer) return null;
  return /^data:image\/webp/i.test(String(value)) ? sharp(buffer).png().toBuffer() : buffer;
}

function dateText(value) {
  const valueText = cleanText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valueText)) return valueText;
  const [year, month, day] = valueText.split("-");
  return `${day}/${month}/${year}`;
}

function coverPosition(cover, pageWidth, pageHeight, width, height) {
  const position = String(cover.overlayPosition || "center");
  const paddingX = pageWidth * (16 / 520);
  const paddingY = pageHeight * (16 / 842);
  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
  const x = position === "custom"
    ? clamp(pageWidth * Number(cover.overlayX || 0.5) - width / 2, paddingX, pageWidth - width - paddingX)
    : position.endsWith("left") ? paddingX : position.endsWith("right") ? pageWidth - width - paddingX : (pageWidth - width) / 2;
  const y = position === "custom"
    ? clamp(pageHeight * Number(cover.overlayY || 0.5) - height / 2, paddingY, pageHeight - height - paddingY)
    : position.startsWith("top") ? paddingY : position.startsWith("bottom") ? pageHeight - height - paddingY : (pageHeight - height) / 2;
  return { x, y };
}

function drawCover(doc, nc, cover, imageBuffer) {
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  doc.image(imageBuffer, 0, 0, { fit: [pageWidth, pageHeight], align: "center", valign: "center" });

  const overlayWidth = pageWidth * 0.68;
  const overlayHeight = 124;
  const position = coverPosition(cover, pageWidth, pageHeight, overlayWidth, overlayHeight);
  const textWidth = overlayWidth - 28;
  doc.save().roundedRect(position.x, position.y, overlayWidth, overlayHeight, 6).fillOpacity(0.9).fillColor("#ffffff").fill().restore();
  doc.fillColor(COLORS.orange).font("Helvetica-Bold").fontSize(9).text("RELAT\u00d3RIO DE N\u00c3O CONFORMIDADE", position.x + 14, position.y + 13, { width: textWidth });
  doc.fillColor(COLORS.navy).font("Helvetica-Bold").fontSize(20).text(cleanText(nc.title) || "N\u00e3o conformidade", position.x + 14, position.y + 30, { width: textWidth, lineGap: 2 });
  const metadata = [nc.documentCode, nc.sector, nc.status].map(cleanText).filter(Boolean).join("  |  ");
  doc.fillColor(COLORS.muted).font("Helvetica").fontSize(9).text(metadata || "Registro da qualidade", position.x + 14, position.y + 78, { width: textWidth });
}

function drawHeader(doc, nc) {
  doc.rect(0, 0, doc.page.width, 12).fill(COLORS.orange);
  doc.fillColor(COLORS.navy).font("Helvetica-Bold").fontSize(18).text("RELAT\u00d3RIO DE N\u00c3O CONFORMIDADE", 42, 34, { width: 510 });
  doc.fillColor(COLORS.muted).font("Helvetica").fontSize(9).text("Gest\u00e3o da Qualidade Total", 42, 58);
  doc.fillColor(COLORS.blue).font("Helvetica-Bold").fontSize(11).text(cleanText(nc.documentCode || "NC"), 430, 39, { width: 120, align: "right" });
  doc.fillColor(COLORS.muted).font("Helvetica").fontSize(9).text(`Status: ${cleanText(nc.status || "Aberta")}`, 430, 58, { width: 120, align: "right" });
  doc.moveTo(42, 78).lineTo(553, 78).strokeColor(COLORS.line).stroke();
  doc.y = 96;
}

function ensureSpace(doc, height = 80) {
  if (doc.y + height > doc.page.height - 48) doc.addPage();
}

function sectionHeading(doc, title) {
  ensureSpace(doc, 48);
  doc.moveDown(0.5);
  doc.rect(42, doc.y, 5, 22).fill(COLORS.orange);
  doc.fillColor(COLORS.navy).font("Helvetica-Bold").fontSize(12).text(cleanText(title), 56, doc.y + 3);
  doc.y += 31;
}

function field(doc, label, value, x, y, width) {
  doc.fillColor(COLORS.muted).font("Helvetica-Bold").fontSize(8).text(cleanText(label).toUpperCase(), x, y, { width });
  doc.fillColor(COLORS.text).font("Helvetica").fontSize(10).text(cleanText(value) || "N\u00e3o informado", x, y + 13, { width, lineGap: 1 });
}

function metadataGrid(doc, nc) {
  const startY = doc.y;
  const gap = 14;
  const width = (511 - gap) / 2;
  const rows = [
    ["T\u00edtulo", nc.title, "Origem", nc.origin],
    ["Data de abertura", dateText(nc.issueDate), "Setor / processo", nc.sector],
    ["Registrado por", nc.reporter, "Respons\u00e1vel", nc.responsible],
    ["Item afetado", nc.affectedItem, "C\u00f3digo", nc.documentCode],
  ];
  rows.forEach((row) => {
    const valueWidth = width - 24;
    const leftHeight = doc.heightOfString(cleanText(row[1]) || "N\u00e3o informado", { width: valueWidth, font: "Helvetica", fontSize: 10, lineGap: 1 });
    const rightHeight = doc.heightOfString(cleanText(row[3]) || "N\u00e3o informado", { width: valueWidth, font: "Helvetica", fontSize: 10, lineGap: 1 });
    const height = Math.max(48, Math.max(leftHeight, rightHeight) + 28);
    ensureSpace(doc, height + 10);
    const y = doc.y;
    doc.roundedRect(42, y, width, height, 5).fillAndStroke(COLORS.soft, COLORS.line);
    doc.roundedRect(42 + width + gap, y, width, height, 5).fillAndStroke(COLORS.soft, COLORS.line);
    field(doc, row[0], row[1], 54, y + 7, valueWidth);
    field(doc, row[2], row[3], 54 + width + gap, y + 7, valueWidth);
    doc.y = y + height + 10;
  });
}

function textBlock(doc, title, value) {
  sectionHeading(doc, title);
  const content = cleanText(value) || "N\u00e3o informado";
  const height = Math.max(44, doc.heightOfString(content, { width: 487, font: "Helvetica", fontSize: 10 }) + 22);
  ensureSpace(doc, height + 12);
  doc.roundedRect(42, doc.y, 511, height, 6).fillAndStroke("#ffffff", COLORS.line);
  doc.fillColor(COLORS.text).font("Helvetica").fontSize(10).text(content, 54, doc.y + 11, { width: 487, lineGap: 2 });
  doc.y += height + 6;
}

function actionTable(doc, actions = []) {
  sectionHeading(doc, "Plano de a\u00e7\u00e3o corretiva");
  if (!actions.length) { textBlock(doc, "A\u00e7\u00f5es", "Nenhuma a\u00e7\u00e3o corretiva registrada."); return; }
  actions.forEach((action, index) => {
    const description = cleanText(action.description) || "A\u00e7\u00e3o n\u00e3o informada";
    const summary = [`Respons\u00e1vel: ${cleanText(action.responsible) || "N\u00e3o informado"}`, `Prazo: ${dateText(action.dueDate) || "-"}`, `Status: ${cleanText(action.status) || "Pendente"}`].join("  |  ");
    const evidence = cleanText(action.evidence);
    const descriptionHeight = doc.heightOfString(description, { width: 455, font: "Helvetica", fontSize: 9, lineGap: 1 });
    const evidenceHeight = evidence ? doc.heightOfString(`Evid\u00eancia: ${evidence}`, { width: 455, font: "Helvetica", fontSize: 8, lineGap: 1 }) : 0;
    const height = Math.max(64, descriptionHeight + evidenceHeight + (evidence ? 62 : 44));
    ensureSpace(doc, height + 8);
    const y = doc.y;
    doc.roundedRect(42, y, 511, height, 5).fillAndStroke(index % 2 ? "#ffffff" : COLORS.soft, COLORS.line);
    doc.fillColor(COLORS.blue).font("Helvetica-Bold").fontSize(10).text(String(index + 1), 52, y + 10, { width: 18, align: "center" });
    doc.fillColor(COLORS.text).font("Helvetica").fontSize(9).text(description, 78, y + 8, { width: 455, lineGap: 1 });
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(8).text(summary, 78, y + 13 + descriptionHeight, { width: 455 });
    if (evidence) doc.fillColor(COLORS.muted).font("Helvetica").fontSize(8).text(`Evid\u00eancia: ${evidence}`, 78, y + 35 + descriptionHeight, { width: 455, lineGap: 1 });
    doc.y = y + height + 6;
  });
}

function evidenceImages(doc, entries = []) {
  if (!entries.length) return;
  const first = entries[0];
  const firstDescriptionHeight = doc.heightOfString(cleanText(first.description) || " ", { width: 511, font: "Helvetica", fontSize: 9, lineGap: 1 });
  ensureSpace(doc, 48 + 285 + firstDescriptionHeight);
  sectionHeading(doc, "Imagens da evid\u00eancia");
  entries.forEach((entry, index) => {
    const label = cleanText(entry.label) || `Evid\u00eancia ${index + 1}`;
    const description = cleanText(entry.description);
    const captionHeight = doc.heightOfString(description || " ", { width: 511, font: "Helvetica", fontSize: 9, lineGap: 1 });
    ensureSpace(doc, 285 + captionHeight);
    const imageTop = doc.y;
    doc.image(entry.buffer, 42, imageTop, { fit: [511, 235], align: "center", valign: "center" });
    const captionTop = imageTop + 245;
    doc.fillColor(COLORS.navy).font("Helvetica-Bold").fontSize(9).text(label, 42, captionTop, { width: 511 });
    if (description) doc.fillColor(COLORS.text).font("Helvetica").fontSize(9).text(description, 42, captionTop + 14, { width: 511, lineGap: 1 });
    doc.y = captionTop + 18 + (description ? captionHeight : 0);
  });
}

async function createNonconformityPdf(input, configuration = {}) {
  const nc = input || {};
  const doc = new PDFDocument({ size: "A4", margins: { top: 34, bottom: 42, left: 42, right: 42 }, bufferPages: true });
  const chunks = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  const result = new Promise((resolve, reject) => { doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
  const cover = configuration.cover || {};
  const coverBuffer = await toPdfImageBuffer(cover.imageData);
  if (coverBuffer) { drawCover(doc, nc, cover, coverBuffer); doc.addPage(); }

  drawHeader(doc, nc);
  const sectionSettings = configuration.nonconformity?.sections || [];
  const isSectionActive = (key) => sectionSettings.find((item) => item.key === key)?.active !== false;
  if (isSectionActive("identification")) {
    sectionHeading(doc, "Identifica\u00e7\u00e3o");
    metadataGrid(doc, nc);
  }
  if (isSectionActive("description")) {
    textBlock(doc, "Descri\u00e7\u00e3o da n\u00e3o conformidade", nc.description);
    const sourceImages = nc.evidenceImages || (nc.evidenceImage ? [nc.evidenceImage] : []);
    const images = await Promise.all(sourceImages.map(async (entry, index) => {
      const image = typeof entry === "string" ? entry : entry?.image || entry?.data;
      const buffer = await toPdfImageBuffer(image);
      return buffer ? { buffer, label: typeof entry === "string" ? `Evid\u00eancia ${index + 1}` : entry?.label, description: typeof entry === "string" ? "" : entry?.description } : null;
    }));
    evidenceImages(doc, images.filter(Boolean));
  }
  if (isSectionActive("containment")) textBlock(doc, "Corre\u00e7\u00e3o e conten\u00e7\u00e3o", nc.containment);
  if (isSectionActive("cause")) textBlock(doc, "An\u00e1lise de causa", `${nc.causeMethod ? `M\u00e9todo: ${nc.causeMethod}\n` : ""}${nc.causeAnalysis || ""}\nCausa raiz: ${nc.rootCause || "N\u00e3o informada"}`);
  if (isSectionActive("actions")) actionTable(doc, nc.actions);
  if (isSectionActive("effectiveness")) textBlock(doc, "Verifica\u00e7\u00e3o de efic\u00e1cia", `${nc.effectivenessDate ? `Data: ${dateText(nc.effectivenessDate)}\n` : ""}${nc.effectivenessVerifier ? `Verificado por: ${nc.effectivenessVerifier}\n` : ""}${nc.effective === true ? "Resultado: Eficaz" : nc.effective === false ? "Resultado: N\u00e3o eficaz" : "Resultado: Ainda n\u00e3o verificado"}\n${nc.effectivenessResult || ""}`);
  if (isSectionActive("closure")) textBlock(doc, "Encerramento e contexto", `${nc.closureApprover ? `Aprovador: ${nc.closureApprover}\n` : ""}${nc.closureDate ? `Data: ${dateText(nc.closureDate)}\n` : ""}${nc.climateImpact ? `Impacto relacionado a mudan\u00e7as clim\u00e1ticas: ${nc.climateJustification || "Sim"}\n` : "Impacto relacionado a mudan\u00e7as clim\u00e1ticas: N\u00e3o informado\n"}${nc.closureNotes || ""}`);

  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    const generated = nc.generatedAt ? `Gerado em ${dateText(nc.generatedAt)}${nc.generatedBy ? ` por ${cleanText(nc.generatedBy)}` : ""}` : "";
    const footer = [cleanText(nc.documentCode || "NC"), generated, `P\u00e1gina ${index + 1} de ${range.count}`].filter(Boolean).join("  |  ");
    doc.fillColor(COLORS.muted).font("Helvetica").fontSize(8).text(footer, 42, doc.page.height - 30, { width: 511, align: "right" });
  }
  doc.end();
  return result;
}

module.exports = { createNonconformityPdf };

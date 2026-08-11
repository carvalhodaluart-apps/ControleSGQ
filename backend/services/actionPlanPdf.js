const PDFDocument = require("pdfkit");
const sharp = require("sharp");
const fs = require("fs");

const FONT_REGULAR = fs.existsSync("C:\\Windows\\Fonts\\arial.ttf") ? "C:\\Windows\\Fonts\\arial.ttf" : "Helvetica";
const FONT_BOLD = fs.existsSync("C:\\Windows\\Fonts\\arialbd.ttf") ? "C:\\Windows\\Fonts\\arialbd.ttf" : "Helvetica-Bold";

const COLORS = {
  navy: "#17233d",
  blue: "#155eef",
  text: "#263957",
  muted: "#60708a",
  line: "#d8e1ef",
  soft: "#f5f8fc",
  orange: "#f97316",
  warning: "#b87900",
  warningSoft: "#fff4d6",
  danger: "#c92f35",
  dangerSoft: "#ffe8e5",
  success: "#16834b",
  successSoft: "#dff4e7",
};

function repairMojibake(value) {
  let result = String(value ?? "");
  for (let attempt = 0; attempt < 2 && /[ÃÂï¿½]/.test(result); attempt += 1) {
    const fixed = Buffer.from(result, "latin1").toString("utf8");
    if (fixed === result) break;
    result = fixed;
  }
  return result;
}

function clean(value) {
  return repairMojibake(value).replace(/[\u2013\u2014]/g, "-").replace(/\u00a0/g, " ").trim();
}

function dateText(value) {
  const text = clean(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const [year, month, day] = text.split("-");
  return `${day}/${month}/${year}`;
}

async function imageBuffer(value) {
  const match = String(value || "").match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/i);
  if (!match) return null;
  const buffer = Buffer.from(match[2], "base64");
  return match[1].toLowerCase() === "webp" ? sharp(buffer, { limitInputPixels: 25_000_000 }).png().toBuffer() : buffer;
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

function ensureSpace(doc, height = 60) {
  const bottom = doc.page.height - doc.page.margins.bottom - 12;
  if (doc.y + height > bottom) doc.addPage();
}

function sectionHeading(doc, title) {
  ensureSpace(doc, 42);
  const y = doc.y;
  doc.rect(42, y, 5, 21).fill(COLORS.orange);
  doc.fillColor(COLORS.navy).font(FONT_BOLD).fontSize(12).text(clean(title), 56, y + 3, { width: 487 });
  doc.y = y + 31;
}

function field(doc, label, value, x, y, width) {
  doc.fillColor(COLORS.muted).font(FONT_BOLD).fontSize(8).text(clean(label).toUpperCase(), x, y, { width });
  doc.fillColor(COLORS.text).font(FONT_REGULAR).fontSize(10).text(clean(value) || "Não informado", x, y + 13, { width, lineGap: 1 });
}

function metadataGrid(doc, rows) {
  const gap = 14;
  const width = (511 - gap) / 2;
  rows.forEach((row) => {
    doc.font(FONT_REGULAR).fontSize(10);
    const leftHeight = doc.heightOfString(clean(row[1]) || "Não informado", { width: width - 24, lineGap: 1 });
    const rightHeight = doc.heightOfString(clean(row[3]) || "Não informado", { width: width - 24, lineGap: 1 });
    const height = Math.max(48, Math.max(leftHeight, rightHeight) + 29);
    ensureSpace(doc, height + 10);
    const y = doc.y;
    doc.roundedRect(42, y, width, height, 6).fillAndStroke(COLORS.soft, COLORS.line);
    doc.roundedRect(42 + width + gap, y, width, height, 6).fillAndStroke(COLORS.soft, COLORS.line);
    field(doc, row[0], row[1], 54, y + 8, width - 24);
    field(doc, row[2], row[3], 54 + width + gap, y + 8, width - 24);
    doc.y = y + height + 10;
  });
}

function textBlock(doc, title, value, options = {}) {
  const content = clean(value) || "Não informado";
  const fontSize = options.fontSize || 10;
  const textWidth = 487;
  doc.font(FONT_REGULAR).fontSize(fontSize);
  const contentHeight = doc.heightOfString(content, { width: textWidth, lineGap: 2 });
  const height = Math.max(46, contentHeight + 24);
  ensureSpace(doc, height + 52);
  sectionHeading(doc, title);
  const y = doc.y;
  doc.roundedRect(42, y, 511, height, 6).fillAndStroke("#ffffff", COLORS.line);
  doc.fillColor(COLORS.text).font(FONT_REGULAR).fontSize(fontSize).text(content, 54, y + 12, { width: textWidth, lineGap: 2 });
  doc.y = y + height + 10;
}

function drawCover(doc, plan, cover, buffer) {
  const width = doc.page.width;
  const height = doc.page.height;
  doc.image(buffer, 0, 0, { fit: [width, height], align: "center", valign: "center" });
  const boxWidth = width * 0.68;
  const boxHeight = 124;
  const { x, y } = coverPosition(cover, width, height, boxWidth, boxHeight);
  doc.save().roundedRect(x, y, boxWidth, boxHeight, 7).fillOpacity(0.9).fillColor("#ffffff").fill().restore();
  doc.fillColor(COLORS.orange).font(FONT_BOLD).fontSize(9).text("PLANO DE AÇÃO E CAPA", x + 14, y + 14, { width: boxWidth - 28 });
  doc.fillColor(COLORS.navy).font(FONT_BOLD).fontSize(19).text(clean(plan.title) || "Plano de ação", x + 14, y + 32, { width: boxWidth - 28, lineGap: 2 });
  doc.fillColor(COLORS.muted).font(FONT_REGULAR).fontSize(9).text([plan.documentCode, plan.type, plan.status].map(clean).filter(Boolean).join("  |  ") || "Registro da qualidade", x + 14, y + 88, { width: boxWidth - 28 });
}

function drawHeader(doc, plan) {
  doc.rect(0, 0, doc.page.width, 12).fill(COLORS.orange);
  doc.fillColor(COLORS.navy).font(FONT_BOLD).fontSize(17).text("PLANO DE AÇÃO E CAPA", 42, 32, { width: 360 });
  doc.fillColor(COLORS.blue).font(FONT_BOLD).fontSize(10).text(clean(plan.documentCode || "PAC"), 430, 36, { width: 120, align: "right" });
  doc.fillColor(COLORS.muted).font(FONT_REGULAR).fontSize(9).text("Gestão da Qualidade Total", 42, 55, { width: 300 });
  doc.fillColor(COLORS.muted).font(FONT_REGULAR).fontSize(9).text(`Status: ${clean(plan.status || "Rascunho")}`, 430, 55, { width: 120, align: "right" });
  doc.moveTo(42, 78).lineTo(553, 78).strokeColor(COLORS.line).stroke();
  doc.y = 96;
}

function actionCard(doc, action, index) {
  const description = clean(action.description) || "Ação não informada";
  const details = [
    `Tipo: ${clean(action.type) || "Não informado"}`,
    `Responsável: ${clean(action.responsible) || "Não informado"}`,
    `Setor: ${clean(action.responsibleSector) || "Não informado"}`,
    `Prazo: ${dateText(action.dueDate) || "Não informado"}`,
    `Situação: ${clean(action.status) || "Não iniciada"}`,
    `Conclusão: ${Number(action.completionPercent) || 0}%`,
  ].join("  |  ");
  const evidence = clean(action.evidence);
  doc.font(FONT_REGULAR).fontSize(9);
  const descriptionHeight = doc.heightOfString(description, { width: 455, lineGap: 1 });
  const evidenceHeight = evidence ? doc.heightOfString(`Evidência: ${evidence}`, { width: 455, lineGap: 1 }) : 0;
  const height = Math.max(76, descriptionHeight + evidenceHeight + (evidence ? 68 : 50));
  ensureSpace(doc, height + 10);
  const y = doc.y;
  doc.roundedRect(42, y, 511, height, 6).fillAndStroke(index % 2 ? "#ffffff" : COLORS.soft, COLORS.line);
  doc.circle(63, y + 20, 11).fill(COLORS.blue);
  doc.fillColor("#ffffff").font(FONT_BOLD).fontSize(9).text(String(index + 1), 57, y + 15, { width: 12, align: "center" });
  doc.fillColor(COLORS.text).font(FONT_BOLD).fontSize(10).text(description, 84, y + 11, { width: 455, lineGap: 1 });
  doc.fillColor(COLORS.muted).font(FONT_REGULAR).fontSize(8).text(details, 84, y + 17 + descriptionHeight, { width: 455, lineGap: 1 });
  if (evidence) doc.fillColor(COLORS.text).font(FONT_REGULAR).fontSize(8).text(`Evidência: ${evidence}`, 84, y + 39 + descriptionHeight, { width: 455, lineGap: 1 });
  doc.y = y + height + 8;
}

function actionList(doc, actions = []) {
  sectionHeading(doc, "Ações");
  if (!actions.length) return textBlock(doc, "Registro", "Nenhuma ação cadastrada.");
  actions.forEach((action, index) => actionCard(doc, action, index));
}

function footer(doc, plan, pageCount) {
  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    doc.fillColor(COLORS.muted).font(FONT_REGULAR).fontSize(8).text(`${clean(plan.documentCode || "PAC")}  |  ${clean(plan.title) || "Plano de ação"}  |  Página ${index + 1} de ${pageCount}`, 42, doc.page.height - 30, { width: 511, align: "right" });
  }
}

async function createActionPlanPdf(plan, configuration = {}) {
  const doc = new PDFDocument({ size: "A4", margins: { top: 34, bottom: 42, left: 42, right: 42 }, bufferPages: true });
  const chunks = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  const result = new Promise((resolve, reject) => { doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
  const cover = configuration.cover || {};
  const coverBuffer = await imageBuffer(cover.imageData);
  if (coverBuffer) { drawCover(doc, plan, cover, coverBuffer); doc.addPage(); }
  drawHeader(doc, plan);
  sectionHeading(doc, "Identificação");
  metadataGrid(doc, [
    ["Código", plan.documentCode, "Status", plan.status],
    ["Tipo", plan.type, "Origem", plan.origin],
    ["Setor", plan.sector, "Responsável", plan.responsible],
    ["Data de abertura", dateText(plan.openingDate), "Prioridade", plan.priority],
  ]);
  textBlock(doc, "Problema e evidências", [plan.problemDescription, plan.situationDescription, plan.impact ? `Impacto identificado: ${plan.impact}` : "", plan.initialEvidence ? `Evidências iniciais: ${plan.initialEvidence}` : ""].filter(Boolean).join("\n\n"));
  textBlock(doc, "Correção ou contenção imediata", [`${plan.containment || "Não informada"}`, plan.containmentDate ? `Data: ${dateText(plan.containmentDate)}` : "", plan.containmentResponsible ? `Responsável: ${plan.containmentResponsible}` : ""].filter(Boolean).join("\n"));
  textBlock(doc, "Análise de causa", [`Método: ${plan.causeMethod || "Não informado"}`, `Categoria: ${plan.causeCategory || "Não informada"}`, `Causa raiz: ${plan.rootCause || "Não informada"}`, plan.participants ? `Participantes: ${plan.participants}` : "", plan.causeEvidence ? `Evidências: ${plan.causeEvidence}` : ""].filter(Boolean).join("\n"));
  if (Array.isArray(plan.whys) && plan.whys.some((item) => clean(item))) textBlock(doc, "5 Porquês", plan.whys.map((item, index) => `${index + 1}. ${clean(item) || "Não informado"}`).join("\n"));
  actionList(doc, plan.actions);
  const effectiveness = plan.effectiveness || {};
  textBlock(doc, "Verificação de eficácia", [`Critério: ${effectiveness.criterion || "Não informado"}`, `Responsável: ${effectiveness.responsible || "Não informado"}`, `Data prevista: ${dateText(effectiveness.plannedDate) || "Não informada"}`, `Data realizada: ${dateText(effectiveness.completedDate) || "Não informada"}`, `Resultado: ${effectiveness.result || "Aguardando avaliação"}`, effectiveness.evidence ? `Evidências: ${effectiveness.evidence}` : "", effectiveness.comment || ""].filter(Boolean).join("\n"));
  textBlock(doc, "Encerramento", [`Data: ${dateText(plan.closureDate) || "Não informada"}`, `Aprovador: ${plan.closureApprover || "Não informado"}`, effectiveness.newPlanNeeded ? "Necessidade de novo plano: Sim" : "Necessidade de novo plano: Não"].join("\n"));
  const pageCount = doc.bufferedPageRange().count;
  footer(doc, plan, pageCount);
  doc.end();
  return result;
}

module.exports = { createActionPlanPdf };

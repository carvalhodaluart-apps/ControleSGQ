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
  if (doc.y + height > doc.page.height - doc.page.margins.bottom - 12) doc.addPage();
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
  doc.font(FONT_REGULAR).fontSize(fontSize);
  const contentHeight = doc.heightOfString(content, { width: 487, lineGap: 2 });
  const height = Math.max(46, contentHeight + 24);
  ensureSpace(doc, height + 52);
  sectionHeading(doc, title);
  const y = doc.y;
  doc.roundedRect(42, y, 511, height, 6).fillAndStroke("#ffffff", COLORS.line);
  doc.fillColor(COLORS.text).font(FONT_REGULAR).fontSize(fontSize).text(content, 54, y + 12, { width: 487, lineGap: 2 });
  doc.y = y + height + 10;
}

function drawCover(doc, instrument, cover, buffer) {
  const width = doc.page.width;
  const height = doc.page.height;
  doc.image(buffer, 0, 0, { fit: [width, height], align: "center", valign: "center" });
  const boxWidth = width * 0.68;
  const boxHeight = 124;
  const { x, y } = coverPosition(cover, width, height, boxWidth, boxHeight);
  doc.save().roundedRect(x, y, boxWidth, boxHeight, 7).fillOpacity(0.9).fillColor("#ffffff").fill().restore();
  doc.fillColor(COLORS.orange).font(FONT_BOLD).fontSize(9).text("CALIBRAÇÃO DE INSTRUMENTOS", x + 14, y + 14, { width: boxWidth - 28 });
  doc.fillColor(COLORS.navy).font(FONT_BOLD).fontSize(19).text(clean(instrument.name) || "Instrumento", x + 14, y + 32, { width: boxWidth - 28, lineGap: 2 });
  doc.fillColor(COLORS.muted).font(FONT_REGULAR).fontSize(9).text([instrument.documentCode, instrument.type, instrument.situation].map(clean).filter(Boolean).join("  |  ") || "Registro metrológico", x + 14, y + 88, { width: boxWidth - 28 });
}

function drawHeader(doc, instrument) {
  doc.rect(0, 0, doc.page.width, 12).fill(COLORS.orange);
  doc.fillColor(COLORS.navy).font(FONT_BOLD).fontSize(17).text("CALIBRAÇÃO DE INSTRUMENTOS", 42, 32, { width: 380 });
  doc.fillColor(COLORS.blue).font(FONT_BOLD).fontSize(10).text(clean(instrument.documentCode || "INS"), 430, 36, { width: 120, align: "right" });
  doc.fillColor(COLORS.muted).font(FONT_REGULAR).fontSize(9).text("Gestão da Qualidade Total", 42, 55, { width: 300 });
  doc.fillColor(COLORS.muted).font(FONT_REGULAR).fontSize(9).text(`Situação: ${clean(instrument.situation || "Liberado")}`, 430, 55, { width: 120, align: "right" });
  doc.moveTo(42, 78).lineTo(553, 78).strokeColor(COLORS.line).stroke();
  doc.y = 96;
}

function labeledLines(doc, title, lines, options = {}) {
  textBlock(doc, title, lines.filter(Boolean).join("\n"), options);
}

function maintenanceCard(doc, item, index) {
  const content = [
    `Tipo: ${item.type || "Não informado"}`,
    `Data: ${dateText(item.date) || "Não informada"}`,
    `Serviço: ${item.service || "Não informado"}`,
    `Responsável: ${item.responsible || "Não informado"}`,
    `Resultado: ${item.result || "Pendente"}`,
    item.replacedParts ? `Peças substituídas: ${item.replacedParts}` : "",
    item.cost ? `Custo: ${item.cost}` : "",
    item.nextMaintenance ? `Próxima manutenção: ${dateText(item.nextMaintenance)}` : "",
  ].filter(Boolean).join("\n");
  const heading = `${index + 1}. ${item.type || "Manutenção"}`;
  textBlock(doc, heading, content);
}

function footer(doc, instrument, pageCount) {
  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    doc.fillColor(COLORS.muted).font(FONT_REGULAR).fontSize(8).text(`${clean(instrument.documentCode || "INS")}  |  ${clean(instrument.name) || "Instrumento"}  |  Página ${index + 1} de ${pageCount}`, 42, doc.page.height - 30, { width: 511, align: "right" });
  }
}

async function createInstrumentPdf(instrument, configuration = {}) {
  const doc = new PDFDocument({ size: "A4", margins: { top: 34, bottom: 42, left: 42, right: 42 }, bufferPages: true });
  const chunks = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  const result = new Promise((resolve, reject) => { doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
  const cover = configuration.cover || {};
  const coverBuffer = await imageBuffer(cover.imageData);
  if (coverBuffer) { drawCover(doc, instrument, cover, coverBuffer); doc.addPage(); }
  drawHeader(doc, instrument);
  sectionHeading(doc, "Cadastro do instrumento");
  metadataGrid(doc, [
    ["Código interno", instrument.documentCode, "Situação", instrument.situation],
    ["Nome", instrument.name, "Tipo", instrument.type],
    ["Fabricante / modelo", `${instrument.manufacturer || "Não informado"} / ${instrument.model || "Não informado"}`, "Número de série", instrument.serialNumber],
    ["Setor", instrument.sector, "Localização", instrument.location],
    ["Responsável", instrument.responsible, "Criticidade", instrument.criticality],
  ]);
  const metrology = instrument.metrology || {};
  labeledLines(doc, "Características metrológicas", [
    `Grandeza medida: ${metrology.quantity || "Não informada"}`,
    `Unidade: ${metrology.unit || "Não informada"}`,
    `Faixa de medição: ${metrology.range || "Não informada"}`,
    `Resolução: ${metrology.resolution || "Não informada"}`,
    `Exatidão: ${metrology.accuracy || "Não informada"}`,
    `Tolerância aceitável: ${metrology.acceptableTolerance || "Não informada"}`,
    `Erro máximo permitido: ${metrology.maxPermittedError || "Não informado"}`,
    `Classe: ${metrology.instrumentClass || "Não informada"}`,
    `Condições ambientais: ${metrology.environmentalConditions || "Não informadas"}`,
    `Procedimento de utilização: ${metrology.useProcedure || "Não informado"}`,
    `Necessita calibração: ${metrology.needsCalibration === false ? "Não" : "Sim"}`,
    `Necessita verificação intermediária: ${metrology.needsIntermediateVerification ? "Sim" : "Não"}`,
  ]);
  const planning = instrument.planning || {};
  labeledLines(doc, "Planejamento", [
    `Periodicidade: ${planning.frequency || "Não informada"}`,
    `Última calibração: ${dateText(planning.lastCalibrationDate) || "Não informada"}`,
    `Próxima calibração: ${dateText(planning.nextCalibrationDate) || "Não informada"}`,
    `Antecedência do aviso: ${planning.alertDays ?? 30} dias`,
    `Tipo de calibração: ${planning.calibrationType || "Não informado"}`,
    `Laboratório ou fornecedor: ${planning.labOrSupplier || "Não informado"}`,
    `Responsável pelo envio: ${planning.sendResponsible || "Não informado"}`,
    `Custo previsto: ${planning.estimatedCost || "Não informado"}`,
    `Instrumento substituto: ${planning.substituteInstrument || "Não informado"}`,
  ]);
  const calibration = instrument.calibration || {};
  labeledLines(doc, "Registro da calibração", [
    `Número do registro: ${calibration.recordNumber || "Não informado"}`,
    `Envio: ${dateText(calibration.sendDate) || "Não informado"}  |  Calibração: ${dateText(calibration.calibrationDate) || "Não informado"}  |  Retorno: ${dateText(calibration.returnDate) || "Não informado"}`,
    `Laboratório: ${calibration.lab || "Não informado"}`,
    `Certificado: ${calibration.certificateNumber || "Não informado"}${calibration.certificatePdf?.name ? ` (${calibration.certificatePdf.name})` : ""}`,
    `Padrões utilizados: ${calibration.patterns || "Não informado"}`,
    `Rastreabilidade: ${calibration.traceability || "Não informada"}`,
    `Condição encontrada: ${calibration.conditionFound || "Não informada"}`,
    `Resultado antes do ajuste: ${calibration.resultBeforeAdjustment || "Não informado"}`,
    `Ajuste realizado: ${calibration.adjustmentPerformed ? "Sim" : "Não"}`,
    `Resultado depois do ajuste: ${calibration.resultAfterAdjustment || "Não informado"}`,
    `Incerteza de medição: ${calibration.measurementUncertainty || "Não informada"}`,
    `Erro encontrado: ${calibration.errorFound || "Não informado"}`,
    `Critério de aceitação: ${calibration.acceptanceCriteria || "Não informado"}`,
    `Resultado final: ${calibration.finalResult || "Não informado"}`,
    `Próxima calibração: ${dateText(calibration.nextCalibration) || "Não informada"}`,
    `Responsável pela análise: ${calibration.analysisResponsible || "Não informado"}`,
    `Data da liberação: ${dateText(calibration.releaseDate) || "Não informada"}`,
  ]);
  if (calibration.finalResult === "Reprovado") {
    const impact = instrument.impactAnalysis || {};
    textBlock(doc, "Análise de impacto do instrumento", [
      `Período afetado: ${impact.period || "Não informado"}`,
      `Última calibração válida: ${dateText(impact.lastValidCalibration) || "Não informada"}`,
      `Produtos ou processos: ${impact.productsProcesses || "Não informado"}`,
      `Ordens de produção: ${impact.productionOrders || "Não informadas"}`,
      `Repetir medições: ${impact.repeatMeasurements ? "Sim" : "Não"}`,
      `Bloquear produtos: ${impact.blockProducts ? "Sim" : "Não"}`,
      `Avaliação técnica: ${impact.technicalAssessment || "Não informada"}`,
      `Decisão: ${impact.decision || "Não informada"}`,
      `Não conformidade vinculada: ${impact.linkedNonconformity || "Não informada"}`,
      `Plano de ação vinculado: ${impact.linkedActionPlan || "Não informado"}`,
      `Evidências: ${impact.evidence || "Não informadas"}`,
      `Aprovação: ${impact.approval || "Não informada"}`,
    ].join("\n"), { tone: "danger" });
  }
  sectionHeading(doc, "Manutenções e verificações");
  if (!instrument.maintenances?.length) textBlock(doc, "Registro", "Nenhuma manutenção ou verificação registrada.");
  else instrument.maintenances.forEach((item, index) => maintenanceCard(doc, item, index));
  const pageCount = doc.bufferedPageRange().count;
  footer(doc, instrument, pageCount);
  doc.end();
  return result;
}

module.exports = { createInstrumentPdf };

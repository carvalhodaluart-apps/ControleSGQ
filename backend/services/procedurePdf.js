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
  success: "#16834b",
  successSoft: "#d7f1e1",
  warning: "#b87900",
  warningSoft: "#ffedb8",
  danger: "#c92f35",
  dangerSoft: "#fbd3d3",
};

function repairMojibake(value) {
  let result = String(value ?? "");
  for (let attempt = 0; attempt < 2 && /[ÃÂ�]/.test(result); attempt += 1) {
    const fixed = Buffer.from(result, "latin1").toString("utf8");
    if (fixed === result) break;
    result = fixed;
  }
  return result;
}

function cleanText(value) {
  return repairMojibake(value)
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2022/g, "-")
    .replace(/Ω/g, "ohm")
    .replace(/±/g, "+/-")
    .replace(/\u00a0/g, " ")
    .trim();
}

function stripHtml(value) {
  return cleanText(value)
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function inlineText(value) {
  return stripHtml(value).replace(/\s+/g, " ").trim();
}

function richInlineSegments(value) {
  const tokens = String(value || "")
    .replace(/<br\s*\/?\s*>/gi, " ")
    .split(/(<\/?(?:b|strong)\b[^>]*>)/gi);
  let bold = false;
  const segments = [];
  tokens.forEach((token) => {
    if (/^<\/?(?:b|strong)\b/i.test(token)) {
      bold = /^<(?:b|strong)\b/i.test(token);
      return;
    }
    const text = repairMojibake(token)
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/\s+/g, " ");
    if (text.trim()) segments.push({ text, bold });
  });
  return segments;
}

function dataUriToBuffer(value) {
  const match = String(value || "").match(/^data:image\/(png|jpe?g);base64,(.+)$/i);
  return match ? Buffer.from(match[2], "base64") : null;
}

async function convertLegacyImages(value) {
  if (typeof value === "string" && /^data:image\/webp;base64,/i.test(value)) {
    const encoded = value.split(",", 2)[1];
    const png = await sharp(Buffer.from(encoded, "base64")).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  }
  if (Array.isArray(value)) return Promise.all(value.map(convertLegacyImages));
  if (!value || typeof value !== "object") return value;
  const copy = {};
  await Promise.all(Object.entries(value).map(async ([key, item]) => {
    copy[key] = await convertLegacyImages(item);
  }));
  return copy;
}

function currentRevision(procedure) {
  const rows = Array.isArray(procedure.revision) ? procedure.revision.slice(1) : [];
  return [...rows].reverse().find((row) => String(row?.[0] || "").trim()) || [];
}

function toneColors(tone) {
  if (tone === "warning") return { line: COLORS.warning, fill: COLORS.warningSoft };
  if (tone === "danger") return { line: COLORS.danger, fill: COLORS.dangerSoft };
  return { line: COLORS.success, fill: COLORS.successSoft };
}

async function createProcedurePdf(procedure) {
  const source = await convertLegacyImages(procedure);
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ size: "A4", margin: 36, autoFirstPage: true });
    const chunks = [];
    const pageWidth = document.page.width;
    const pageHeight = document.page.height;
    const margin = 36;
    const contentWidth = pageWidth - margin * 2;
    const contentBottom = pageHeight - 72;
    const revision = currentRevision(source);
    const info = source.qualityInfo || {};
    let y = 0;
    let pageNumber = 0;

    document.on("data", (chunk) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);

    const setFont = (name, size, color = COLORS.text) => {
      document.font(name).fontSize(size).fillColor(color);
    };
    const startPage = () => {
      pageNumber += 1;
      document.save().fillColor(COLORS.orange).rect(margin, 24, contentWidth, 4).fill().restore();
      setFont("Helvetica-Bold", 8, COLORS.muted);
      document.text("PROCEDIMENTO INTERNO", margin, 36, { width: 220 });
      document.text(`${cleanText(source.documentCode || "") || "Sem código"} | Rev. ${cleanText(revision[0] || "00")}`, margin, 36, { width: contentWidth, align: "right" });
      y = 68;
    };
    const finishPage = () => {
      const footerLineY = pageHeight - 56;
      document.save().strokeColor(COLORS.line).lineWidth(0.7).moveTo(margin, footerLineY).lineTo(pageWidth - margin, footerLineY).stroke().restore();
      setFont("Helvetica", 7.5, COLORS.muted);
      document.text("Documento controlado pelo SGQ", margin, pageHeight - 45, { width: 250, lineBreak: false });
      document.text(`Página ${pageNumber}`, margin, pageHeight - 45, { width: contentWidth, align: "right", lineBreak: false });
    };
    const nextPage = () => {
      finishPage();
      document.addPage();
      startPage();
    };
    const ensureSpace = (height) => {
      if (y + height > contentBottom) nextPage();
    };
    const paragraph = (value, size = 9.4, color = COLORS.text, gap = 7, width = contentWidth) => {
      const text = cleanText(value);
      if (!text) return;
      setFont("Helvetica", size, color);
      const height = document.heightOfString(text, { width, lineGap: 2 });
      ensureSpace(height + gap);
      document.text(text, margin, y, { width, lineGap: 2 });
      y += height + gap;
    };
    const heading = (title, subtitle = "") => {
      const titleText = cleanText(title);
      ensureSpace(subtitle ? 48 : 32);
      document.save().roundedRect(margin, y, contentWidth, subtitle ? 43 : 31, 6).fillColor(COLORS.soft).fill().restore();
      document.save().fillColor(COLORS.orange).roundedRect(margin, y, 5, subtitle ? 43 : 31, 3).fill().restore();
      setFont("Helvetica-Bold", 12.5, COLORS.navy);
      document.text(titleText, margin + 16, y + 8, { width: contentWidth - 28 });
      if (subtitle) {
        setFont("Helvetica", 8.5, COLORS.muted);
        document.text(cleanText(subtitle), margin + 16, y + 25, { width: contentWidth - 28 });
      }
      y += subtitle ? 54 : 42;
    };
    const valueHeight = (label, value, width) => {
      setFont("Helvetica-Bold", 7.5, COLORS.muted);
      const labelHeight = document.heightOfString(cleanText(label), { width });
      setFont("Helvetica", 9.2, COLORS.text);
      const textHeight = document.heightOfString(cleanText(value) || "Não informado", { width });
      return Math.max(48, labelHeight + textHeight + 22);
    };
    const infoGrid = (items, columns = 2) => {
      const gap = 10;
      const cellWidth = (contentWidth - gap * (columns - 1)) / columns;
      for (let index = 0; index < items.length; index += columns) {
        const row = items.slice(index, index + columns);
        const height = Math.max(...row.map(([label, value]) => valueHeight(label, value, cellWidth - 20)));
        ensureSpace(height + gap);
        row.forEach(([label, value], column) => {
          const x = margin + column * (cellWidth + gap);
          document.save().roundedRect(x, y, cellWidth, height, 6).lineWidth(0.7).strokeColor(COLORS.line).fillColor("#fbfcfe").fillAndStroke().restore();
          setFont("Helvetica-Bold", 7.5, COLORS.muted);
          document.text(cleanText(label).toUpperCase(), x + 10, y + 9, { width: cellWidth - 20 });
          setFont("Helvetica", 9.2, COLORS.text);
          document.text(cleanText(value) || "Não informado", x + 10, y + 25, { width: cellWidth - 20, lineGap: 2 });
        });
        y += height + gap;
      }
    };
    const revisionTable = () => {
      const rows = Array.isArray(source.revision) && source.revision.length ? source.revision : [["Rev.", "Data", "Alterações", "Elaboração", "Aprovação"]];
      const widths = [42, 72, 160, 120, 129];
      const drawRow = (row, header = false) => {
        const cells = widths.map((width, index) => cleanText(row[index] || ""));
        setFont(header ? "Helvetica-Bold" : "Helvetica", header ? 7.5 : 8, header ? COLORS.navy : COLORS.text);
        const height = header ? 25 : Math.max(25, ...cells.map((cell, index) => document.heightOfString(cell || " ", { width: widths[index] - 10, lineGap: 1 }))) + 10;
        ensureSpace(height);
        let x = margin;
        cells.forEach((cell, index) => {
          document.save().rect(x, y, widths[index], height).fillColor(header ? "#edf3fb" : "#ffffff").fill().lineWidth(0.7).strokeColor(COLORS.line).stroke().restore();
          document.text(cell, x + 5, y + (header ? 8 : 7), { width: widths[index] - 10, lineGap: 1 });
          x += widths[index];
        });
        y += height;
      };
      drawRow(rows[0], true);
      rows.slice(1).forEach((row) => drawRow(row));
      y += 10;
    };
    const drawImage = (image, x, top, width, height) => {
      if (!image) return false;
      document.save().roundedRect(x, top, width, height, 5).fillColor("#ffffff").fill().lineWidth(0.7).strokeColor(COLORS.line).stroke().restore();
      document.image(image, x + 6, top + 6, { fit: [width - 12, height - 12], align: "center", valign: "center" });
      return true;
    };
    const drawMarkers = (section, imageKey, x, top, width, height) => {
      const annotations = section.annotations || {};
      const markers = annotations[imageKey] || Object.values(annotations).find((value) => Array.isArray(value)) || [];
      markers.filter((marker) => marker.type === "marker").forEach((marker) => {
        const markerX = x + (Number(marker.x) / 100) * width;
        const markerY = top + (Number(marker.y) / 100) * height;
        document.save().fillColor(COLORS.blue).circle(markerX, markerY, 8).fill().restore();
        setFont("Helvetica-Bold", 7.5, "#ffffff");
        document.text(String(marker.number || ""), markerX - 5, markerY - 4, { width: 10, align: "center" });
      });
    };
    const itemsSection = (section) => {
      const imageKey = section.images?.[0] || "";
      const image = dataUriToBuffer(imageKey);
      const items = section.materials || [];
      if (image) {
        const imageHeight = 300;
        ensureSpace(imageHeight + 12);
        drawImage(image, margin, y, contentWidth, imageHeight);
        drawMarkers(section, imageKey, margin, y, contentWidth, imageHeight);
        y += imageHeight + 12;
      }
      const listWidth = contentWidth;
      const rowHeights = items.map((item) => {
        setFont("Helvetica-Bold", 8.3, COLORS.text);
        const descriptionHeight = document.heightOfString(cleanText(item.description || "Item"), { width: listWidth - 58, lineGap: 1 });
        return Math.max(34, descriptionHeight + 28);
      });
      const listHeight = Math.max(70, 36 + rowHeights.reduce((total, height) => total + height, 0));
      ensureSpace(listHeight + 8);
      document.save().roundedRect(margin, y, listWidth, listHeight, 5).fillColor("#fbfcfe").fill().lineWidth(0.7).strokeColor(COLORS.line).stroke().restore();
      setFont("Helvetica-Bold", 8.5, COLORS.navy);
      document.text("Materiais e identificação", margin + 12, y + 12, { width: listWidth - 24 });
      let itemY = y + 36;
      items.forEach((item, index) => {
        const rowHeight = rowHeights[index];
        document.save().fillColor("#e5efff").circle(margin + 21, itemY + 11, 9).fill().restore();
        setFont("Helvetica-Bold", 7.5, COLORS.blue);
        document.text(String(item.number || ""), margin + 15, itemY + 7, { width: 12, align: "center" });
        setFont("Helvetica-Bold", 8.3, COLORS.text);
        document.text(cleanText(item.description || "Item"), margin + 36, itemY + 3, { width: listWidth - 58, lineGap: 1 });
        setFont("Helvetica", 7.5, COLORS.muted);
        document.text(`Qtd. ${cleanText(item.quantity) || "-"}  |  Código ${cleanText(item.code) || "-"}`, margin + 36, itemY + rowHeight - 16, { width: listWidth - 58 });
        if (index < items.length - 1) document.save().strokeColor(COLORS.line).lineWidth(0.5).moveTo(margin + 12, itemY + rowHeight - 1).lineTo(margin + listWidth - 12, itemY + rowHeight - 1).stroke().restore();
        itemY += rowHeight;
      });
      if (!items.length) {
        setFont("Helvetica", 8.5, COLORS.muted);
        document.text("Nenhum material informado.", margin + 12, y + 40, { width: listWidth - 24 });
      }
      y += listHeight + 12;
    };
    const getBlocks = (card) => {
      if (Array.isArray(card.blocks) && card.blocks.length) return card.blocks;
      const blocks = [];
      if (card.image) blocks.push({ type: "image", image: card.image, x: 5, y: 8, w: 90, h: 72, zIndex: 0 });
      if (card.text || card.html) blocks.push({ type: "text", text: card.text, html: card.html, x: 5, y: 8, w: 90, h: 28, zIndex: 1, tone: card.tone });
      return blocks;
    };
    const graphic = (block, x, top, width, height) => {
      const colors = toneColors(block.tone);
      const centerX = x + width / 2;
      const centerY = top + height / 2;
      const pixelToPoint = 0.75;
      const borderWidth = Math.max(0.75, (Number(block.borderWidth) || 3) * pixelToPoint);
      document.save().translate(centerX, centerY).rotate(Number(block.rotation) || 0).translate(-centerX, -centerY).lineWidth(borderWidth).strokeColor(colors.line);
      if (block.type === "circle") document.circle(centerX, centerY, Math.min(width, height) / 2 - 3).stroke();
      if (block.type === "square") document.rect(x + 3, top + 3, width - 6, height - 6).stroke();
      if (block.type === "arrow") {
        const headWidth = Math.min(Math.max(borderWidth * 5.3, 11 * pixelToPoint), width * 0.30);
        const headHeight = Math.min(Math.max(borderWidth * 6.6, 11 * pixelToPoint), height * 0.50);
        const padding = 2 * pixelToPoint;
        const tipX = x + width - padding;
        const baseX = tipX - headWidth;
        document.moveTo(x + padding, centerY).lineTo(baseX, centerY).stroke();
        document.moveTo(baseX, centerY - headHeight / 2).lineTo(tipX, centerY).lineTo(baseX, centerY + headHeight / 2).closePath().fillColor(colors.line).fill();
      }
      document.restore();
    };
    const stepCanvas = (card) => {
      const blocks = getBlocks(card).slice().sort((left, right) => (left.type === "image" ? -1 : 1) - (right.type === "image" ? -1 : 1) || (left.zIndex || 0) - (right.zIndex || 0));
      if (!blocks.length) {
        ensureSpace(68);
        document.save().roundedRect(margin, y, contentWidth, 54, 6).fillColor(COLORS.soft).fill().lineWidth(0.7).strokeColor(COLORS.line).stroke().restore();
        setFont("Helvetica", 8.5, COLORS.muted);
        document.text("Nenhum conteúdo visual informado nesta etapa.", margin + 14, y + 20, { width: contentWidth - 28, align: "center" });
        y += 66;
        return;
      }
      // Mantém o canvas do PDF amplo para aproximar a área de edição.
      const canvasHeight = 300;
      ensureSpace(canvasHeight + 30);
      const x = margin;
      const top = y;
      document.save().roundedRect(x, top, contentWidth, canvasHeight, 6).fillColor("#fbfcfe").fill().lineWidth(0.7).strokeColor(COLORS.line).stroke().restore();
      blocks.forEach((block) => {
        const blockX = x + (Number(block.x) / 100) * contentWidth;
        const blockY = top + (Number(block.y) / 100) * canvasHeight;
        const blockWidth = Math.max(24, (Number(block.w) / 100) * contentWidth);
        const blockHeight = Math.max(24, (Number(block.h) / 100) * canvasHeight);
        if (block.type === "image") {
          const image = dataUriToBuffer(block.image);
          if (image) drawImage(image, blockX, blockY, blockWidth, blockHeight);
        } else if (["arrow", "circle", "square"].includes(block.type)) {
          graphic(block, blockX, blockY, blockWidth, blockHeight);
        } else {
          const colors = toneColors(block.tone);
          const sourceText = block.html || block.text;
          const text = inlineText(sourceText);
          const richSegments = richInlineSegments(sourceText);
          const canvasScale = canvasHeight / 560;
          const textPadding = 8 * canvasScale;
          const fontSize = Math.max(7, Number(block.fontSize || 14) * canvasScale);
          setFont("Helvetica", fontSize, COLORS.text);
          const textWidth = Math.max(12, blockWidth - textPadding * 2);
          const textHeight = document.heightOfString(text, { width: textWidth, lineGap: 1 });
          const visibleHeight = Math.max(blockHeight, textHeight + textPadding * 2);
          document.save().roundedRect(blockX, blockY, blockWidth, visibleHeight, 5).fillColor(colors.fill).fill().lineWidth(2).strokeColor(colors.line).stroke().restore();
          richSegments.forEach((segment, index) => {
            setFont(segment.bold ? "Helvetica-Bold" : "Helvetica", fontSize, COLORS.text);
            const options = { width: textWidth, lineGap: 1, align: "justify", continued: index < richSegments.length - 1 };
            if (index === 0) {
              document.text(segment.text, blockX + textPadding, blockY + textPadding, options);
              return;
            }
            document.text(segment.text, options);
          });
        }
      });
      y += canvasHeight + 12;
    };

    startPage();
    setFont("Helvetica-Bold", 21, COLORS.navy);
    const title = cleanText(source.title || "Procedimento interno");
    const titleHeight = document.heightOfString(title, { width: contentWidth, lineGap: 2 });
    document.text(title, margin, y, { width: contentWidth, lineGap: 2 });
    y += titleHeight + 8;
    setFont("Helvetica", 10, COLORS.muted);
    document.text(`${cleanText(source.documentCode) || "Sem código"}  |  ${cleanText(source.equipmentName || source.equipmentCode) || "Equipamento não informado"}`, margin, y, { width: contentWidth });
    y += 24;
    paragraph(source.procedureDescription || "Procedimento interno do Sistema de Gestão da Qualidade.", 10, COLORS.muted, 14);

    heading("Controle do documento", "Identificação, revisão, aprovação e responsabilidades");
    infoGrid([
      ["Tipo de documento", info.documentType],
      ["Código", source.documentCode],
      ["Revisão vigente", revision[0]],
      ["Data da revisão", revision[1]],
      ["Elaboração", revision[3]],
      ["Aprovação", revision[4]],
      ["Status", source.documentStatus],
      ["Data da aprovação", info.approvalDate],
      ["Responsável pela execução", info.executionOwner],
      ["Setor", info.area],
    ]);
    heading("Histórico de revisões", "Registro das alterações e responsáveis pelo documento");
    revisionTable();

    nextPage();
    heading("Informações do SGQ", "Contexto de uso, responsabilidades e evidências esperadas");
    infoGrid([
      ["Objetivo", info.objective],
      ["Aplicação", info.application],
      ["Responsabilidades", info.responsibilities],
      ["Materiais, sistemas ou documentos relacionados", info.relatedDocs],
      ["Registros gerados", info.records],
      ["Critérios de aceitação", info.acceptanceCriteria],
      ["Tratamento de desvios", info.deviationTreatment],
      ["Rastreabilidade", info.traceability],
      ["Retenção de registros", info.retention],
      ["Mudanças climáticas", info.climateConsideration],
    ]);

    (source.sections || []).forEach((section) => {
      const itemCount = section.materials?.length || 0;
      const hasItemsImage = Boolean(section.images?.[0]);
      const minimumSpace = section.kind === "items"
        ? (hasItemsImage ? 520 : Math.max(220, 80 + itemCount * 34))
        : section.stepCards?.length ? 380 : 80;
      ensureSpace(minimumSpace);
      heading(`${cleanText(section.number || "")}  ${cleanText(section.title || "Seção")}`, section.kind === "items" ? "Materiais, identificação e quantidade" : "Sequência operacional e pontos de controle");
      if (section.kind === "items") itemsSection(section);
      (section.instructions || []).forEach((instruction, index) => {
        const colors = toneColors(section.instructionTones?.[index]);
        const instructionText = cleanText(instruction);
        setFont("Helvetica", 9, COLORS.text);
        const instructionHeight = Math.max(30, document.heightOfString(instructionText, { width: contentWidth - 44, lineGap: 1 }) + 16);
        ensureSpace(instructionHeight + 8);
        document.save().roundedRect(margin, y, contentWidth, instructionHeight, 5).fillColor(colors.fill).fill().lineWidth(2).strokeColor(colors.line).stroke().restore();
        setFont("Helvetica-Bold", 8.5, colors.line);
        document.text(`${index + 1}.`, margin + 10, y + 8, { width: 20 });
        document.text(instructionText, margin + 34, y + 8, { width: contentWidth - 44, lineGap: 1 });
        y += instructionHeight + 8;
      });
      (section.stepCards || []).forEach((card) => {
        ensureSpace(330);
        stepCanvas(card);
      });
      if (!(section.instructions || []).length && !(section.stepCards || []).length && section.kind !== "items") paragraph("Nenhum conteúdo operacional informado nesta etapa.", 9, COLORS.muted);
    });

    finishPage();
    document.end();
  });
}

module.exports = { createProcedurePdf };

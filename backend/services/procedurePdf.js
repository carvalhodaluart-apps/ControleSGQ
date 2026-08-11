const PDFDocument = require("pdfkit");
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const { getProcedureConfiguration } = require("./procedureConfiguration");
const { ITEM_SCENE_SIZE, STEP_SCENE_SIZE, renderProcedureItemBoards, renderProcedureStepCards } = require("./procedureSceneGraph");

const COLORS = {
  navy: "#17233d",
  blue: "#155eef",
  text: "#263957",
  stepText: "#000000",
  muted: "#60708a",
  line: "#d8e1ef",
  soft: "#f5f8fc",
  orange: "#f97316",
  success: "#16834b",
  successSoft: "#d7f1e1",
  warning: "#FFBF00",
  warningSoft: "#fff9d6",
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

function displayEquipmentName(procedure) {
  const value = cleanText(procedure?.equipmentName || procedure?.equipmentCode);
  return /^NOVO$/i.test(value) ? "" : value;
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

function wrapRichText(document, segments, width, fontSize) {
  const words = segments.flatMap((segment) => String(segment.text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((text) => ({ text, bold: segment.bold })));
  const lines = [];
  let current = [];
  let currentWidth = 0;
  const spaceWidth = () => {
    document.font("Helvetica").fontSize(fontSize);
    return document.widthOfString(" ");
  };
  words.forEach((word) => {
    document.font(word.bold ? "Helvetica-Bold" : "Helvetica").fontSize(fontSize);
    const wordWidth = document.widthOfString(word.text);
    const nextWidth = currentWidth + (current.length ? spaceWidth() : 0) + wordWidth;
    if (current.length && nextWidth > width) {
      lines.push({ words: current, width: currentWidth, containerWidth: width });
      current = [];
      currentWidth = 0;
    }
    current.push(word);
    currentWidth += (current.length > 1 ? spaceWidth() : 0) + wordWidth;
  });
  if (current.length) lines.push({ words: current, width: currentWidth, containerWidth: width });
  return lines;
}

function drawRichCenteredText(document, lines, x, y, fontSize, lineHeight, color) {
  lines.forEach((line, lineIndex) => {
    let cursorX = x + (line.containerWidth - line.width) / 2;
    line.words.forEach((word, wordIndex) => {
      document.font(word.bold ? "Helvetica-Bold" : "Helvetica").fontSize(fontSize).fillColor(color);
      document.text(word.text, cursorX, y + lineIndex * lineHeight, { lineBreak: false });
      cursorX += document.widthOfString(word.text);
      if (wordIndex < line.words.length - 1) {
        document.font("Helvetica").fontSize(fontSize);
        cursorX += document.widthOfString(" ");
      }
    });
  });
}

function dataUriToBuffer(value, cache = null) {
  const source = String(value || "");
  if (cache?.has(source)) return cache.get(source);
  const match = source.match(/^data:image\/(png|jpe?g);base64,(.+)$/i);
  const buffer = match ? Buffer.from(match[2], "base64") : null;
  if (cache && match) cache.set(source, buffer);
  return buffer;
}

const EQUIPMENT_IMAGE_FILES = {
  "PULMAO-DE-TESTE": "Pulmao-de-Teste.jpg",
};

function equipmentImageBuffer(procedure) {
  if (procedure?.equipmentImageMode === "none") return null;
  const customImage = dataUriToBuffer(procedure?.customEquipmentImage);
  if (customImage) return customImage;
  const code = String(procedure?.equipmentCode || "").toUpperCase();
  const filename = EQUIPMENT_IMAGE_FILES[code] || `${code}.png`;
  if (!code || code === "NOVO" || code === "OUTROS") return null;
  try {
    return fs.readFileSync(path.resolve(__dirname, "..", "..", "frontend", "assets", "equipamentos", filename));
  } catch (error) {
    return null;
  }
}

async function convertLegacyImages(value, cache = new Map()) {
  if (typeof value === "string" && /^data:image\/webp;base64,/i.test(value)) {
    if (cache.has(value)) return cache.get(value);
    const encoded = value.split(",", 2)[1];
    const png = await sharp(Buffer.from(encoded, "base64"), { limitInputPixels: 25_000_000 }).png().toBuffer();
    const converted = `data:image/png;base64,${png.toString("base64")}`;
    cache.set(value, converted);
    return converted;
  }
  if (Array.isArray(value)) return Promise.all(value.map((item) => convertLegacyImages(item, cache)));
  if (!value || typeof value !== "object") return value;
  const copy = {};
  await Promise.all(Object.entries(value).map(async ([key, item]) => {
    copy[key] = await convertLegacyImages(item, cache);
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
  const configuration = await convertLegacyImages(await getProcedureConfiguration());
  const needsItemBoardFallback = (source.sections || [])
    .some((section) => section.kind === "items" && section.images?.[0] && !section.sceneExport?.image);
  const needsStepCardFallback = (source.sections || [])
    .some((section) => (section.stepCards || []).some((card) => !card.sceneExport?.image));
  const renderedItemBoards = needsItemBoardFallback ? await renderProcedureItemBoards(source) : new Map();
  const renderedStepCards = needsStepCardFallback ? await renderProcedureStepCards(source) : new Map();
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
    const cover = configuration.cover || {};
    const imageBufferCache = new Map();
    const getImageBuffer = (value) => dataUriToBuffer(value, imageBufferCache);
    let y = 0;
    let pageNumber = 0;

    document.on("data", (chunk) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);

    const setFont = (name, size, color = COLORS.text) => {
      document.font(name).fontSize(size).fillColor(color);
    };
    const startPage = (withHeader = true) => {
      pageNumber += 1;
      if (withHeader) {
        document.save().fillColor(COLORS.orange).rect(margin, 24, contentWidth, 4).fill().restore();
        setFont("Helvetica-Bold", 8, COLORS.muted);
        document.text("PROCEDIMENTO INTERNO", margin, 36, { width: 220 });
        document.text(`${cleanText(source.documentCode || "") || "Sem código"} | Rev. ${cleanText(revision[0] || "00")}`, margin, 36, { width: contentWidth, align: "right" });
        y = 68;
      } else y = 36;
    };
    const finishPage = () => {
      const footerLineY = pageHeight - 56;
      document.save().strokeColor(COLORS.line).lineWidth(0.7).moveTo(margin, footerLineY).lineTo(pageWidth - margin, footerLineY).stroke().restore();
      setFont("Helvetica-Bold", 7.5, COLORS.muted);
      document.text("CÓPIA CONTROLADA", margin, pageHeight - 51, { width: 250, lineBreak: false });
      setFont("Helvetica", 6.5, COLORS.muted);
      document.text("Não é permitida cópia, reprodução ou divulgação deste documento sem consultar ao SGQ", margin, pageHeight - 40, { width: contentWidth - 92, lineBreak: false });
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
    const valueMetrics = (label, value, width) => {
      setFont("Helvetica-Bold", 7.5, COLORS.muted);
      const labelHeight = document.heightOfString(cleanText(label).toUpperCase(), { width, lineGap: 1 });
      setFont("Helvetica", 9.2, COLORS.text);
      const textHeight = document.heightOfString(cleanText(value) || "Não informado", { width, lineGap: 2 });
      const valueTop = Math.max(25, 9 + labelHeight + 8);
      return { height: Math.max(48, valueTop + textHeight + 14), valueTop };
    };
    const infoGrid = (items, columns = 2) => {
      const gap = 10;
      const cellWidth = (contentWidth - gap * (columns - 1)) / columns;
      for (let index = 0; index < items.length; index += columns) {
        const row = items.slice(index, index + columns);
        const rowMetrics = row.map(([label, value]) => valueMetrics(label, value, cellWidth - 20));
        const height = Math.max(...rowMetrics.map((metrics) => metrics.height));
        ensureSpace(height + gap);
        row.forEach(([label, value], column) => {
          const x = margin + column * (cellWidth + gap);
          document.save().roundedRect(x, y, cellWidth, height, 6).lineWidth(0.7).strokeColor(COLORS.line).fillColor("#fbfcfe").fillAndStroke().restore();
          setFont("Helvetica-Bold", 7.5, COLORS.muted);
          document.text(cleanText(label).toUpperCase(), x + 10, y + 9, { width: cellWidth - 20, lineGap: 1 });
          setFont("Helvetica", 9.2, COLORS.text);
          document.text(cleanText(value) || "Não informado", x + 10, y + rowMetrics[column].valueTop, { width: cellWidth - 20, lineGap: 2 });
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
        const label = String(marker.number || "");
        const labelWidth = 12;
        const labelFontSize = label.length > 1 ? 6.5 : 7.5;
        document.save().fillColor(COLORS.blue).circle(markerX, markerY, 8).fill().restore();
        setFont("Helvetica-Bold", labelFontSize, "#ffffff");
        const labelHeight = document.heightOfString(label, { width: labelWidth, lineBreak: false });
        document.text(label, markerX - labelWidth / 2, markerY - labelHeight / 2, { width: labelWidth, align: "center", lineBreak: false });
      });
    };
    const itemsSection = (section, sectionIndex) => {
      const imageKey = section.images?.[0] || "";
      const image = getImageBuffer(imageKey);
      const items = section.materials || [];
      if (image) {
        const imageHeight = contentWidth * (ITEM_SCENE_SIZE.height / ITEM_SCENE_SIZE.width);
        ensureSpace(imageHeight + 12);
        const renderedBoard = getImageBuffer(section.sceneExport?.image) || renderedItemBoards.get(String(sectionIndex));
        if (renderedBoard) document.image(renderedBoard, margin, y, { fit: [contentWidth, imageHeight] });
        else {
          drawImage(image, margin, y, contentWidth, imageHeight);
          drawMarkers(section, imageKey, margin, y, contentWidth, imageHeight);
        }
        y += imageHeight + 12;
      }
      const listWidth = contentWidth;
      const rowHeights = items.map((item) => {
        setFont("Helvetica-Bold", 8.3, COLORS.text);
        const descriptionHeight = document.heightOfString(cleanText(item.description || "Item"), { width: listWidth - 58, lineGap: 0 });
        return Math.max(30, descriptionHeight + 20);
      });
      const listHeight = Math.max(62, 31 + rowHeights.reduce((total, height) => total + height, 0));
      ensureSpace(listHeight + 6);
      document.save().roundedRect(margin, y, listWidth, listHeight, 5).fillColor("#fbfcfe").fill().lineWidth(0.7).strokeColor(COLORS.line).stroke().restore();
      setFont("Helvetica-Bold", 8.5, COLORS.navy);
      document.text("Materiais e identificação", margin + 12, y + 12, { width: listWidth - 24 });
      let itemY = y + 31;
      items.forEach((item, index) => {
        const rowHeight = rowHeights[index];
        document.save().fillColor("#e5efff").circle(margin + 21, itemY + 9, 7.5).fill().restore();
        setFont("Helvetica-Bold", 7, COLORS.blue);
        document.text(String(item.number || ""), margin + 15, itemY + 5, { width: 12, align: "center", lineBreak: false });
        setFont("Helvetica-Bold", 8.3, COLORS.text);
        document.text(cleanText(item.description || "Item"), margin + 36, itemY + 1, { width: listWidth - 58, lineGap: 0 });
        setFont("Helvetica", 7.5, COLORS.muted);
        document.text(`Qtd. ${cleanText(item.quantity) || "-"}  |  Código ${cleanText(item.code) || "-"}`, margin + 36, itemY + rowHeight - 16, { width: listWidth - 58 });
        if (index < items.length - 1) document.save().strokeColor(COLORS.line).lineWidth(0.5).moveTo(margin + 12, itemY + rowHeight - 1).lineTo(margin + listWidth - 12, itemY + rowHeight - 1).stroke().restore();
        itemY += rowHeight;
      });
      if (!items.length) {
        setFont("Helvetica", 8.5, COLORS.muted);
        document.text("Nenhum material informado.", margin + 12, y + 40, { width: listWidth - 24 });
      }
      y += listHeight + 8;
    };
    const getBlocks = (card) => {
      if (Array.isArray(card.blocks) && card.blocks.length) return card.blocks;
      const blocks = [];
      if (card.image) blocks.push({ type: "image", image: card.image, x: 5, y: 8, w: 90, h: 72, zIndex: 0 });
      if (card.text || card.html) blocks.push({ type: "text", text: card.text, html: card.html, x: 5, y: 8, w: 90, h: 28, zIndex: 1, tone: card.tone });
      return blocks;
    };
    const graphic = (block, x, top, width, height, unitScale) => {
      const colors = toneColors(block.tone);
      const centerX = x + width / 2;
      const centerY = top + height / 2;
      const borderWidth = Math.max(0.5, (Number(block.borderWidth) || 3) * unitScale);
      document.save().translate(centerX, centerY).rotate(Number(block.rotation) || 0).translate(-centerX, -centerY).lineWidth(borderWidth).strokeColor(colors.line);
      if (block.type === "circle") document.circle(centerX, centerY, Math.min(width, height) * 0.43).stroke();
      if (block.type === "square") document.rect(x + width * 0.12, top + height * 0.12, width * 0.76, height * 0.76).stroke();
      if (block.type === "arrow") {
        const headWidth = Math.min(Math.max(borderWidth * 5.3, 11 * unitScale), width * 0.30);
        const headHeight = Math.min(Math.max(borderWidth * 6.6, 11 * unitScale), height * 0.50);
        const padding = 2 * unitScale;
        const tipX = x + width - padding;
        const baseX = tipX - headWidth;
        document.lineCap("round").moveTo(x + padding, centerY).lineTo(baseX, centerY).stroke();
        document.moveTo(baseX, centerY - headHeight / 2).lineTo(tipX, centerY).lineTo(baseX, centerY + headHeight / 2).closePath().fillColor(colors.line).fill();
      }
      document.restore();
    };
    const stepCanvas = (card, sectionIndex, cardIndex) => {
      const blocks = getBlocks(card).slice().sort((left, right) => (left.type === "image" ? -1 : 1) - (right.type === "image" ? -1 : 1) || (left.zIndex || 0) - (right.zIndex || 0));
      if (!blocks.length) {
        ensureSpace(68);
        document.save().roundedRect(margin, y, contentWidth, 54, 6).fillColor(COLORS.soft).fill().lineWidth(0.7).strokeColor(COLORS.line).stroke().restore();
        setFont("Helvetica", 8.5, COLORS.muted);
        document.text("Nenhum conteúdo visual informado nesta etapa.", margin + 14, y + 20, { width: contentWidth - 28, align: "center" });
        y += 66;
        return;
      }
      const editorCanvasWidth = STEP_SCENE_SIZE.width;
      const editorCanvasHeight = STEP_SCENE_SIZE.height;
      const canvasHeight = contentWidth * (editorCanvasHeight / editorCanvasWidth);
      const canvasScale = canvasHeight / editorCanvasHeight;
      ensureSpace(canvasHeight + 30);
      const x = margin;
      const top = y;
      const renderedCard = getImageBuffer(card.sceneExport?.image) || renderedStepCards.get(`${sectionIndex}:${cardIndex}`);
      if (renderedCard) {
        document.image(renderedCard, x, top, { fit: [contentWidth, canvasHeight] });
        y += canvasHeight + 12;
        return;
      }
      document.save().roundedRect(x, top, contentWidth, canvasHeight, 6).fillColor("#fbfcfe").fill().lineWidth(0.7).strokeColor(COLORS.line).stroke().restore();
      blocks.forEach((block) => {
        const blockX = x + (Number(block.x) / 100) * contentWidth;
        const blockY = top + (Number(block.y) / 100) * canvasHeight;
        const blockWidth = Math.max(24, (Number(block.w) / 100) * contentWidth);
        const blockHeight = Math.max(24, (Number(block.h) / 100) * canvasHeight);
        if (block.type === "image") {
          const image = getImageBuffer(block.image);
          if (image) drawImage(image, blockX, blockY, blockWidth, blockHeight);
        } else if (["arrow", "circle", "square"].includes(block.type)) {
          graphic(block, blockX, blockY, blockWidth, blockHeight, canvasScale);
        } else {
          const colors = toneColors(block.tone);
          const sourceText = block.html || block.text;
          const richSegments = richInlineSegments(sourceText);
          const textPadding = 8 * canvasScale;
          const fontSize = Math.max(7, Number(block.fontSize || 14) * canvasScale);
          const textWidth = Math.max(12, blockWidth - textPadding * 2);
          const richLines = wrapRichText(document, richSegments, textWidth, fontSize);
          const lineHeight = fontSize * 1.35;
          const textHeight = Math.max(lineHeight, richLines.length * lineHeight);
          const visibleHeight = Math.max(blockHeight, textHeight + textPadding * 2);
          document.save().roundedRect(blockX, blockY, blockWidth, visibleHeight, 5).fillColor(colors.fill).fill().lineWidth(2).strokeColor(colors.line).stroke().restore();
          drawRichCenteredText(document, richLines, blockX + textPadding, blockY + textPadding, fontSize, lineHeight, COLORS.stepText);
        }
      });
      y += canvasHeight + 12;
    };

    const coverImage = getImageBuffer(cover.imageData);
    const equipmentImage = equipmentImageBuffer(source);
    if (coverImage) {
      startPage(false);
      const coverX = 0;
      const coverY = 0;
      const coverWidth = pageWidth;
      const coverHeight = pageHeight;
      document.image(coverImage, coverX, coverY, { fit: [coverWidth, coverHeight], align: "center", valign: "center" });
      // Keep the PDF cover proportional to the A4 preview used in the editor.
      const overlayWidth = coverWidth * 0.68;
      const overlayHeight = 124;
      const coverPaddingX = coverWidth * (16 / 520);
      const coverPaddingY = coverHeight * (16 / 842);
      const position = String(cover.overlayPosition || "center");
      const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
      const horizontal = position === "custom"
        ? clamp(coverX + coverWidth * Number(cover.overlayX || 0.5) - overlayWidth / 2, coverX + coverPaddingX, coverX + coverWidth - overlayWidth - coverPaddingX)
        : position.endsWith("left") ? coverX + coverPaddingX : position.endsWith("right") ? coverX + coverWidth - overlayWidth - coverPaddingX : coverX + (coverWidth - overlayWidth) / 2;
      const vertical = position === "custom"
        ? clamp(coverY + coverHeight * Number(cover.overlayY || 0.5) - overlayHeight / 2, coverY + coverPaddingY, coverY + coverHeight - overlayHeight - coverPaddingY)
        : position.startsWith("top") ? coverY + coverPaddingY : position.startsWith("bottom") ? coverY + coverHeight - overlayHeight - coverPaddingY : coverY + (coverHeight - overlayHeight) / 2;
      document.save().roundedRect(horizontal, vertical, overlayWidth, overlayHeight, 6).fillOpacity(0.9).fillColor("#ffffff").fill().restore();
      const equipmentTileSize = equipmentImage ? 76 : 0;
      const textWidth = overlayWidth - 28 - (equipmentImage ? equipmentTileSize + 10 : 0);
      if (equipmentImage) {
        const tileX = horizontal + overlayWidth - equipmentTileSize - 12;
        const tileY = vertical + (overlayHeight - equipmentTileSize) / 2;
        document.save().roundedRect(tileX, tileY, equipmentTileSize, equipmentTileSize, 5).fillOpacity(0.94).fillColor("#ffffff").fill().lineWidth(0.7).strokeColor(COLORS.line).stroke().restore();
        document.image(equipmentImage, tileX + 5, tileY + 5, { fit: [equipmentTileSize - 10, equipmentTileSize - 10], align: "center", valign: "center" });
      }
      setFont("Helvetica-Bold", 9, COLORS.orange);
      document.text("PROCEDIMENTO INTERNO", horizontal + 14, vertical + 13, { width: textWidth });
      setFont("Helvetica-Bold", 20, COLORS.navy);
      const coverTitle = cleanText(source.title || "Procedimento interno");
      document.text(coverTitle, horizontal + 14, vertical + 30, { width: textWidth, lineGap: 2 });
      setFont("Helvetica", 9, COLORS.muted);
      const coverMeta = [cleanText(source.documentCode) || "Sem código", displayEquipmentName(source)].filter(Boolean).join("  |  ");
      document.text(coverMeta, horizontal + 14, vertical + 78, { width: textWidth });
      document.addPage();
      startPage();
    } else {
      startPage();
      setFont("Helvetica-Bold", 21, COLORS.navy);
      const title = cleanText(source.title || "Procedimento interno");
      const titleWidth = equipmentImage ? contentWidth - 108 : contentWidth;
      const titleHeight = document.heightOfString(title, { width: titleWidth, lineGap: 2 });
      document.text(title, margin, y, { width: titleWidth, lineGap: 2 });
      y += titleHeight + 8;
      setFont("Helvetica", 10, COLORS.muted);
      const documentMeta = [cleanText(source.documentCode) || "Sem código", displayEquipmentName(source)].filter(Boolean).join("  |  ");
      document.text(documentMeta, margin, y, { width: titleWidth });
      y += 24;
      if (equipmentImage) {
        const tileSize = 90;
        const tileX = margin + contentWidth - tileSize;
        const tileY = 68;
        document.save().roundedRect(tileX, tileY, tileSize, tileSize, 5).fillColor("#ffffff").fill().lineWidth(0.7).strokeColor(COLORS.line).stroke().restore();
        document.image(equipmentImage, tileX + 6, tileY + 6, { fit: [tileSize - 12, tileSize - 12], align: "center", valign: "center" });
      }
      paragraph(source.procedureDescription || "Procedimento interno do Sistema de Gestão da Qualidade.", 10, COLORS.muted, 14, titleWidth);
    }

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
    infoGrid(configuration.qualityFields
      .filter((field) => field.active !== false && field.active !== 0 && String(field.active).toLowerCase() !== "false")
      .map((field) => [field.label, info[field.key]]));

    (source.sections || []).forEach((section, sectionIndex) => {
      const itemCount = section.materials?.length || 0;
      const hasItemsImage = Boolean(section.images?.[0]);
      const estimatedListHeight = Math.max(62, 31 + itemCount * 30);
      const estimatedImageHeight = hasItemsImage
        ? contentWidth * (ITEM_SCENE_SIZE.height / ITEM_SCENE_SIZE.width) + 12
        : 0;
      const minimumSpace = section.kind === "items"
        ? Math.max(200, 54 + estimatedImageHeight + estimatedListHeight + 8)
        : section.stepCards?.length ? 380 : 80;
      ensureSpace(minimumSpace);
      heading(`${cleanText(section.number || "")}  ${cleanText(section.title || "Seção")}`, section.kind === "items" ? "Materiais, identificação e quantidade" : "Sequência operacional e pontos de controle");
      if (section.kind === "items") itemsSection(section, sectionIndex);
      (section.instructions || []).forEach((instruction, index) => {
        const colors = toneColors(section.instructionTones?.[index]);
        const instructionText = cleanText(instruction);
        setFont("Helvetica", 9, COLORS.stepText);
        const instructionHeight = Math.max(30, document.heightOfString(instructionText, { width: contentWidth - 44, lineGap: 1 }) + 16);
        ensureSpace(instructionHeight + 8);
        document.save().roundedRect(margin, y, contentWidth, instructionHeight, 5).fillColor(colors.fill).fill().lineWidth(2).strokeColor(colors.line).stroke().restore();
        setFont("Helvetica-Bold", 8.5, colors.line);
        document.text(`${index + 1}.`, margin + 10, y + 8, { width: 20 });
        document.text(instructionText, margin + 34, y + 8, { width: contentWidth - 44, lineGap: 1 });
        y += instructionHeight + 8;
      });
      (section.stepCards || []).forEach((card, cardIndex) => {
        ensureSpace(330);
        stepCanvas(card, sectionIndex, cardIndex);
      });
      if (!(section.instructions || []).length && !(section.stepCards || []).length && section.kind !== "items") paragraph("Nenhum conteúdo operacional informado nesta etapa.", 9, COLORS.muted);
    });

    finishPage();
    document.end();
  });
}

module.exports = { createProcedurePdf };

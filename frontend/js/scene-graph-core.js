(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SceneGraphCore = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const STEP_SCENE_SIZE = { width: 1080, height: 560 };
  const ITEM_SCENE_SIZE = { width: 742, height: 520 };
  const SCENE_SCHEMA_VERSION = 1;
  const HIERARCHY_STEP = 1000;
  const HIERARCHY_RANKS = { image: 0, arrow: 1, circle: 1, square: 1, text: 2 };
  const TONES = {
    success: { fill: "#effaf3", stroke: "#159447", text: "#000000" },
    warning: { fill: "#fff9d6", stroke: "#FFBF00", text: "#000000" },
    danger: { fill: "#fff1f0", stroke: "#d92d20", text: "#000000" },
  };

  function escapeXml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    }[char]));
  }

  function safeImageSource(value) {
    const image = String(value ?? "").trim();
    return /^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/]+={0,2}$/i.test(image) && image.length <= 12_000_000 ? image : "";
  }

  function stripHtml(value) {
    return String(value || "")
      .replace(/<br\s*\/?\s*>/gi, " ")
      .replace(/<\/(?:div|p)>/gi, " ")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/\s+/g, " ")
      .trim();
  }

  function inlineSegments(value) {
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
      const text = stripHtml(token);
      if (text) segments.push({ text, bold });
    });
    return segments.length ? segments : [{ text: stripHtml(value), bold: false }];
  }

  function scaleRect(block, size) {
    return {
      x: (Number(block.x) || 0) * size.width / 100,
      y: (Number(block.y) || 0) * size.height / 100,
      width: (Number(block.w) || 0) * size.width / 100,
      height: (Number(block.h) || 0) * size.height / 100,
    };
  }

  function toFinite(value, fallback = 0) {
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
  }

  function hierarchyRank(type) {
    return HIERARCHY_RANKS[type] ?? HIERARCHY_RANKS.text;
  }

  function sortSceneElements(elements) {
    return (elements || [])
      .map((element, index) => ({ element, index }))
      .sort((first, second) => (
        hierarchyRank(first.element.type) - hierarchyRank(second.element.type)
        || (Number(first.element.order) || 0) - (Number(second.element.order) || 0)
        || first.index - second.index
      ))
      .map(({ element }, index) => {
        element.order = hierarchyRank(element.type) * HIERARCHY_STEP + index;
        return element;
      });
  }

  function enforceSceneOrder(scene) {
    if (scene) scene.elements = sortSceneElements(scene.elements);
    return scene;
  }

  function legacyBlocks(card) {
    if (Array.isArray(card.blocks) && card.blocks.length) return card.blocks;
    const blocks = [];
    if (card.image) blocks.push({ type: "image", image: card.image, x: card.text ? 52 : 5, y: 8, w: card.text ? 43 : 90, h: 72, zIndex: 0, annotations: card.annotations || [] });
    if (card.text || card.html) blocks.push({ type: "text", text: card.text, html: card.html, tone: card.tone, x: 5, y: 8, w: card.image ? 42 : 90, h: 30, zIndex: 1, fontSize: 20 });
    return blocks;
  }

  function blockToElement(block, blockIndex, card, size = STEP_SCENE_SIZE) {
    return {
      id: block.id || `step-block-${blockIndex}`,
      type: block.type || "text",
      ...scaleRect(block, size),
      rotation: Number(block.rotation) || 0,
      order: block.type === "image" ? 0 : 10 + (Number(block.zIndex) || blockIndex),
      opacity: Math.max(0, Math.min(1, toFinite(block.opacity, 1))),
      locked: Boolean(block.locked),
      tone: block.tone || card.tone || "success",
      text: block.text || stripHtml(block.html),
      html: block.html || "",
      renderLines: Array.isArray(block.renderLines) ? block.renderLines : [],
      styles: block.styles || {},
      fontSize: Number(block.fontSize) || 20,
      fontFamily: block.fontFamily || "Arial, Helvetica, sans-serif",
      fontWeight: toFinite(block.fontWeight, 400),
      textAlign: block.textAlign || "center",
      color: block.color || "#000000",
      image: block.image || "",
      fit: block.fit || "contain",
      borderWidth: Number(block.borderWidth) || 3,
      flipX: Boolean(block.flipX),
      flipY: Boolean(block.flipY),
      annotations: block.annotations || [],
    };
  }

  function normalizeSceneElement(element, elementIndex = 0) {
    const type = ["image", "text", "arrow", "circle", "square"].includes(element?.type) ? element.type : "text";
    const normalized = {
      id: element?.id || `${type}-${elementIndex}`,
      type,
      x: toFinite(element?.x, 0),
      y: toFinite(element?.y, 0),
      width: Math.max(1, toFinite(element?.width, type === "arrow" ? 86 : 80)),
      height: Math.max(1, toFinite(element?.height, type === "arrow" ? 28 : 60)),
      rotation: toFinite(element?.rotation, 0),
      order: toFinite(element?.order, type === "image" ? 0 : elementIndex + 10),
      opacity: Math.max(0, Math.min(1, toFinite(element?.opacity, 1))),
      locked: Boolean(element?.locked),
      tone: element?.tone || "success",
      text: element?.text || stripHtml(element?.html),
      html: element?.html || "",
      renderLines: Array.isArray(element?.renderLines) ? element.renderLines : [],
      styles: element?.styles || {},
      fontSize: Math.max(8, toFinite(element?.fontSize, 20)),
      fontFamily: element?.fontFamily || "Arial, Helvetica, sans-serif",
      fontWeight: toFinite(element?.fontWeight, 400),
      textAlign: element?.textAlign || "center",
      color: element?.color || "#000000",
      image: element?.image || "",
      fit: element?.fit || "contain",
      borderWidth: Math.max(1, toFinite(element?.borderWidth, 3)),
      flipX: Boolean(element?.flipX),
      flipY: Boolean(element?.flipY),
      annotations: Array.isArray(element?.annotations) ? element.annotations : [],
    };
    return element && typeof element === "object" ? Object.assign(element, normalized) : normalized;
  }

  function normalizeScene(scene, fallbackId, size, fallbackElements = []) {
    const sourceSize = scene?.size || size;
    const elements = Array.isArray(scene?.elements) && scene.elements.length ? scene.elements : fallbackElements;
    return {
      id: scene?.id || fallbackId,
      schemaVersion: SCENE_SCHEMA_VERSION,
      renderer: scene?.renderer || "fabric",
      size: {
        width: Math.max(1, toFinite(sourceSize.width, size.width)),
        height: Math.max(1, toFinite(sourceSize.height, size.height)),
      },
      elements: sortSceneElements(elements.map(normalizeSceneElement)),
    };
  }

  function sceneToBlocks(scene, card = {}) {
    const normalized = normalizeScene(scene, scene?.id || "scene-step", STEP_SCENE_SIZE);
    const size = normalized.size;
    return normalized.elements.map((element, index) => ({
      id: element.id,
      type: element.type,
      text: element.text || "",
      html: element.html || "",
      tone: element.tone || card.tone || "success",
      image: element.image || "",
      annotations: element.annotations || [],
      rotation: element.rotation || 0,
      opacity: element.opacity ?? 1,
      locked: Boolean(element.locked),
      flipX: Boolean(element.flipX),
      flipY: Boolean(element.flipY),
      borderWidth: element.borderWidth || 3,
      fontSize: element.fontSize || 20,
      fontFamily: element.fontFamily || "Arial, Helvetica, sans-serif",
      fontWeight: element.fontWeight || 400,
      textAlign: element.textAlign || "center",
      color: element.color || "#000000",
      fit: element.fit || "contain",
      renderLines: element.renderLines || [],
      styles: element.styles || {},
      x: (element.x / size.width) * 100,
      y: (element.y / size.height) * 100,
      w: (element.width / size.width) * 100,
      h: (element.height / size.height) * 100,
      zIndex: element.type === "image" ? 0 : toFinite(element.order, index + 10) - 10,
    }));
  }

  function sceneFromBlocks(card, sectionIndex = 0, cardIndex = 0) {
    const fallbackId = card.scene?.id || `scene-step-${sectionIndex}-${cardIndex}`;
    const elements = legacyBlocks(card).map((block, blockIndex) => ({
      ...blockToElement(block, blockIndex, card, STEP_SCENE_SIZE),
      id: block.id || `step-${sectionIndex}-${cardIndex}-${blockIndex}`,
    }));
    return normalizeScene(null, fallbackId, STEP_SCENE_SIZE, elements);
  }

  function cardToScene(card, sectionIndex = 0, cardIndex = 0) {
    if (card?.scene) return normalizeScene(card.scene, `scene-step-${sectionIndex}-${cardIndex}`, STEP_SCENE_SIZE);
    return sceneFromBlocks(card || {}, sectionIndex, cardIndex);
  }

  function normalizeCardScene(card, sectionIndex = 0, cardIndex = 0) {
    const scene = cardToScene(card, sectionIndex, cardIndex);
    card.scene = scene;
    card.blocks = sceneToBlocks(scene, card);
    return scene;
  }

  function syncCardSceneFromBlocks(card, sectionIndex = 0, cardIndex = 0) {
    card.scene = sceneFromBlocks(card, sectionIndex, cardIndex);
    return card.scene;
  }

  function syncProcedureScenes(procedure) {
    (procedure?.sections || []).forEach((section, sectionIndex) => {
      (section.stepCards || []).forEach((card, cardIndex) => normalizeCardScene(card, sectionIndex, cardIndex));
    });
    return procedure;
  }

  function itemSectionToScene(section, sectionIndex = 0) {
    const image = section.images?.[0] || "";
    const annotations = image ? (section.annotations?.[image] || []) : [];
    const elements = image ? [{
      id: `items-${sectionIndex}-image`,
      type: "image",
      x: 0,
      y: 0,
      width: ITEM_SCENE_SIZE.width,
      height: ITEM_SCENE_SIZE.height,
      rotation: 0,
      order: 0,
      tone: "success",
      image,
      borderWidth: 3,
      annotations: annotations.filter((annotation) => annotation.type === "marker"),
    }] : [];
    return { id: `scene-items-${sectionIndex}`, version: 1, size: ITEM_SCENE_SIZE, elements };
  }

  function glyphWidth(char) {
    if (char === " ") return 0.23;
    if (/[.,:;!|'`]/.test(char)) return 0.2;
    if (/[ijlI1]/.test(char)) return 0.25;
    if (/[ft]/.test(char)) return 0.32;
    if (/[mwMW@%]/.test(char)) return 0.7;
    if (/[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(char)) return 0.58;
    if (/[A-Z]/.test(char)) return 0.52;
    if (/[0-9]/.test(char)) return 0.47;
    return 0.42;
  }

  function wordWidth(word, fontSize) {
    const weight = word.bold ? 1.08 : 1;
    return [...String(word.text)].reduce((total, char) => total + glyphWidth(char) * fontSize * weight, 0);
  }

  function wrapSegments(segments, maxWidth, fontSize) {
    const lines = [];
    let current = [];
    let width = 0;
    const spaceWidth = fontSize * 0.25;
    segments.flatMap((segment) => String(segment.text).split(/\s+/).filter(Boolean).map((text) => ({ text, bold: segment.bold }))).forEach((word) => {
      const next = width + (current.length ? spaceWidth : 0) + wordWidth(word, fontSize);
      if (current.length && next > maxWidth) {
        lines.push(current);
        current = [];
        width = 0;
      }
      current.push(word);
      width += (current.length > 1 ? spaceWidth : 0) + wordWidth(word, fontSize);
    });
    if (current.length) lines.push(current);
    return lines;
  }

  function normalizeRenderLines(lines) {
    if (!Array.isArray(lines)) return [];
    return lines.map((line) => {
      if (Array.isArray(line)) {
        return line
          .map((word) => (typeof word === "string" ? { text: word, bold: false } : { text: word?.text, bold: Boolean(word?.bold) }))
          .filter((word) => String(word.text || "").trim());
      }
      return String(line || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((text) => ({ text, bold: false }));
    }).filter((line) => line.length);
  }

  function lineWidth(line, fontSize) {
    const spaceWidth = fontSize * 0.23;
    return line.reduce((total, word, index) => total + (index ? spaceWidth : 0) + wordWidth(word, fontSize), 0);
  }

  function renderText(element) {
    const tone = TONES[element.tone] || TONES.success;
    const fontSize = Math.max(8, Number(element.fontSize) || 20);
    const textPadding = 8;
    const textWidth = Math.max(8, element.width - textPadding * 2);
    const explicitLines = normalizeRenderLines(element.renderLines);
    const lines = explicitLines.length ? explicitLines : wrapSegments(inlineSegments(element.html || element.text), textWidth, fontSize);
    const lineHeight = fontSize * 1.35;
    const textHeight = Math.max(lineHeight, lines.length * lineHeight);
    const startY = element.y + Math.max(fontSize, (element.height - textHeight) / 2 + fontSize * 0.95);
    const text = lines.map((line, index) => {
      const estimatedWidth = lineWidth(line, fontSize);
      const fitScale = explicitLines.length && estimatedWidth >= textWidth * 0.78
        ? Math.max(0.84, Math.min(1, textWidth / (estimatedWidth * 1.28)))
        : 1;
      return `<text x="${element.x + element.width / 2}" y="${startY + index * lineHeight}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize * fitScale}" fill="${tone.text}" xml:space="preserve">${line.map((word, wordIndex) => `<tspan font-weight="${word.bold ? 800 : 400}">${escapeXml(`${wordIndex ? " " : ""}${word.text}`)}</tspan>`).join("")}</text>`;
    }).join("");
    return `<g transform="rotate(${element.rotation} ${element.x + element.width / 2} ${element.y + element.height / 2})"><rect x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" rx="8" fill="${tone.fill}" stroke="${tone.stroke}" stroke-width="2"></rect><rect x="${element.x}" y="${element.y}" width="8" height="${element.height}" rx="8" fill="${tone.stroke}"></rect>${text}</g>`;
  }

  function renderAnnotations(element) {
    return (element.annotations || []).map((annotation) => {
      const x = element.x + (Number(annotation.x) || 0) * element.width / 100;
      const y = element.y + (Number(annotation.y) || 0) * element.height / 100;
      if (annotation.type === "marker") {
        const label = String(annotation.number ?? "");
        const fontSize = label.length > 1 ? 15 : 18;
        return `<circle cx="${x}" cy="${y}" r="16" fill="#155eef" stroke="#fff" stroke-width="3"></circle><text x="${x}" y="${y}" dominant-baseline="middle" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="800" fill="#fff">${escapeXml(label)}</text>`;
      }
      const color = (TONES[annotation.tone || "success"] || TONES.success).stroke;
      return `<g transform="translate(${x} ${y}) rotate(${Number(annotation.rotation) || 0})"><line x1="-9" y1="0" x2="78" y2="0" stroke="${color}" stroke-width="5" stroke-linecap="round"></line><polygon points="78,0 60,-10 60,10" fill="${color}"></polygon></g>`;
    }).join("");
  }

  function renderElement(element) {
    const tone = TONES[element.tone] || TONES.success;
    const cx = element.x + element.width / 2;
    const cy = element.y + element.height / 2;
    const transform = `rotate(${element.rotation} ${cx} ${cy})`;
    if (element.type === "image") {
      const imageSource = safeImageSource(element.image);
      if (!imageSource) return "";
      const flip = element.flipX || element.flipY ? ` translate(${cx} ${cy}) scale(${element.flipX ? -1 : 1} ${element.flipY ? -1 : 1}) translate(${-cx} ${-cy})` : "";
      return `<g transform="${transform}${flip}"><image href="${escapeXml(imageSource)}" x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" preserveAspectRatio="xMidYMid meet"></image>${renderAnnotations(element)}</g>`;
    }
    if (element.type === "arrow") {
      const y = element.y + element.height / 2;
      const stroke = Math.max(1, Number(element.borderWidth) || 3);
      return `<g transform="${transform}"><line x1="${element.x}" y1="${y}" x2="${element.x + element.width - 18}" y2="${y}" stroke="${tone.stroke}" stroke-width="${stroke}" stroke-linecap="round"></line><polygon points="${element.x + element.width},${y} ${element.x + element.width - 20},${y - 11} ${element.x + element.width - 20},${y + 11}" fill="${tone.stroke}"></polygon></g>`;
    }
    if (element.type === "circle") return `<ellipse transform="${transform}" cx="${cx}" cy="${cy}" rx="${Math.max(1, element.width / 2 - element.borderWidth)}" ry="${Math.max(1, element.height / 2 - element.borderWidth)}" fill="none" stroke="${tone.stroke}" stroke-width="${element.borderWidth}"></ellipse>`;
    if (element.type === "square") return `<rect transform="${transform}" x="${element.x}" y="${element.y}" width="${element.width}" height="${element.height}" fill="none" stroke="${tone.stroke}" stroke-width="${element.borderWidth}"></rect>`;
    return renderText(element);
  }

  function sceneToSvg(scene, emptyLabel = "Scene graph vazio") {
    const size = scene.size || STEP_SCENE_SIZE;
    const content = scene.elements.length
      ? scene.elements.map(renderElement).join("")
      : `<text x="${size.width / 2}" y="${size.height / 2}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="28" fill="#64748b">${escapeXml(emptyLabel)}</text>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size.width} ${size.height}" width="${size.width}" height="${size.height}"><rect width="100%" height="100%" fill="#ffffff"></rect>${content}</svg>`;
  }

  return {
    ITEM_SCENE_SIZE,
    STEP_SCENE_SIZE,
    SCENE_SCHEMA_VERSION,
    TONES,
    cardToScene,
    itemSectionToScene,
    normalizeCardScene,
    normalizeRenderLines,
    normalizeScene,
    enforceSceneOrder,
    hierarchyRank,
    sceneFromBlocks,
    sortSceneElements,
    sceneToBlocks,
    sceneToSvg,
    safeImageSource,
    syncCardSceneFromBlocks,
    syncProcedureScenes,
  };
}));

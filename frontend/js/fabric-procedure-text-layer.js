(function () {
  const Core = window.SceneGraphCore;
  if (!Core) return;

  const MIN_WIDTH = 160;
  const MIN_HEIGHT = 56;
  const PADDING = 14;
  const STRIPE_WIDTH = 8;

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[char]));
  }

  function toneOf(tone) {
    return Core.TONES?.[tone] || Core.TONES.success;
  }

  function sanitizeHtml(value) {
    const source = document.createElement("div");
    source.innerHTML = String(value || "");
    const walk = (node) => [...node.childNodes].map((child) => {
      if (child.nodeType === Node.TEXT_NODE) return escapeHtml(child.nodeValue);
      if (child.nodeType !== Node.ELEMENT_NODE) return "";
      if (child.tagName === "BR") return "<br>";
      const content = walk(child);
      return ["STRONG", "B"].includes(child.tagName) ? `<strong>${content}</strong>` : content;
    }).join("");
    return walk(source);
  }

  function htmlFromElement(element) {
    return sanitizeHtml(element.html || escapeHtml(element.text || ""));
  }

  function plainText(content) {
    return String(content.innerText || content.textContent || "")
      .replace(/\u00a0/g, " ")
      .replace(/\r/g, "");
  }

  function visualRenderLines(content) {
    const lines = [];
    let line = [];
    let word = null;
    let lineTop = null;
    const finishWord = () => {
      if (word?.text) line.push(word);
      word = null;
    };
    const finishLine = () => {
      finishWord();
      if (line.length) lines.push(line);
      line = [];
    };
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const bold = Boolean(node.parentElement?.closest("strong, b"));
      [...node.nodeValue].forEach((char, index) => {
        if (/\s/.test(char)) return finishWord();
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + 1);
        const rect = range.getClientRects()[0];
        if (rect && lineTop !== null && Math.abs(rect.top - lineTop) > 1.5) finishLine();
        if (rect) lineTop = rect.top;
        if (!word || word.bold !== bold) {
          finishWord();
          word = { text: "", bold };
        }
        word.text += char;
      });
    }
    finishLine();
    return lines;
  }

  function sceneScale(session) {
    const size = session.card.scene.size;
    const rect = session.textLayer.getBoundingClientRect();
    return rect.width / size.width || 1;
  }

  function updateProcedureTextBoxLayout(component, options = {}) {
    const { element, root, content, stripe } = component;
    const scale = sceneScale(component.session);
    const width = Math.max(MIN_WIDTH, Number(options.width ?? element.width) || MIN_WIDTH);
    const autoHeight = options.autoHeight !== false;
    const requestedHeight = Math.max(MIN_HEIGHT, Number(options.height ?? element.height) || MIN_HEIGHT);
    const tone = toneOf(element.tone);
    root.style.width = `${width * scale}px`;
    root.style.height = "auto";
    root.style.left = `${(Number(element.x) || 0) * scale}px`;
    root.style.top = `${(Number(element.y) || 0) * scale}px`;
    root.style.transform = `rotate(${Number(element.rotation) || 0}deg)`;
    root.style.setProperty("--procedure-scale", scale);
    root.style.setProperty("--procedure-fill", tone.fill);
    root.style.setProperty("--procedure-stroke", tone.stroke);
    stripe.style.height = "100%";
    content.style.fontSize = `${(Number(element.fontSize) || 20) * scale}px`;
    content.style.lineHeight = String(Number(element.lineHeight) || 1.35);
    content.style.padding = `${PADDING * scale}px ${PADDING * scale}px ${PADDING * scale}px ${(PADDING + STRIPE_WIDTH) * scale}px`;
    const measuredHeight = Math.max(MIN_HEIGHT * scale, content.scrollHeight || MIN_HEIGHT * scale);
    const height = autoHeight ? Math.max(MIN_HEIGHT * scale, measuredHeight) : requestedHeight * scale;
    root.style.height = `${height}px`;
    element.width = width;
    element.height = height / scale;
    component.session.canvas.requestRenderAll();
    return element.height;
  }

  function syncModel(component) {
    const { element, content, session } = component;
    element.html = sanitizeHtml(content.innerHTML);
    element.text = plainText(content);
    element.renderLines = visualRenderLines(content);
    session.card.blocks = Core.sceneToBlocks(session.card.scene, session.card);
    return element;
  }

  function selectionInside(content) {
    const selection = window.getSelection?.();
    if (!selection?.rangeCount) return null;
    const range = selection.getRangeAt(0);
    if (!content.contains(range.commonAncestorContainer)) return null;
    return range.cloneRange();
  }

  function textOffset(root, container, offset) {
    const range = document.createRange();
    range.selectNodeContents(root);
    range.setEnd(container, offset);
    return range.toString().length;
  }

  function pointAtTextOffset(root, target) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const wanted = Math.max(0, Number(target) || 0);
    let node;
    let last = null;
    let total = 0;
    while ((node = walker.nextNode())) {
      last = node;
      const length = node.nodeValue.length;
      if (wanted <= total + length) return { node, offset: wanted - total };
      total += length;
    }
    return last ? { node: last, offset: last.nodeValue.length } : { node: root, offset: root.childNodes.length };
  }

  function restoreTextSelection(root, start, end) {
    const selection = window.getSelection();
    const range = document.createRange();
    const startPoint = pointAtTextOffset(root, start);
    const endPoint = pointAtTextOffset(root, end);
    range.setStart(startPoint.node, startPoint.offset);
    range.setEnd(endPoint.node, endPoint.offset);
    selection.removeAllRanges();
    selection.addRange(range);
    return range;
  }

  function saveRange(component) {
    component.range = selectionInside(component.content) || component.range;
  }

  function restoreRange(component) {
    if (!component.range) return null;
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(component.range);
    component.content.focus({ preventScroll: true });
    return component.range;
  }

  function clearNativeSelection() {
    const selection = window.getSelection?.();
    if (selection?.rangeCount) selection.removeAllRanges();
  }

  function placeCaretAtPoint(component, point) {
    if (!point) return false;
    const range = rangeAtPoint(component, point.x, point.y);
    if (!range) return false;
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    component.range = range.cloneRange();
    return true;
  }

  function caretRangeAt(documentRef, x, y) {
    const range = documentRef.caretRangeFromPoint?.(x, y);
    if (range) return range;
    const position = documentRef.caretPositionFromPoint?.(x, y);
    if (!position) return null;
    const fallback = documentRef.createRange();
    fallback.setStart(position.offsetNode, position.offset);
    fallback.collapse(true);
    return fallback;
  }

  function rangeAtPoint(component, x, y) {
    const range = caretRangeAt(component.content.ownerDocument, x, y);
    return range && component.content.contains(range.startContainer) ? range : null;
  }

  function updatePointerSelection(component, range) {
    if (!component.pointerSelection || !range) return;
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(component.pointerSelection.anchor.cloneRange());
    selection.extend(range.startContainer, range.startOffset);
    component.range = selectionInside(component.content);
  }

  function startPointerSelection(component, event) {
    if (!component.root.classList.contains("is-editing") || event.button !== 0) return;
    const anchor = rangeAtPoint(component, event.clientX, event.clientY);
    if (!anchor) return;
    component.suppressClick = false;
    component.pointerSelection = { anchor, moved: false };
    component.pointerMoveListener = (moveEvent) => {
      const pointerSelection = component.pointerSelection;
      if (!pointerSelection) return;
      const range = rangeAtPoint(component, moveEvent.clientX, moveEvent.clientY);
      if (!range) return;
      if (Math.abs(moveEvent.clientX - event.clientX) + Math.abs(moveEvent.clientY - event.clientY) > 2) {
        pointerSelection.moved = true;
        updatePointerSelection(component, range);
      }
    };
    component.pointerUpListener = () => {
      component.suppressClick = Boolean(component.pointerSelection?.moved);
      component.range = selectionInside(component.content) || component.range;
      document.removeEventListener("pointermove", component.pointerMoveListener, true);
      document.removeEventListener("pointerup", component.pointerUpListener, true);
      component.pointerMoveListener = null;
      component.pointerUpListener = null;
      component.pointerSelection = null;
    };
    document.addEventListener("pointermove", component.pointerMoveListener, true);
    document.addEventListener("pointerup", component.pointerUpListener, true);
  }

  function textNodes(node) {
    const nodes = [];
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    let current;
    while ((current = walker.nextNode())) if (current.nodeValue) nodes.push(current);
    return nodes;
  }

  function rangeIsBold(fragment) {
    const nodes = textNodes(fragment);
    return nodes.length > 0 && nodes.every((node) => node.parentElement?.closest("strong"));
  }

  function unwrapStrong(root) {
    root.querySelectorAll?.("strong").forEach((strong) => {
      strong.replaceWith(...strong.childNodes);
    });
  }

  function normalizeStrong(root) {
    root.querySelectorAll?.("strong strong").forEach((nested) => nested.replaceWith(...nested.childNodes));
    [...root.querySelectorAll?.("strong") || []].forEach((strong) => {
      const next = strong.nextSibling;
      if (next?.nodeType === Node.ELEMENT_NODE && next.tagName === "STRONG") {
        strong.append(...next.childNodes);
        next.remove();
      }
    });
  }

  function applyBold(component) {
    const range = restoreRange(component);
    if (!range || range.collapsed) {
      component.pendingBold = !component.pendingBold;
      return;
    }
    const start = textOffset(component.content, range.startContainer, range.startOffset);
    const end = textOffset(component.content, range.endContainer, range.endOffset);
    const fragment = range.extractContents();
    const bold = rangeIsBold(fragment);
    if (bold) {
      unwrapStrong(fragment);
      range.insertNode(fragment);
    } else {
      const strong = document.createElement("strong");
      strong.append(...fragment.childNodes);
      range.insertNode(strong);
    }
    normalizeStrong(component.content);
    component.range = restoreTextSelection(component.content, start, end).cloneRange();
    component.content.focus({ preventScroll: true });
    syncModel(component);
      updateProcedureTextBoxLayout(component, { autoHeight: true });
  }

  function componentMarkup(element) {
    const tone = toneOf(element.tone);
    const root = document.createElement("div");
    root.className = "procedure-text-box";
    root.innerHTML = `
      <div class="procedure-text-panel" aria-hidden="true"></div>
      <div class="procedure-text-stripe" aria-hidden="true"></div>
      <button type="button" class="procedure-text-move-handle" title="Mover caixa de texto" aria-label="Mover caixa de texto"><span aria-hidden="true"></span></button>
      <div class="procedure-text-content" contenteditable="false" spellcheck="true" lang="pt-BR"></div>
      <button type="button" class="procedure-text-resize-handle" title="Redimensionar caixa de texto" aria-label="Redimensionar caixa de texto"><span aria-hidden="true"></span></button>
    `;
    root.style.setProperty("--procedure-fill", tone.fill);
    root.style.setProperty("--procedure-stroke", tone.stroke);
    return {
      root,
      panel: root.querySelector(".procedure-text-panel"),
      stripe: root.querySelector(".procedure-text-stripe"),
      content: root.querySelector(".procedure-text-content"),
      move: root.querySelector(".procedure-text-move-handle"),
      resize: root.querySelector(".procedure-text-resize-handle"),
    };
  }

  function createComponent(session, element) {
    const component = { ...componentMarkup(element), session, element, range: null, pendingBold: false, suppressClick: false };
    component.content.innerHTML = htmlFromElement(element);
    component.content.dataset.placeholder = "Digite o texto";
    component.root.dataset.sceneId = element.id;
    component.root.addEventListener("pointerdown", (event) => handlePointerDown(component, event));
    component.root.addEventListener("click", (event) => {
      if (!event.target?.closest?.(".procedure-text-move-handle, .procedure-text-resize-handle")) select(session, component);
    });
    component.root.addEventListener("dblclick", (event) => {
      if (event.target?.closest?.(".procedure-text-content, .procedure-text-box")) enterEdit(session, component);
    });
    component.content.addEventListener("pointerdown", (event) => {
      if (!component.root.classList.contains("is-editing")) {
        enterEdit(session, component, { point: { x: event.clientX, y: event.clientY }, selectPlaceholder: false });
      }
      startPointerSelection(component, event);
    });
    component.content.addEventListener("click", (event) => {
      const point = { x: event.clientX, y: event.clientY };
      if (component.root.classList.contains("is-editing")) {
        if (component.suppressClick) {
          component.suppressClick = false;
          return;
        }
        return placeCaretAtPoint(component, point);
      }
      enterEdit(session, component, { point, selectPlaceholder: false });
    });
    component.content.addEventListener("contextmenu", (event) => {
      if (component.root.classList.contains("is-editing")) {
        saveRange(component);
        event.stopPropagation();
      }
    });
    component.content.addEventListener("input", () => {
      updateProcedureTextBoxLayout(component, { autoHeight: true });
      syncModel(component);
      session.textLayerCallbacks.live?.(session, component);
    });
    component.content.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        finishEdit(session, component, false);
      } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        finishEdit(session, component, true);
      } else if (event.key.toLowerCase() === "b" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        saveRange(component);
        applyBold(component);
        session.textLayerCallbacks.live?.(session, component);
      }
    });
    component.content.addEventListener("keyup", () => saveRange(component));
    component.content.addEventListener("mouseup", () => saveRange(component));
    component.content.addEventListener("blur", () => {
      const active = document.activeElement;
      if (!component.root.contains(active) && !active?.closest?.("[data-fabric-selection-toolbar]")) finishEdit(session, component, true);
    });
    component.content.addEventListener("paste", (event) => {
      event.preventDefault();
      const text = event.clipboardData?.getData("text/plain") || "";
      const range = restoreRange(component);
      if (!range) return;
      range.deleteContents();
      range.insertNode(document.createTextNode(text));
      range.collapse(false);
      saveRange(component);
      component.content.dispatchEvent(new Event("input", { bubbles: true }));
    });
    session.textComponents.set(element.id, component);
    return component;
  }

  function select(session, component) {
    session.selection = { elementId: component.element.id, component };
    session.textComponents.forEach((item) => item.root.classList.toggle("is-selected", item === component));
    session.textLayerCallbacks.select?.(session, component);
  }

  function enterEdit(session, component, options = {}) {
    if (session.isEditingText && session.textEditingComponent === component) {
      if (options.point) placeCaretAtPoint(component, options.point);
      return;
    }
    if (session.isEditingText && session.textEditingComponent !== component) finishEdit(session, session.textEditingComponent, true);
    select(session, component);
    session.isEditingText = true;
    session.textEditingComponent = component;
    component.before = session.history.snapshot(session.card);
    component.root.classList.add("is-editing");
    component.content.contentEditable = "true";
    component.content.spellcheck = true;
    component.content.lang = "pt-BR";
    component.content.focus({ preventScroll: true });
    if (component.element.text === "Digite o texto" && options.selectPlaceholder !== false) {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(component.content);
      selection.removeAllRanges();
      selection.addRange(range);
      component.range = range.cloneRange();
    } else if (options.point) {
      placeCaretAtPoint(component, options.point);
    }
    component.selectionListener = () => saveRange(component);
    document.addEventListener("selectionchange", component.selectionListener);
    component.outsideListener = (event) => {
      if (event.target.closest?.("[data-fabric-selection-toolbar]")) return;
      if (!component.root.contains(event.target)) finishEdit(session, component, true);
    };
    document.addEventListener("pointerdown", component.outsideListener, true);
    session.textLayerCallbacks.editing?.(session, component);
  }

  function finishEdit(session, component, save) {
    if (!component || session.textEditingComponent !== component) return;
    if (!save) {
      const scene = component.before?.elements?.find((item) => item.id === component.element.id);
      if (scene) Object.assign(component.element, JSON.parse(JSON.stringify(scene)));
      component.content.innerHTML = htmlFromElement(component.element);
      updateProcedureTextBoxLayout(component, { width: component.element.width, height: component.element.height, autoHeight: false });
    } else {
      syncModel(component);
      session.history.push(component.before, session.history.snapshot(session.card));
      session.textLayerCallbacks.save?.();
    }
    document.removeEventListener("selectionchange", component.selectionListener);
    document.removeEventListener("pointerdown", component.outsideListener, true);
    clearNativeSelection();
    component.range = null;
    component.content.contentEditable = "false";
    component.root.classList.remove("is-editing");
    session.isEditingText = false;
    session.textEditingComponent = null;
    session.textLayerCallbacks.editingEnd?.(session, component);
  }

  function handlePointerDown(component, event) {
    const { session } = component;
    if (event.target?.closest?.(".procedure-text-resize-handle, .procedure-text-move-handle")) {
      if (session.isEditingText && session.textEditingComponent === component) finishEdit(session, component, true);
      if (event.target?.closest?.(".procedure-text-resize-handle")) return startResize(component, event);
      return startMove(component, event);
    }
    if (component.root.classList.contains("is-editing")) {
      return;
    }
    select(session, component);
  }

  function pointerStart(component, event, mode) {
    const { session } = component;
    event.preventDefault();
    event.stopPropagation();
    select(session, component);
    session.history.begin(session.card);
    const scale = sceneScale(session);
    const start = { x: event.clientX, y: event.clientY, elementX: component.element.x, elementY: component.element.y, width: component.element.width, height: component.element.height };
    const move = (moveEvent) => {
      const dx = (moveEvent.clientX - start.x) / scale;
      if (mode === "move") {
        component.element.x = Math.max(0, Math.min(session.card.scene.size.width - component.element.width, start.elementX + dx));
        component.element.y = Math.max(0, Math.min(session.card.scene.size.height - component.element.height, start.elementY + (moveEvent.clientY - start.y) / scale));
        updateProcedureTextBoxLayout(component, { width: component.element.width, height: component.element.height, autoHeight: false });
      } else {
        component.element.width = Math.max(MIN_WIDTH, Math.min(session.card.scene.size.width - component.element.x, start.width + dx));
        updateProcedureTextBoxLayout(component, { width: component.element.width, autoHeight: true });
      }
      syncModel(component);
      session.textLayerCallbacks.live?.(session, component);
    };
    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      session.history.commit(session.card);
      session.textLayerCallbacks.save?.();
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up, { once: true });
  }

  function startMove(component, event) { pointerStart(component, event, "move"); }
  function startResize(component, event) { pointerStart(component, event, "resize"); }

  function render(session) {
    const elements = (session.card.scene?.elements || []).filter((element) => element.type === "text");
    const valid = new Set(elements.map((element) => element.id));
    elements.forEach((element) => {
      const component = session.textComponents.get(element.id) || createComponent(session, element);
      component.element = element;
      if (!component.root.parentElement) session.textLayer.appendChild(component.root);
      if (!session.isEditingText) component.content.innerHTML = htmlFromElement(element);
      updateProcedureTextBoxLayout(component, { width: element.width, height: element.height, autoHeight: false });
      if (!session.isEditingText) element.renderLines = visualRenderLines(component.content);
      component.root.classList.toggle("is-selected", session.selection?.elementId === element.id);
    });
    session.textComponents.forEach((component, id) => {
      if (!valid.has(id)) {
        component.root.remove();
        session.textComponents.delete(id);
      }
    });
  }

  function ensure(session, callbacks) {
    const host = session.canvasElement.parentElement;
    let layer = host.querySelector(".procedure-text-layer");
    if (!layer) {
      layer = document.createElement("div");
      layer.className = "procedure-text-layer";
      host.appendChild(layer);
    }
    session.textLayer = layer;
    session.textComponents = session.textComponents || new Map();
    session.textLayerCallbacks = callbacks;
    render(session);
  }

  function handleAction(session, action) {
    const component = session.textEditingComponent || session.selection?.component;
    if (!component || action !== "bold") return false;
    if (session.isEditingText) {
      saveRange(component);
      applyBold(component);
      session.textLayerCallbacks.live?.(session, component);
      return true;
    }
    const before = session.history.snapshot(session.card);
    syncModel(component);
    const allBold = rangeIsBold(component.content);
    if (allBold) {
      unwrapStrong(component.content);
      component.element.fontWeight = 400;
    } else {
      const strong = document.createElement("strong");
      while (component.content.firstChild) strong.append(component.content.firstChild);
      component.content.replaceChildren(strong);
      component.element.fontWeight = 800;
    }
    component.element.styles = {};
    syncModel(component);
    updateProcedureTextBoxLayout(component, { autoHeight: true });
    session.history.push(before, session.history.snapshot(session.card));
    session.textLayerCallbacks.save?.();
    return true;
  }

  function finishEditing(session, save = true) {
    if (session?.textEditingComponent) finishEdit(session, session.textEditingComponent, save);
  }

  function componentFor(session, elementId) {
    return session?.textComponents?.get(elementId) || null;
  }

  window.FabricProcedureTextLayer = { componentFor, ensure, enterEdit, finishEditing, handleAction, render, select, syncModel, updateProcedureTextBoxLayout };
}());

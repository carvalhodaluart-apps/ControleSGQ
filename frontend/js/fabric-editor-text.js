(function () {
  const Factory = window.FabricObjectFactory;
  const ProcedureTextBox = window.ProcedureTextBox;
  const Transform = window.FabricEditorTransform;
  if (!Factory || !ProcedureTextBox || !Transform) return;

  function escapeText(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  }

  function isBoldWeight(value, fallback = 400) {
    return String(value ?? fallback).toLowerCase() === "bold" || Number(value ?? fallback) >= 700;
  }

  function htmlFromStyles(text, styles, fontWeight) {
    const defaultBold = isBoldWeight(fontWeight);
    return String(text || "").split("\n").map((line, lineIndex) => {
      let html = "";
      let bold = false;
      [...line].forEach((char, charIndex) => {
        const style = styles?.[lineIndex]?.[charIndex] || {};
        const nextBold = isBoldWeight(style.fontWeight, defaultBold ? 800 : 400);
        if (nextBold !== bold) {
          html += nextBold ? "<strong>" : "</strong>";
          bold = nextBold;
        }
        html += escapeText(char);
      });
      if (bold) html += "</strong>";
      return html;
    }).join("<br>");
  }

  function updateElementText(element, text) {
    element.text = text || "";
    element.html = htmlFromStyles(element.text, element.styles, element.fontWeight);
  }

  function syncLiveLayout(session, object, element) {
    element.styles = JSON.parse(JSON.stringify(object.textBox.styles || {}));
    updateElementText(element, object.textBox.text || "");
    ProcedureTextBox.updateTextBoxLayout(object, { width: element.width, anchor: object.getCenterPoint?.() });
    element.width = object.width;
    element.height = object.height;
    element.x = Number(object.left) || 0;
    element.y = Number(object.top) || 0;
    Transform.syncBlocks(session.card);
    session.canvas.requestRenderAll();
  }

  function edit(session, object, callbacks = {}) {
    const element = Transform.elementFor(session?.card, object);
    const textBox = ProcedureTextBox.textFor(object);
    if (!session || !object || !element || !textBox || element.type !== "text" || session.isEditingText) return;

    const canvas = session.canvas;
    const before = session.history.snapshot(session.card);
    const originalText = textBox.text || "";
    const originalObjectState = {
      lockMovementX: object.lockMovementX,
      lockMovementY: object.lockMovementY,
      hasControls: object.hasControls,
      interactive: object.interactive,
    };
    let done = false;
    let selectingText = false;

    function cleanup() {
      textBox.off("changed", onChanged);
      textBox.off("editing:exited", onEditingExited);
      canvas.off("mouse:down", onCanvasDown);
      canvas.off("mouse:move", onCanvasMove);
      canvas.off("mouse:up", onCanvasUp);
      document.removeEventListener("keydown", onKeydown, true);
      document.removeEventListener("pointerdown", onDocumentPointerDown, true);
      session.isEditingText = false;
    }

    function finish(save) {
      if (done) return;
      done = true;
      cleanup();
      if (save) {
        updateElementText(element, textBox.text);
        syncLiveLayout(session, object, element);
        session.history.push(before, session.history.snapshot(session.card));
        callbacks.save?.();
      } else {
        textBox.set({ text: originalText });
        textBox.initDimensions?.();
        syncLiveLayout(session, object, element);
      }
      object.set(originalObjectState);
      textBox.exitEditing();
      canvas.setActiveObject(object);
      callbacks.select?.(object);
      canvas.requestRenderAll();
    }

    function onChanged() {
      if (!done) syncLiveLayout(session, object, element);
    }

    function onEditingExited() {
      if (!done) finish(true);
    }

    function onCanvasDown(event) {
      const insideText = event.target === object || event.target === textBox || event.target?.group === object;
      if (insideText) {
        selectingText = true;
        textBox.setCursorByClick?.(event.e);
        canvas.requestRenderAll();
        return;
      }
      finish(true);
    }

    function onCanvasMove(event) {
      if (!selectingText) return;
      textBox.updateSelectionOnMouseMove?.(event.e);
      canvas.requestRenderAll();
    }

    function onCanvasUp() {
      selectingText = false;
    }

    function onDocumentPointerDown(event) {
      if (event.target === canvas.upperCanvasEl || event.target === canvas.lowerCanvasEl) return;
      if (event.target.closest?.("[data-fabric-selection-toolbar]")) return;
      finish(true);
    }

    function onKeydown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        finish(false);
      } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        event.stopPropagation();
        finish(true);
      }
    }

    session.isEditingText = true;
    object.set({ lockMovementX: true, lockMovementY: true, hasControls: false, interactive: true });
    canvas.setActiveObject(object);
    textBox.on("changed", onChanged);
    textBox.on("editing:exited", onEditingExited);
    canvas.on("mouse:down", onCanvasDown);
    canvas.on("mouse:move", onCanvasMove);
    canvas.on("mouse:up", onCanvasUp);
    document.addEventListener("keydown", onKeydown, true);
    document.addEventListener("pointerdown", onDocumentPointerDown, true);
    object.enterTextEditing?.();
    if (Factory.plainText(element) === "Digite o texto") textBox.selectAll();
    canvas.requestRenderAll();
  }

  function handleAction(session, action, callbacks = {}) {
    if (!session?.isEditingText || action !== "bold") return false;
    const object = session.selection?.object;
    const textBox = ProcedureTextBox.textFor(object);
    const element = Transform.elementFor(session.card, object);
    if (!textBox || !element) return false;
    const before = session.history.snapshot(session.card);
    const start = Math.min(textBox.selectionStart, textBox.selectionEnd);
    const end = Math.max(textBox.selectionStart, textBox.selectionEnd);
    if (start !== end) {
      const styles = textBox.getSelectionStyles(start, end);
      const allBold = styles.length > 0 && styles.every((style) => isBoldWeight(style.fontWeight, element.fontWeight));
      textBox.setSelectionStyles({ fontWeight: allBold ? "normal" : "bold" }, start, end);
    } else {
      element.fontWeight = Number(element.fontWeight) >= 700 ? 400 : 800;
      element.styles = {};
      textBox.set({ fontWeight: element.fontWeight >= 700 ? "bold" : "normal", styles: {} });
    }
    textBox.initDimensions?.();
    syncLiveLayout(session, object, element);
    session.history.push(before, session.history.snapshot(session.card));
    callbacks.save?.();
    session.canvas.requestRenderAll();
    return true;
  }

  window.FabricEditorText = { edit, handleAction };
}());

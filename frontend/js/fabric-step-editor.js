(function () {
  const Core = window.SceneGraphCore;
  const Fabric = window.fabric;
  const Factory = window.FabricObjectFactory;
  const Session = window.FabricEditorSession;
  const Toolbar = window.FabricEditorToolbar;
  const Transform = window.FabricEditorTransform;
  const ImageEditor = window.FabricEditorImage;
  const Hierarchy = window.FabricEditorHierarchy;
  const TextLayer = window.FabricProcedureTextLayer;
  if (!Core || !Fabric || !Factory || !Session || !Toolbar || !Transform || !ImageEditor || !Hierarchy || !TextLayer) return;

  const TOOL_TYPES = ["text", "arrow", "circle", "square"];
  const MARKUP_TYPES = ["arrow", "circle", "square"];
  const objectFromElement = (element) => Factory.create(element, { interactive: true });
  const createSceneId = (type) => `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const saveProcedureSafely = () => {
    if (typeof saveProcedure === "function") saveProcedure();
  };
  function nextOrder(card, type = "text") {
    if (type === "image") return Math.min(0, ...(card.scene?.elements || []).map((item) => Number(item.order) || 0)) - 1;
    return Math.max(9, ...(card.scene?.elements || []).map((item) => Number(item.order) || 0)) + 1;
  }
  function baseElement(type, values = {}) {
    return {
      id: createSceneId(type),
      type,
      x: 0,
      y: 0,
      width: type === "arrow" ? 170 : type === "text" ? 300 : 160,
      height: type === "arrow" ? 28 : type === "text" ? 92 : 160,
      rotation: 0,
      order: 10,
      opacity: 1,
      locked: false,
      tone: "success",
      text: "",
      html: "",
      renderLines: [],
      fontSize: 20,
      fontFamily: "Arial, Helvetica, sans-serif",
      fontWeight: 400,
      textAlign: "center",
      color: "#000000",
      image: "",
      fit: "contain",
      borderWidth: 4,
      flipX: false,
      flipY: false,
      annotations: [],
      ...values,
    };
  }
  function setToolStatus(session, message) {
    const status = session.canvasElement.closest("[data-step-card]")?.querySelector("[data-fabric-tool-status]");
    if (status) status.textContent = message;
  }
  function refreshToolButtons(session) {
    const cardNode = session.canvasElement.closest("[data-step-card]");
    cardNode?.querySelectorAll("[data-fabric-tool]").forEach((button) => {
      const active = session.tool?.type === button.dataset.fabricTool;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    cardNode?.querySelectorAll("[data-fabric-select]").forEach((button) => {
      const active = !session.tool;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    cardNode?.querySelector(".step-card-canvas")?.classList.toggle("is-drawing-tool", Boolean(session.tool));
    session.canvas.defaultCursor = session.tool ? "crosshair" : "default";
    session.canvas.hoverCursor = session.tool ? "crosshair" : "move";
    session.canvas.requestRenderAll();
  }
  function deactivateTool(session, message = "Selecione uma acao acima ou clique em um elemento para edita-lo.") {
    if (!session) return;
    session.tool = null;
    refreshToolButtons(session);
    setToolStatus(session, message);
  }
  function activateToolForSession(session, type, tone = "success") {
    if (!session || !TOOL_TYPES.includes(type) || session.isEditingText) return;
    Session.setActive(session);
    session.tool = { type, tone };
    session.canvas.discardActiveObject();
    clearSelection(session, false);
    applyActiveTool(session).catch((error) => console.error("Falha ao criar elemento Fabric:", error));
  }
  function activateTool(sectionIndex, cardIndex, type, tone = "success") {
    activateToolForSession(Session.find(Number(sectionIndex), Number(cardIndex)), type, tone);
  }
  function toolElement(session, point, state = session.tool) {
    const scene = session.card.scene;
    const order = nextOrder(session.card);
    const center = (width, height) => ({
      x: Transform.clamp(point.x - width / 2, 0, Math.max(0, scene.size.width - width)),
      y: Transform.clamp(point.y - height / 2, 0, Math.max(0, scene.size.height - height)),
    });
    if (state.type === "text") {
      const width = 300, height = 56;
      return baseElement("text", {
        ...center(width, height),
        width,
        height,
        order,
        tone: state.tone,
        text: "Digite o texto",
        html: "Digite o texto",
        fontWeight: 400,
      });
    }
    if (state.type === "arrow") {
      const width = 170;
      const height = 28;
      return baseElement("arrow", { ...center(width, height), width, height, order, tone: state.tone, rotation: 180 });
    }
    const size = state.type === "circle" ? 150 : 180;
    return baseElement(state.type, {
      ...center(size, size),
      width: size,
      height: size,
      order,
      tone: state.tone,
      borderWidth: 5,
    });
  }
  async function imageElement(session, image) {
    const size = Transform.sceneSize(session.card);
    const frame = ImageEditor.frameSize(await ImageEditor.readSize(image), size) || { width: 160, height: 120 };
    const imageCount = (session.card.scene?.elements || []).filter((item) => item.type === "image").length;
    const margin = imageCount ? 80 : 40;
    const offset = Math.min(imageCount * 28, 120);
    const element = baseElement("image", {
      x: Transform.clamp(margin + offset, 0, Math.max(0, size.width - frame.width)),
      y: Transform.clamp(margin + offset, 0, Math.max(0, size.height - frame.height)),
      width: frame.width,
      height: frame.height,
      order: nextOrder(session.card, "image"),
      image,
      fit: "contain",
    });
    const fitted = Hierarchy.fitImagePosition(element, session.card.scene.elements, size);
    if (!fitted) return null;
    Object.assign(element, fitted);
    return element;
  }
  async function addObjectToCanvas(session, element) {
    if (element.type === "text") return null;
    const object = await objectFromElement(element);
    if (!object) return null;
    object.sectionIndex = session.sectionIndex;
    object.cardIndex = session.cardIndex;
    session.canvas.add(object);
    Factory.annotationObjects(element).forEach((annotation) => session.canvas.add(annotation));
    return object;
  }
  async function appendSceneElements(session, elements) {
    const validElements = (elements || []).filter(Boolean);
    if (!session || !validElements.length) return [];
    const before = session.history.snapshot(session.card);
    session.card.scene.elements.push(...validElements);
    Core.enforceSceneOrder(session.card.scene);
    Transform.syncBlocks(session.card);
    session.history.push(before, session.history.snapshot(session.card));
    saveProcedureSafely();
    const created = [];
    for (const element of validElements) {
      const object = await addObjectToCanvas(session, element);
      if (object) created.push(object);
    }
    Hierarchy.enforceCanvasOrder(session.canvas, session.card.scene);
    TextLayer.render(session);
    session.canvas.requestRenderAll();
    return created;
  }
  async function addImageToSession(session) {
    if (!session || typeof pickProcedureImageFile !== "function" || typeof resizeImage !== "function") return false;
    const file = await pickProcedureImageFile();
    if (!file) return true;
    const image = await resizeImage(file);
    if (!image) return true;
    const nextElement = await imageElement(session, image);
    if (!nextElement) {
      deactivateTool(session, "Não há espaço livre para inserir outra imagem sem sobreposição.");
      return false;
    }
    const [created] = await appendSceneElements(session, [nextElement]);
    if (created) selectObject(session, created);
    deactivateTool(session, "Imagem inserida. Selecione-a para ajustar, recortar ou substituir.");
    return true;
  }
  async function applyActiveTool(session, nativeEvent = null) {
    if (!session?.tool || session.isEditingText) return false;
    const state = session.tool;
    session.tool = null;
    refreshToolButtons(session);
    const scene = session.card.scene;
    const point = nativeEvent
      ? Transform.pointerFor(session.canvas, nativeEvent)
      : { x: scene.size.width / 2, y: scene.size.height / 2 };
    const element = toolElement(session, point, state);
    const [created] = await appendSceneElements(session, [element]);
    if (element.type === "text") {
      const component = TextLayer.componentFor(session, element.id);
      TextLayer.select(session, component);
      setToolStatus(session, "Texto criado no centro. Arraste para posicionar ou clique para editar.");
    } else {
      if (created) selectObject(session, created);
      setToolStatus(session, "Elemento criado no centro. Arraste para posicionar e use a barra para ajustar.");
    }
    return true;
  }
  function clearSelection(session, updateToolbar = true) {
    if (!session) return;
    session.selection = null;
    session.textComponents?.forEach((component) => component.root.classList.remove("is-selected"));
    if (updateToolbar) Toolbar.render(session, selectedElement);
  }
  function clearOtherSessions(active) {
    Session.all().forEach((session) => {
      if (session === active) return;
      session.canvas.discardActiveObject();
      clearSelection(session);
      session.canvas.requestRenderAll();
    });
  }
  function selectObject(session, object) {
    if (object?.sceneType === "image-crop-editor") return;
    const element = Transform.elementFor(session?.card, object);
    if (!session?.containsObject(object) || object.sceneType !== element?.type) return clearSelection(session);
    Session.setActive(session);
    clearOtherSessions(session);
    session.textComponents?.forEach((component) => component.root.classList.remove("is-selected"));
    Hierarchy.enforceCanvasOrder(session.canvas, session.card.scene);
    session.selection = { object };
    session.canvas.setActiveObject(object);
    Toolbar.render(session, selectedElement);
    session.canvas.requestRenderAll();
  }
  function selectTextObject(session, component) {
    if (!component) return;
    Session.setActive(session);
    clearOtherSessions(session);
    session.canvas.discardActiveObject();
    session.selection = { elementId: component.element.id, component };
    Toolbar.render(session, selectedElement);
  }
  function selectedElement(session) {
    const object = session?.selection?.object;
    if (object) return Transform.elementFor(session?.card, object);
    return session?.card?.scene?.elements?.find((item) => item.id === session?.selection?.elementId) || null;
  }
  function resolveSelection(session) {
    if (session?.selection?.elementId) {
      const element = selectedElement(session);
      return element ? { object: null, element, component: session.selection.component } : null;
    }
    const sceneId = session?.selection?.object?.sceneId;
    const object = sceneId ? session.canvas.getObjects().find((item) => item.sceneId === sceneId) : null;
    if (!object) {
      clearSelection(session);
      return null;
    }
    session.selection.object = object;
    return { object, element: selectedElement(session) };
  }
  async function rebuildCanvas(session) {
    session.canvas.clear();
    session.canvas.backgroundColor = "#ffffff";
    const scene = Core.normalizeCardScene(session.card, session.sectionIndex, session.cardIndex);
    for (const element of scene.elements) await addObjectToCanvas(session, element);
    Hierarchy.enforceCanvasOrder(session.canvas, scene);
    TextLayer.render(session);
    session.canvas.requestRenderAll();
  }
  async function replaceObject(session, oldObject, element) {
    const canvas = session.canvas;
    const index = canvas.getObjects().indexOf(oldObject);
    if (index < 0) return canvas.getObjects().find((item) => item.sceneId === element.id) || oldObject;
    window.FabricAnnotationLayer?.remove?.(canvas, element);
    const object = await objectFromElement(element);
    if (!object) return oldObject;
    object.sectionIndex = session.sectionIndex;
    object.cardIndex = session.cardIndex;
    canvas.remove(oldObject);
    canvas.insertAt(index, object);
    Factory.annotationObjects(element).forEach((annotation) => canvas.add(annotation));
    Hierarchy.enforceCanvasOrder(canvas, session.card.scene);
    selectObject(session, object);
    return object;
  }
  function recordSceneChange(session, mutator) {
    const before = session.history.snapshot(session.card);
    mutator();
    Core.enforceSceneOrder(session.card.scene);
    Transform.syncBlocks(session.card);
    session.history.push(before, session.history.snapshot(session.card));
    saveProcedureSafely();
  }
  function deleteObject(session) {
    const object = session?.selection?.object;
    const elementId = object?.sceneId || session?.selection?.elementId;
    const index = session?.card?.scene?.elements?.findIndex((item) => item.id === elementId) ?? -1;
    if (index < 0) return;
    const element = session.card.scene.elements[index];
    recordSceneChange(session, () => session.card.scene.elements.splice(index, 1));
    window.FabricAnnotationLayer?.remove?.(session.canvas, element);
    if (object) session.canvas.remove(object);
    Core.enforceSceneOrder(session.card.scene);
    Hierarchy.enforceCanvasOrder(session.canvas, session.card.scene);
    session.canvas.discardActiveObject();
    TextLayer.render(session);
    clearSelection(session);
    session.canvas.requestRenderAll();
  }
  async function restoreScene(session, scene) {
    if (!session || !scene) return;
    session.card.scene = Core.normalizeScene(scene, scene.id || `scene-step-${session.sectionIndex}-${session.cardIndex}`, Transform.sceneSize(session.card));
    Transform.syncBlocks(session.card);
    clearSelection(session);
    await rebuildCanvas(session);
    saveProcedureSafely();
  }
  async function undoRedo(session, redo = false) {
    const scene = redo ? session?.history.redo() : session?.history.undo();
    await restoreScene(session, scene);
  }
  async function handleToolbarAction(session, action, dataset = {}) {
    if (await ImageEditor.handleCropAction(session, action, (oldObject, element) => replaceObject(session, oldObject, element), () => Toolbar.render(session, selectedElement), (message) => setToolStatus(session, message))) return;
    const selection = resolveSelection(session);
    const object = selection?.object;
    const element = selection?.element;
    if (!element) return;
    if (action === "delete") return deleteObject(session);
    if (element.type === "text") {
      if (TextLayer.handleAction(session, action)) return Toolbar.render(session, selectedElement);
      if (action === "edit-text") return TextLayer.enterEdit(session, selection.component || TextLayer.componentFor(session, element.id));
      const before = session.history.snapshot(session.card);
      const component = selection.component || TextLayer.componentFor(session, element.id);
      if (action === "tone" && component) {
        const currentContent = TextLayer.syncModel(component);
        Object.assign(element, { html: currentContent.html, text: currentContent.text, tone: dataset.tone || element.tone });
        component.element = element;
        Transform.syncBlocks(session.card);
        TextLayer.updateProcedureTextBoxLayout(component, { autoHeight: false });
        session.history.push(before, session.history.snapshot(session.card)); saveProcedureSafely();
        return Toolbar.render(session, selectedElement);
      }
      if (action === "tone") element.tone = dataset.tone || element.tone;
      else if (action === "font-down") element.fontSize = Math.max(8, (element.fontSize || 20) - 1);
      else if (action === "font-up") element.fontSize = Math.min(72, (element.fontSize || 20) + 1);
      else return;
      Core.enforceSceneOrder(session.card.scene);
      Transform.syncBlocks(session.card);
      TextLayer.render(session);
      session.history.push(before, session.history.snapshot(session.card));
      saveProcedureSafely();
      return Toolbar.render(session, selectedElement);
    }
    if (!object) return;
    if (action === "crop-image" && element.type === "image") {
      ImageEditor.startCrop(session, object, element);
      setToolStatus(session, "Ajuste a área de recorte e confirme na barra.");
      return Toolbar.render(session, selectedElement);
    }
    const before = session.history.snapshot(session.card);
    if (action === "replace-image" && element.type === "image") {
      const file = await pickProcedureImageFile?.();
      if (!file) return;
      const previous = { image: element.image, x: element.x, y: element.y, width: element.width, height: element.height };
      element.image = await resizeImage(file);
      const size = Transform.sceneSize(session.card);
      ImageEditor.resizeElement(element, ImageEditor.frameSize(await ImageEditor.readSize(element.image), size), size);
      const fitted = Hierarchy.fitImagePosition(element, session.card.scene.elements, size);
      if (!fitted) {
        Object.assign(element, previous);
        return;
      }
      Object.assign(element, fitted);
    } else if (action === "fit" && element.type === "image") element.fit = "contain";
    else if (action === "tone" && element.type !== "image") element.tone = dataset.tone || element.tone;
    else if (action === "font-down" && element.type === "text") element.fontSize = Math.max(8, (element.fontSize || 20) - 1);
    else if (action === "font-up" && element.type === "text") element.fontSize = Math.min(72, (element.fontSize || 20) + 1);
    else if (action === "stroke-down" && MARKUP_TYPES.includes(element.type)) element.borderWidth = Math.max(1, (element.borderWidth || 3) - 1);
    else if (action === "stroke-up" && MARKUP_TYPES.includes(element.type)) element.borderWidth = Math.min(16, (element.borderWidth || 3) + 1);
    else if (action === "rotate-left") element.rotation = ((element.rotation || 0) - 15 + 360) % 360;
    else if (action === "rotate-right") element.rotation = ((element.rotation || 0) + 15) % 360;
    else return;
    Core.enforceSceneOrder(session.card.scene);
    Transform.syncBlocks(session.card);
    session.history.push(before, session.history.snapshot(session.card));
    saveProcedureSafely();
    await replaceObject(session, object, element);
    Toolbar.render(session, selectedElement);
  }
  function bindEvents(session) {
    const canvas = session.canvas;
    const liveNormalize = (event, options = {}) => {
      const object = event.target;
      if (ImageEditor.handleCropTransform(session, object)) return;
      Transform.normalizeObjectTransform(object, Transform.sceneSize(session.card), { snap: false, ...options });
      if (object?.sceneType === "image") {
        session.lastValidTransform = Hierarchy.constrainImageObject(object, canvas, session.lastValidTransform);
      }
    };
    canvas.on("object:moving", (event) => { session.lastTransformType = "move"; liveNormalize(event); });
    canvas.on("object:scaling", (event) => { session.lastTransformType = "scale"; liveNormalize(event); });
    canvas.on("object:rotating", (event) => { session.lastTransformType = "rotate"; liveNormalize(event, { keepInside: false }); });
    canvas.on("mouse:down", (event) => {
      Session.setActive(session);
      if (session.isEditingText) return;
      if (session.isCroppingImage && ImageEditor.isCropObject(event.target)) return;
      if (!event.target || !event.target.sceneId || event.target.sceneType === "text-editor") {
        canvas.discardActiveObject();
        clearSelection(session);
        canvas.requestRenderAll();
        return;
      }
      if (event.target.sceneType === "image") {
        session.lastValidTransform = Hierarchy.constrainImageObject(event.target, canvas);
      }
      session.history.begin(session.card);
    });
    canvas.on("selection:created", (event) => {
      if (!ImageEditor.isCropObject(event.selected?.[0])) selectObject(session, event.selected?.[0]);
    });
    canvas.on("selection:updated", (event) => {
      if (!ImageEditor.isCropObject(event.selected?.[0])) selectObject(session, event.selected?.[0]);
    });
    canvas.on("selection:cleared", () => {
      if (!session.isEditingText && !session.isCroppingImage) clearSelection(session);
    });
    canvas.on("object:modified", (event) => {
      const object = event.target;
      const transformType = session.lastTransformType;
      session.lastTransformType = null;
      if (ImageEditor.handleCropTransform(session, object)) return;
      if (!object?.sceneId || object.sceneType === "text-editor") return;
      const preserveManualRotation = transformType === "rotate" && (object.sceneType === "image" || MARKUP_TYPES.includes(object.sceneType));
      const element = Transform.syncElementFromObject(session.card, object, { keepInside: !preserveManualRotation });
      Core.enforceSceneOrder(session.card.scene);
      Hierarchy.enforceCanvasOrder(canvas, session.card.scene);
      session.history.commit(session.card);
      saveProcedureSafely();
      if (!element) return clearSelection(session);
      if (element.type === "text") {
        object.set({
          left: element.x,
          top: element.y,
          width: element.width,
          height: element.height,
          scaleX: 1,
          scaleY: 1,
          angle: element.rotation || 0,
          baseWidth: element.width,
          baseHeight: element.height,
        });
        object.setCoords();
        Hierarchy.enforceCanvasOrder(canvas, session.card.scene);
        selectObject(session, object);
        return;
      }
      if (preserveManualRotation) {
        selectObject(session, object);
        return;
      }
      session.lastValidTransform = null;
      replaceObject(session, object, element).catch((error) => console.error("Falha ao normalizar objeto:", error));
    });
  }
  async function mount(canvasElement, procedure) {
    const [sectionIndex, cardIndex] = canvasElement.dataset.fabricStepCanvas.split(":").map(Number);
    const card = procedure.sections?.[sectionIndex]?.stepCards?.[cardIndex];
    if (!card) return;
    const scene = Core.normalizeCardScene(card, sectionIndex, cardIndex);
    const canvas = new Fabric.Canvas(canvasElement, {
      width: scene.size.width,
      height: scene.size.height,
      backgroundColor: "#ffffff",
      preserveObjectStacking: true,
      selection: true,
    });
    const session = Session.register({ canvasElement, canvas, card, sectionIndex, cardIndex });
    Transform.resizeCanvas(canvas, canvasElement.parentElement, scene.size);
    TextLayer.ensure(session, {
      select: selectTextObject,
      live: (item) => Toolbar.render(item, selectedElement),
      editing: (item) => Toolbar.render(item, selectedElement),
      editingEnd: (item) => Toolbar.render(item, selectedElement),
      save: saveProcedureSafely,
    });
    Toolbar.ensure(session, {
      activateTool: activateToolForSession,
      addImage: (item) => addImageToSession(item).catch((error) => console.error("Falha ao inserir imagem:", error)),
      getElement: selectedElement,
      handleAction: (item, action, dataset) => handleToolbarAction(item, action, dataset)
        .catch((error) => console.error("Falha na toolbar Fabric:", error)),
      select: (item) => deactivateTool(item),
      setActive: Session.setActive,
    });
    await rebuildCanvas(session);
    bindEvents(session);
    canvas.renderAll();
  }
  async function mountAll(procedure) {
    Session.all().forEach((session) => {
      if (document.body.contains(session.canvasElement)) return;
      session.canvas.dispose();
      Session.unregister(session);
    });
    const pending = Array.from(document.querySelectorAll("[data-fabric-step-canvas]"))
      .filter((element) => !Session.fromElement(element))
      .map((element) => mount(element, procedure));
    await Promise.all(pending);
  }

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      Session.all().forEach((session) => {
        Transform.resizeCanvas(session.canvas, session.canvasElement.parentElement, Transform.sceneSize(session.card));
        session.canvas.requestRenderAll();
      });
    }, 120);
  });
  function nudgeSelection(session, deltaX, deltaY) {
    const selection = resolveSelection(session);
    if (!selection?.element) return;
    const size = Transform.sceneSize(session.card);
    const nextX = Transform.clamp(selection.element.x + deltaX, 0, Math.max(0, size.width - selection.element.width));
    const nextY = Transform.clamp(selection.element.y + deltaY, 0, Math.max(0, size.height - selection.element.height));
    if (selection.element.type === "image") {
      const probe = { ...selection.element, x: nextX, y: nextY };
      const position = Hierarchy.imagePosition(probe, session.card.scene.elements, size);
      if (!position || position.x !== nextX || position.y !== nextY) return;
    }
    recordSceneChange(session, () => {
      selection.element.x = nextX;
      selection.element.y = nextY;
    });
    const objectPosition = ["image", "arrow", "circle", "square"].includes(selection.element.type)
      ? { left: selection.element.x + selection.element.width / 2, top: selection.element.y + selection.element.height / 2 }
      : { left: selection.element.x, top: selection.element.y };
    selection.object.set(objectPosition);
    selection.object.setCoords();
    session.canvas.requestRenderAll();
    Toolbar.render(session, selectedElement);
  }
  window.addEventListener("keydown", (event) => {
    if (typeof editMode !== "undefined" && !editMode) return;
    const session = Session.getActive();
    if (!session) return;
    if (session.isEditingText) return;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
    const key = event.key.toLowerCase();
    const control = event.ctrlKey || event.metaKey;
    if (event.key === "Escape") {
      if (ImageEditor.cancelIfActive(session)) return Toolbar.render(session, selectedElement);
      deactivateTool(session);
      if (!session.isEditingText) {
        session.canvas.discardActiveObject();
        clearSelection(session);
      }
      return;
    }
    if (!control && ["1", "2", "3", "4"].includes(event.key)) {
      event.preventDefault();
      return activateToolForSession(session, { "1": "text", "2": "arrow", "3": "circle", "4": "square" }[event.key], "success");
    }
    if (control && key === "z") {
      event.preventDefault();
      return undoRedo(session, event.shiftKey);
    }
    if (control && key === "y") {
      event.preventDefault();
      return undoRedo(session, true);
    }
    const selection = resolveSelection(session);
    if (!selection?.object) return;
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      return deleteObject(session);
    }
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      const distance = event.shiftKey ? Transform.GRID_SIZE : 1;
      const delta = {
        ArrowLeft: [-distance, 0],
        ArrowRight: [distance, 0],
        ArrowUp: [0, -distance],
        ArrowDown: [0, distance],
      }[event.key];
      nudgeSelection(session, delta[0], delta[1]);
    }
  });
  window.FabricStepEditor = { activateTool, mountAll };
}());

(function () {
  const Core = window.SceneGraphCore;
  const ProcedureTextBox = window.ProcedureTextBox;
  if (!Core) return;

  const GRID_SIZE = 8;
  const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);
  const snap = (value) => Math.round(value / GRID_SIZE) * GRID_SIZE;
  function normalizedAngle(value) {
    const angle = ((Number(value) || 0) % 360 + 360) % 360;
    const cardinal = [0, 90, 180, 270].find((target) => Math.min(Math.abs(angle - target), 360 - Math.abs(angle - target)) <= 3);
    return cardinal ?? angle;
  }

  function sceneSize(card) {
    return card?.scene?.size || Core.STEP_SCENE_SIZE;
  }

  function syncBlocks(card) {
    if (card?.scene) card.blocks = Core.sceneToBlocks(card.scene, card);
  }

  function resizeCanvas(canvas, element, size) {
    const logicalSize = size || Core.STEP_SCENE_SIZE;
    const width = element?.clientWidth || logicalSize.width;
    const height = Math.round(width * (logicalSize.height / logicalSize.width));
    const scale = width / logicalSize.width;
    canvas.setDimensions({ width, height }, { cssOnly: false });
    canvas.setViewportTransform([scale, 0, 0, scale, 0, 0]);
    canvas.calcOffset();
  }

  function pointerFor(canvas, event) {
    if (typeof canvas.getScenePoint === "function") return canvas.getScenePoint(event);
    if (typeof canvas.getPointer === "function") return canvas.getPointer(event, false);
    return { x: 0, y: 0 };
  }

  function objectBounds(object) {
    object?.setCoords?.();
    const coordinates = object?.getCoords?.() || [];
    if (coordinates.length) {
      const xs = coordinates.map((point) => point.x);
      const ys = coordinates.map((point) => point.y);
      return {
        left: Math.min(...xs),
        top: Math.min(...ys),
        right: Math.max(...xs),
        bottom: Math.max(...ys),
      };
    }
    const left = Number(object?.left) || 0;
    const top = Number(object?.top) || 0;
    const width = (Number(object?.width) || 0) * Math.abs(Number(object?.scaleX) || 1);
    const height = (Number(object?.height) || 0) * Math.abs(Number(object?.scaleY) || 1);
    return { left, top, right: left + width, bottom: top + height };
  }

  function scaleObjectToFit(object, size) {
    const bounds = objectBounds(object);
    const width = bounds.right - bounds.left;
    const height = bounds.bottom - bounds.top;
    const fitScale = Math.min(
      1,
      size.width / Math.max(1, width),
      size.height / Math.max(1, height),
    );
    if (fitScale >= 1) return;
    object.set({
      scaleX: (Number(object.scaleX) || 1) * fitScale,
      scaleY: (Number(object.scaleY) || 1) * fitScale,
    });
    object.setCoords();
  }

  function keepInsideBounds(object, size) {
    const bounds = objectBounds(object);
    const width = bounds.right - bounds.left;
    const height = bounds.bottom - bounds.top;
    const deltaX = width <= size.width
      ? (bounds.left < 0 ? -bounds.left : bounds.right > size.width ? size.width - bounds.right : 0)
      : -bounds.left;
    const deltaY = height <= size.height
      ? (bounds.top < 0 ? -bounds.top : bounds.bottom > size.height ? size.height - bounds.bottom : 0)
      : -bounds.top;
    if (deltaX || deltaY) {
      object.set({
        left: (Number(object.left) || 0) + deltaX,
        top: (Number(object.top) || 0) + deltaY,
      });
    }
    object.setCoords();
  }

  function snapIfStillInside(object, size) {
    const original = { left: Number(object.left) || 0, top: Number(object.top) || 0 };
    object.set({ left: snap(original.left), top: snap(original.top) });
    object.setCoords();
    const bounds = objectBounds(object);
    if (bounds.left < 0 || bounds.top < 0 || bounds.right > size.width || bounds.bottom > size.height) {
      object.set(original);
      object.setCoords();
    }
  }

  function normalizeScaleByType(object) {
    if (!object) return;
    if (object.sceneType === "text") {
      if (ProcedureTextBox?.isProcedureTextBox(object)) {
        const scaleX = Math.abs(Number(object.scaleX) || 1);
        if (Math.abs(scaleX - 1) > 0.001) {
          ProcedureTextBox.updateTextBoxLayout(object, {
            width: (Number(object.width) || Number(object.baseWidth) || 80) * scaleX,
            anchor: object.getCenterPoint?.(),
          });
        }
        object.set({ scaleX: 1, scaleY: 1 });
        return;
      }
      const scaleX = Math.abs(Number(object.scaleX) || 1);
      const width = Math.max(80, (Number(object.width) || Number(object.baseWidth) || 80) * scaleX);
      object.set({ width, scaleX: 1, scaleY: 1 });
      object.initDimensions?.();
      object.set({ height: Math.max(40, Number(object.height) || 40), baseWidth: width, baseHeight: object.height });
      return;
    }
    if (object.sceneType !== "image") {
      object.set({ scaleX: Math.abs(Number(object.scaleX) || 1), scaleY: Math.abs(Number(object.scaleY) || 1) });
    }
    if (object.sceneType === "arrow") object.set({ scaleY: 1 });
    if (object.sceneType === "circle") {
      const scale = Math.max(Math.abs(Number(object.scaleX) || 1), Math.abs(Number(object.scaleY) || 1));
      object.set({ scaleX: scale, scaleY: scale });
    }
  }

  function normalizeObjectTransform(object, size, options = {}) {
    if (!object || !size) return;
    normalizeScaleByType(object);
    if (options.keepInside !== false) {
      scaleObjectToFit(object, size);
      keepInsideBounds(object, size);
      if (options.snap) snapIfStillInside(object, size);
      keepInsideBounds(object, size);
    }
    object.setCoords();
    object.canvas?.requestRenderAll?.();
  }

  function elementFor(card, object) {
    return card?.scene?.elements?.find((item) => item.id === object?.sceneId) || null;
  }

  function syncElementFromObject(card, object, options = {}) {
    const element = elementFor(card, object);
    if (!element) return null;
    const size = sceneSize(card);
    normalizeObjectTransform(object, size, { snap: true, ...options });
    const baseWidth = Math.max(1, Number(object.baseWidth) || Number(object.width) || element.width || 1);
    const baseHeight = Math.max(1, Number(object.baseHeight) || Number(object.height) || element.height || 1);
    let width = baseWidth * Math.abs(Number(object.scaleX) || 1);
    let height = baseHeight * Math.abs(Number(object.scaleY) || 1);

    if (element.type === "arrow") height = Math.max(12, element.height || baseHeight);
    if (element.type === "circle") {
      const sizeValue = Math.max(12, width, height);
      width = sizeValue;
      height = sizeValue;
    }
    if (element.type === "text") {
      width = Math.max(80, Number(object.width) || width);
      height = Math.max(40, Number(object.height) || height);
    }

    element.width = Math.min(size.width, Math.max(1, width));
    element.height = Math.min(size.height, Math.max(1, height));
    const centeredOrigin = ["image", "arrow", "circle", "square"].includes(element.type);
    const originOffsetX = centeredOrigin ? element.width / 2 : 0;
    const originOffsetY = centeredOrigin ? element.height / 2 : 0;
    element.x = clamp((Number(object.left) || 0) - originOffsetX, 0, Math.max(0, size.width - Math.min(element.width, size.width)));
    element.y = clamp((Number(object.top) || 0) - originOffsetY, 0, Math.max(0, size.height - Math.min(element.height, size.height)));
    element.rotation = normalizedAngle(object.angle);
    syncBlocks(card);
    return element;
  }

  window.FabricEditorTransform = {
    GRID_SIZE,
    clamp,
    elementFor,
    normalizeObjectTransform,
    pointerFor,
    resizeCanvas,
    sceneSize,
    syncBlocks,
    syncElementFromObject,
  };
}());

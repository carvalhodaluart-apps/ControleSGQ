(function () {
  const Transform = window.FabricEditorTransform;
  const Fabric = window.fabric;
  const Core = window.SceneGraphCore;
  if (!Transform || !Fabric || !Core) return;

  function readSize(source) {
    return new Promise((resolve) => {
      const image = new window.Image();
      image.onload = () => resolve({ width: image.naturalWidth || image.width, height: image.naturalHeight || image.height });
      image.onerror = () => resolve(null);
      image.src = source;
    });
  }

  function frameSize(sourceSize, sceneSize) {
    if (!sourceSize?.width || !sourceSize?.height) return null;
    const scale = Math.min(1, sceneSize.width / sourceSize.width, sceneSize.height / sourceSize.height);
    return {
      width: Math.max(1, Math.round(sourceSize.width * scale)),
      height: Math.max(1, Math.round(sourceSize.height * scale)),
    };
  }

  function resizeElement(element, frame, sceneSize, preserveCenter = true) {
    if (!frame) return;
    const centerX = Number(element.x) + Number(element.width) / 2;
    const centerY = Number(element.y) + Number(element.height) / 2;
    element.width = frame.width;
    element.height = frame.height;
    const nextX = preserveCenter ? centerX - frame.width / 2 : Number(element.x) || 0;
    const nextY = preserveCenter ? centerY - frame.height / 2 : Number(element.y) || 0;
    element.x = Transform.clamp(nextX, 0, Math.max(0, sceneSize.width - frame.width));
    element.y = Transform.clamp(nextY, 0, Math.max(0, sceneSize.height - frame.height));
  }

  function cropRectFor(element) {
    // Start with the complete image so applying without dragging is lossless.
    const inset = 0;
    return new Fabric.Rect({
      left: element.x + inset,
      top: element.y + inset,
      originX: "left",
      originY: "top",
      width: Math.max(24, element.width - inset * 2),
      height: Math.max(24, element.height - inset * 2),
      fill: "rgba(21, 94, 239, .08)",
      stroke: "#155eef",
      strokeWidth: 2,
      strokeDashArray: [8, 6],
      cornerColor: "#155eef",
      cornerStrokeColor: "#ffffff",
      cornerStyle: "circle",
      cornerSize: 12,
      transparentCorners: false,
      padding: 0,
      lockRotation: true,
      lockScalingFlip: true,
      sceneType: "image-crop-editor",
    });
  }

  function constrainCrop(session, rect) {
    const element = session?.cropState?.element;
    if (!element || !rect) return;
    const width = Math.max(24, Number(rect.width) * Math.abs(Number(rect.scaleX) || 1));
    const height = Math.max(24, Number(rect.height) * Math.abs(Number(rect.scaleY) || 1));
    const safeWidth = Math.min(width, element.width);
    const safeHeight = Math.min(height, element.height);
    rect.set({
      left: Transform.clamp(Number(rect.left) || element.x, element.x, element.x + element.width - safeWidth),
      top: Transform.clamp(Number(rect.top) || element.y, element.y, element.y + element.height - safeHeight),
      width: safeWidth,
      height: safeHeight,
      scaleX: 1,
      scaleY: 1,
    });
    rect.setCoords();
    session.canvas.requestRenderAll();
  }

  function startCrop(session, object, element) {
    if (!session || !object || !element || session.cropState) return false;
    const rect = cropRectFor(element);
    session.cropState = { object, element, rect };
    session.isCroppingImage = true;
    object.set({ selectable: false, evented: false });
    session.canvas.add(rect);
    session.canvas.setActiveObject(rect);
    session.canvas.requestRenderAll();
    return true;
  }

  function cancelCrop(session) {
    const state = session?.cropState;
    if (!state) return;
    session.canvas.remove(state.rect);
    state.object.set({ selectable: !state.element.locked, evented: !state.element.locked });
    session.cropState = null;
    session.isCroppingImage = false;
    session.canvas.discardActiveObject();
    session.canvas.setActiveObject(state.object);
    session.canvas.requestRenderAll();
  }

  function cropSource(source, element, rect) {
    return new Promise((resolve) => {
      const image = new window.Image();
      image.onload = () => {
        const fit = element.fit === "cover" ? "cover" : "contain";
        const scale = (fit === "cover" ? Math.max : Math.min)(element.width / image.width, element.height / image.height);
        const renderedWidth = image.width * scale;
        const renderedHeight = image.height * scale;
        const offsetX = (element.width - renderedWidth) / 2;
        const offsetY = (element.height - renderedHeight) / 2;
        const sourceX = Transform.clamp((rect.left - element.x - offsetX) / scale, 0, image.width);
        const sourceY = Transform.clamp((rect.top - element.y - offsetY) / scale, 0, image.height);
        const sourceWidth = Transform.clamp(rect.width / scale, 1, image.width - sourceX);
        const sourceHeight = Transform.clamp(rect.height / scale, 1, image.height - sourceY);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(sourceWidth));
        canvas.height = Math.max(1, Math.round(sourceHeight));
        canvas.getContext("2d").drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
        resolve({ image: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height });
      };
      image.onerror = () => resolve(null);
      image.src = source;
    });
  }

  async function finishCrop(session) {
    const state = session?.cropState;
    if (!state) return null;
    constrainCrop(session, state.rect);
    const result = await cropSource(state.element.image, state.element, state.rect);
    if (!result) return null;
    const frame = { x: state.rect.left, y: state.rect.top, width: state.rect.width, height: state.rect.height };
    cancelCrop(session);
    return { ...result, ...frame };
  }

  async function applyCrop(session) {
    const state = session?.cropState;
    if (!state) return null;
    const result = await finishCrop(session);
    if (!result) {
      cancelCrop(session);
      return null;
    }
    Object.assign(state.element, {
      image: result.image,
      x: result.x,
      y: result.y,
      width: result.width,
      height: result.height,
      fit: "contain",
    });
    return { element: state.element, object: state.object };
  }

  function isCropObject(object) {
    return object?.sceneType === "image-crop-editor";
  }

  function handleCropTransform(session, object) {
    if (!isCropObject(object)) return false;
    constrainCrop(session, object);
    return true;
  }

  function cancelIfActive(session) {
    if (!session?.isCroppingImage) return false;
    cancelCrop(session);
    return true;
  }

  async function handleCropAction(session, action, replace, render, status) {
    if (action === "crop-cancel") {
      cancelCrop(session);
      status("Recorte cancelado.");
      render();
      return true;
    }
    if (action !== "crop-apply") return false;
    const before = session.history.snapshot(session.card);
    const cropped = await applyCrop(session);
    if (!cropped) {
      render();
      return true;
    }
    Core.enforceSceneOrder(session.card.scene);
    Transform.syncBlocks(session.card);
    session.history.push(before, session.history.snapshot(session.card));
    if (typeof saveProcedure === "function") saveProcedure();
    await replace(cropped.object, cropped.element);
    status("Imagem recortada.");
    render();
    return true;
  }

  window.FabricEditorImage = {
    cancelCrop,
    applyCrop,
    cancelIfActive,
    constrainCrop,
    finishCrop,
    frameSize,
    handleCropAction,
    handleCropTransform,
    isCropObject,
    readSize,
    resizeElement,
    startCrop,
  };
}());

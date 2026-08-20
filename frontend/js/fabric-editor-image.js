(function () {
  const Transform = window.FabricEditorTransform;
  const Fabric = window.fabric;
  const Core = window.SceneGraphCore;
  if (!Transform || !Fabric || !Core) return;

  function readSize(source) {
    return new Promise((resolve) => {
      const safeSource = Core.safeImageSource?.(source) || "";
      if (!safeSource) return resolve(null);
      const image = new window.Image();
      image.onload = () => resolve({ width: image.naturalWidth || image.width, height: image.naturalHeight || image.height });
      image.onerror = () => resolve(null);
      image.src = safeSource;
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
    const center = {
      x: element.x + element.width / 2,
      y: element.y + element.height / 2,
    };
    const angle = Transform.snapRotation?.(element.rotation, 15) ?? 0;
    return new Fabric.Rect({
      left: center.x,
      top: center.y,
      originX: "center",
      originY: "center",
      width: Math.max(24, element.width - inset * 2),
      height: Math.max(24, element.height - inset * 2),
      angle,
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

  function localCropRect(element, rect) {
    const width = Math.max(1, Number(rect.width) * Math.abs(Number(rect.scaleX) || 1));
    const height = Math.max(1, Number(rect.height) * Math.abs(Number(rect.scaleY) || 1));
    const centerX = Number(element.x) + Number(element.width) / 2;
    const centerY = Number(element.y) + Number(element.height) / 2;
    const radians = (Number(element.rotation) || 0) * Math.PI / 180;
    const rectCenterX = Number.isFinite(Number(rect.left)) ? Number(rect.left) : centerX;
    const rectCenterY = Number.isFinite(Number(rect.top)) ? Number(rect.top) : centerY;
    const dx = rectCenterX - centerX;
    const dy = rectCenterY - centerY;
    const localCenterX = centerX + dx * Math.cos(radians) + dy * Math.sin(radians);
    const localCenterY = centerY - dx * Math.sin(radians) + dy * Math.cos(radians);
    return { left: localCenterX - width / 2, top: localCenterY - height / 2, width, height };
  }

  function canvasPointFromLocal(element, x, y) {
    const centerX = Number(element.x) + Number(element.width) / 2;
    const centerY = Number(element.y) + Number(element.height) / 2;
    const radians = (Number(element.rotation) || 0) * Math.PI / 180;
    const dx = x - centerX;
    const dy = y - centerY;
    return {
      x: centerX + dx * Math.cos(radians) - dy * Math.sin(radians),
      y: centerY + dx * Math.sin(radians) + dy * Math.cos(radians),
    };
  }

  function constrainCrop(session, rect) {
    const element = session?.cropState?.cropElement;
    if (!element || !rect) return;
    const local = localCropRect(element, rect);
    const width = Math.min(local.width, Number(element.width));
    const height = Math.min(local.height, Number(element.height));
    const localCenterX = local.left + local.width / 2;
    const localCenterY = local.top + local.height / 2;
    const clampedCenterX = Transform.clamp(localCenterX, Number(element.x) + width / 2, Number(element.x) + Number(element.width) - width / 2);
    const clampedCenterY = Transform.clamp(localCenterY, Number(element.y) + height / 2, Number(element.y) + Number(element.height) - height / 2);
    const center = canvasPointFromLocal(element, clampedCenterX, clampedCenterY);
    const safeWidth = Math.min(width, element.width);
    const safeHeight = Math.min(height, element.height);
    rect.set({
      left: center.x,
      top: center.y,
      width: safeWidth,
      height: safeHeight,
      scaleX: 1,
      scaleY: 1,
      angle: Number(element.rotation) || 0,
    });
    rect.setCoords();
    session.canvas.requestRenderAll();
  }

  function startCrop(session, object, element) {
    if (!session || !object || !element || session.cropState) return false;
    // The crop overlay follows the current Fabric frame, but opening the
    // tool must not mutate the persisted scene. A rotated image has local
    // width/height different from its axis-aligned visual bounding box.
    const visualWidth = Math.max(1, Number(object.getScaledWidth?.()) || Number(object.width) * Math.abs(Number(object.scaleX) || 1));
    const visualHeight = Math.max(1, Number(object.getScaledHeight?.()) || Number(object.height) * Math.abs(Number(object.scaleY) || 1));
    const center = object.getCenterPoint?.() || {
      x: Number(element.x) + Number(element.width) / 2,
      y: Number(element.y) + Number(element.height) / 2,
    };
    const cropElement = {
      ...element,
      x: center.x - visualWidth / 2,
      y: center.y - visualHeight / 2,
      width: visualWidth,
      height: visualHeight,
      rotation: Transform.snapRotation?.(object.angle, 15) ?? Number(element.rotation) ?? 0,
    };
    const rect = cropRectFor(cropElement);
    session.cropState = { object, element, cropElement, rect };
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
      const safeSource = Core.safeImageSource?.(source) || "";
      if (!safeSource) return resolve(null);
      const image = new window.Image();
      image.onload = () => {
        const fit = element.fit === "cover" ? "cover" : "contain";
        const scale = (fit === "cover" ? Math.max : Math.min)(element.width / image.width, element.height / image.height);
        const renderedWidth = image.width * scale;
        const renderedHeight = image.height * scale;
        const offsetX = (element.width - renderedWidth) / 2;
        const offsetY = (element.height - renderedHeight) / 2;
        const local = localCropRect(element, rect);
        const sourceX = Transform.clamp((local.left - element.x - offsetX) / scale, 0, image.width);
        const sourceY = Transform.clamp((local.top - element.y - offsetY) / scale, 0, image.height);
        const sourceWidth = Transform.clamp(local.width / scale, 1, image.width - sourceX);
        const sourceHeight = Transform.clamp(local.height / scale, 1, image.height - sourceY);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(sourceWidth));
        canvas.height = Math.max(1, Math.round(sourceHeight));
        canvas.getContext("2d").drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
        resolve({ image: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height });
      };
      image.onerror = () => resolve(null);
      image.src = safeSource;
    });
  }

  async function finishCrop(session) {
    const state = session?.cropState;
    if (!state) return null;
    constrainCrop(session, state.rect);
    const result = await cropSource(state.cropElement.image, state.cropElement, state.rect);
    if (!result) return null;
    const local = localCropRect(state.cropElement, state.rect);
    const frame = { x: local.left, y: local.top, width: local.width, height: local.height };
    cancelCrop(session);
    return {
      ...result,
      ...frame,
      rotation: state.cropElement.rotation,
      sourceWidth: result.width,
      sourceHeight: result.height,
    };
  }

  function frameForCroppedSource(result) {
    const areaWidth = Math.max(1, Number(result.width) || 1);
    const areaHeight = Math.max(1, Number(result.height) || 1);
    const sourceWidth = Math.max(1, Number(result.sourceWidth) || areaWidth);
    const sourceHeight = Math.max(1, Number(result.sourceHeight) || areaHeight);
    const ratio = sourceWidth / sourceHeight;
    const width = Math.min(areaWidth, areaHeight * ratio);
    const height = width / ratio;
    return {
      x: Number(result.x) + (areaWidth - width) / 2,
      y: Number(result.y) + (areaHeight - height) / 2,
      width,
      height,
    };
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
      ...frameForCroppedSource(result),
      rotation: result.rotation,
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
    await replace(cropped.object, cropped.element);
    // Persist only after the new Fabric object is mounted. Otherwise the live
    // synchronizer can read the old frame and overwrite the crop dimensions.
    if (typeof saveProcedure === "function") saveProcedure();
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

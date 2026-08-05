(function () {
  const Core = window.SceneGraphCore;
  if (!Core) return;

  function objectType(object, owners) {
    if (object?.sceneType) return object.sceneType;
    return owners.get(object?.annotationOwnerId)?.type || "annotation";
  }

  function canvasRank(object, owners) {
    const type = objectType(object, owners);
    return type === "annotation" ? 1 : Core.hierarchyRank(type);
  }

  function enforceCanvasOrder(canvas, scene) {
    if (!canvas) return;
    const owners = new Map((scene?.elements || []).map((element) => [element.id, element]));
    const order = new Map((scene?.elements || []).map((element, index) => [element.id, index]));
    const sorted = canvas.getObjects().slice().sort((first, second) => (
      canvasRank(first, owners) - canvasRank(second, owners)
      || (order.get(first.sceneId || first.annotationOwnerId) ?? 0) - (order.get(second.sceneId || second.annotationOwnerId) ?? 0)
    ));
    sorted.forEach((object, index) => {
      const currentIndex = canvas.getObjects().indexOf(object);
      if (currentIndex === index) return;
      if (typeof canvas.moveObjectTo === "function") canvas.moveObjectTo(object, index);
      else {
        canvas.remove(object);
        canvas.insertAt(index, object);
      }
    });
  }

  function rect(element, x = element.x, y = element.y) {
    return { left: x, top: y, right: x + element.width, bottom: y + element.height };
  }

  function overlaps(first, second) {
    return first.left < second.right && first.right > second.left
      && first.top < second.bottom && first.bottom > second.top;
  }

  function imagePosition(element, elements, size) {
    const images = (elements || []).filter((item) => item.type === "image" && item.id !== element.id);
    const maxX = Math.max(0, size.width - element.width);
    const maxY = Math.max(0, size.height - element.height);
    const step = Math.max(24, Math.min(element.width, element.height, 96));
    const xPositions = new Set([0, maxX, Math.min(maxX, Math.max(0, element.x))]);
    const yPositions = new Set([0, maxY, Math.min(maxY, Math.max(0, element.y))]);
    for (let x = 0; x <= maxX; x += step) xPositions.add(x);
    for (let y = 0; y <= maxY; y += step) yPositions.add(y);
    const candidates = [];
    yPositions.forEach((y) => xPositions.forEach((x) => candidates.push({ x, y })));
    const candidate = candidates.find((position) => {
      const candidateRect = rect(element, position.x, position.y);
      return !images.some((image) => overlaps(candidateRect, rect(image)));
    });
    return candidate || null;
  }

  function fitImagePosition(element, elements, size) {
    const minScale = Math.min(1, Math.max(48 / Math.max(1, element.width), 48 / Math.max(1, element.height)));
    for (let index = 0; index <= 20; index += 1) {
      const scale = 1 - (1 - minScale) * index / 20;
      const candidate = {
        ...element,
        width: Math.max(1, Math.round(element.width * scale)),
        height: Math.max(1, Math.round(element.height * scale)),
      };
      const position = imagePosition(candidate, elements, size);
      if (position) return { ...candidate, ...position };
    }
    return null;
  }

  function objectRect(object, left = object.left, top = object.top) {
    const coordinates = object?.getCoords?.() || [];
    if (coordinates.length) {
      const xs = coordinates.map((point) => point.x);
      const ys = coordinates.map((point) => point.y);
      return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
    }
    const width = Math.abs(Number(object.width) || 0) * Math.abs(Number(object.scaleX) || 1);
    const height = Math.abs(Number(object.height) || 0) * Math.abs(Number(object.scaleY) || 1);
    if (object.originX === "center") left -= width / 2;
    if (object.originY === "center") top -= height / 2;
    return {
      left,
      top,
      right: left + width,
      bottom: top + height,
    };
  }

  function captureTransform(object) {
    return {
      left: object.left,
      top: object.top,
      scaleX: object.scaleX,
      scaleY: object.scaleY,
      angle: object.angle,
    };
  }

  function constrainImageObject(object, canvas, previous) {
    if (!object || object.sceneType !== "image") return captureTransform(object);
    const current = objectRect(object);
    const collision = canvas.getObjects().some((other) => (
      other !== object
      && other.sceneType === "image"
      && overlaps(current, objectRect(other))
    ));
    if (!collision) return captureTransform(object);
    if (previous) object.set(previous);
    object.setCoords?.();
    return previous || captureTransform(object);
  }

  window.FabricEditorHierarchy = { constrainImageObject, enforceCanvasOrder, fitImagePosition, imagePosition };
}());

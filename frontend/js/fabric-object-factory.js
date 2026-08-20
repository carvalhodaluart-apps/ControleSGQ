(function () {
  const Core = window.SceneGraphCore;
  const Fabric = window.fabric;
  const ProcedureTextBox = window.ProcedureTextBox;
  if (!Core || !Fabric) return;

  function toneOf(tone) {
    return Core.TONES?.[tone] || {
      fill: tone === "warning" ? "#fff9d6" : tone === "danger" ? "#fff1f0" : "#effaf3",
      stroke: tone === "warning" ? "#FFBF00" : tone === "danger" ? "#d92d20" : "#159447",
      text: "#000000",
    };
  }

  function plainText(element) {
    if (element.text) return element.text;
    const container = document.createElement("div");
    container.innerHTML = element.html || "";
    return container.textContent || "";
  }

  function usesCenteredOrigin(element) {
    return ["image", "arrow", "circle", "square"].includes(element?.type);
  }

  function markupShadow(element) {
    return undefined;
  }

  function commonProps(element, interactive) {
    const centered = usesCenteredOrigin(element);
    return {
      left: centered ? element.x + element.width / 2 : element.x,
      top: centered ? element.y + element.height / 2 : element.y,
      originX: centered ? "center" : "left",
      originY: centered ? "center" : "top",
      angle: element.rotation || 0,
      opacity: element.opacity ?? 1,
      shadow: markupShadow(element),
      selectable: Boolean(interactive) && !element.locked,
      evented: Boolean(interactive) && !element.locked,
      hasRotatingPoint: Boolean(interactive),
      snapAngle: 15,
      snapThreshold: 7.5,
      cornerStyle: "circle",
      cornerSize: 12,
      touchCornerSize: 24,
      borderColor: "#155eef",
      cornerColor: "#155eef",
      cornerStrokeColor: "#155eef",
      transparentCorners: false,
      padding: 0,
      centeredRotation: true,
      lockMovementX: Boolean(element.locked),
      lockMovementY: Boolean(element.locked),
      lockScalingFlip: true,
      sceneId: element.id,
      sceneType: element.type,
      baseWidth: element.width,
      baseHeight: element.height,
    };
  }

  function textObject(element, options) {
    const tone = toneOf(element.tone);
    if (ProcedureTextBox) {
      const object = ProcedureTextBox.create(element, {
        ...commonProps(element, options.interactive),
        tone: element.tone,
      });
      object.objectRole = "procedure-textbox";
      return object;
    }
    const object = new Fabric.Textbox(plainText(element), {
      ...commonProps(element, options.interactive),
      width: Math.max(80, element.width),
      height: Math.max(40, element.height),
      fontFamily: element.fontFamily || "Arial, Helvetica, sans-serif",
      fontSize: Math.max(8, Number(element.fontSize) || 20),
      fontWeight: Number(element.fontWeight) >= 700 ? "bold" : "normal",
      fill: element.color || tone.text || "#000000",
      textAlign: element.textAlign || "center",
      lineHeight: Number(element.lineHeight) || 1.35,
      backgroundColor: tone.fill,
      editingBorderColor: tone.stroke,
      borderColor: tone.stroke,
      cornerColor: tone.stroke,
      cornerStrokeColor: "#ffffff",
      cursorColor: element.color || tone.text || "#000000",
      lockScalingFlip: true,
      lockScalingY: Boolean(options.interactive),
    });
    object.objectRole = "procedure-textbox";
    return object;
  }

  function arrowEndpointControl(side) {
    const movingEnd = side === "end";
    return new Fabric.Control({
      x: movingEnd ? 0.5 : -0.5,
      y: -0.5,
      cursorStyleHandler: () => "crosshair",
      actionHandler: (_event, transform, pointerX, pointerY) => {
        const target = transform.target;
        const pointer = new Fabric.Point(pointerX, pointerY);
        const fixedLocal = new Fabric.Point(movingEnd ? -target.width / 2 : target.width / 2, 0);
        const matrix = target.calcTransformMatrix();
        const gesture = target.__arrowEndpointGesture?.transform === transform
          ? target.__arrowEndpointGesture
          : (target.__arrowEndpointGesture = { transform, fixed: Fabric.util.transformPoint(fixedLocal, matrix), moving: Fabric.util.transformPoint(new Fabric.Point(movingEnd ? target.width / 2 : -target.width / 2, 0), matrix), pointer: { x: pointer.x, y: pointer.y } });
        const fixed = gesture.fixed;
        let dx = gesture.moving.x + pointer.x - gesture.pointer.x - fixed.x;
        let dy = gesture.moving.y + pointer.y - gesture.pointer.y - fixed.y;
        const length = Math.max(24, Math.hypot(dx, dy));
        if (Math.hypot(dx, dy) < 24) {
          const angle = Number(target.angle || 0) * Math.PI / 180;
          dx = Math.cos(angle) * 24 * (movingEnd ? 1 : -1);
          dy = Math.sin(angle) * 24 * (movingEnd ? 1 : -1);
        }
        const moving = { x: fixed.x + dx, y: fixed.y + dy };
        const center = { x: (fixed.x + moving.x) / 2, y: (fixed.y + moving.y) / 2 };
        const axisX = movingEnd ? dx : -dx;
        const axisY = movingEnd ? dy : -dy;
        target.set({
          left: center.x,
          top: center.y,
          angle: Math.atan2(axisY, axisX) * 180 / Math.PI,
          scaleX: length / Math.max(1, target.width),
          scaleY: 1,
        });
        target.__arrowEndpointTransform = true;
        target.setCoords();
        return true;
      },
    });
  }

  function configureArrowControls(group) {
    group.controls.tl = arrowEndpointControl("start");
    group.controls.bl = arrowEndpointControl("start");
    group.controls.tr = arrowEndpointControl("end");
    group.controls.br = arrowEndpointControl("end");
    group.setControlsVisibility({ ml: false, mr: false, mt: false, mb: false });
  }

  function arrowObject(element, options) {
    const tone = toneOf(element.tone);
    const stroke = Math.max(1, Number(element.borderWidth) || 3);
    const headWidth = 24;
    const headCenter = Math.max(headWidth / 2, element.width - headWidth / 2);
    const lineEnd = Math.max(1, headCenter - headWidth / 2);
    const contourLine = new Fabric.Line([0, element.height / 2, lineEnd, element.height / 2], {
      stroke: tone.fill,
      strokeWidth: stroke + 4,
      strokeLineCap: "round",
      strokeUniform: true,
      selectable: false,
      evented: false,
    });
    const line = new Fabric.Line([0, element.height / 2, lineEnd, element.height / 2], {
      stroke: tone.stroke,
      strokeWidth: stroke,
      strokeLineCap: "round",
      strokeUniform: true,
    });
    const contourHead = new Fabric.Triangle({
      left: headCenter,
      top: element.height / 2,
      width: headWidth,
      height: headWidth,
      fill: tone.stroke,
      stroke: tone.fill,
      strokeWidth: 4,
      strokeUniform: true,
      angle: 90,
      originX: "center",
      originY: "center",
      selectable: false,
      evented: false,
    });
    const head = new Fabric.Triangle({
      left: headCenter,
      top: element.height / 2,
      width: headWidth,
      height: headWidth,
      fill: tone.stroke,
      angle: 90,
      originX: "center",
      originY: "center",
    });
    const group = new Fabric.Group([contourLine, contourHead, line, head], {
      ...commonProps(element, options.interactive),
      lockScalingY: Boolean(options.interactive),
    });
    group.objectRole = "procedure-arrow";
    group.arrowParts = { line, head, contourLine, contourHead };
    if (options.interactive) configureArrowControls(group);
    return group;
  }

  function shapeObject(element, options) {
    const tone = toneOf(element.tone);
    const borderWidth = Math.max(1, Number(element.borderWidth) || 3);
    const childProps = { fill: element.fill || "transparent", strokeUniform: true, originX: "center", originY: "center", left: 0, top: 0, selectable: false, evented: false };
    if (element.type === "circle") {
      const diameter = Math.max(1, Math.max(element.width, element.height));
      const contour = new Fabric.Circle({ ...childProps, radius: diameter / 2, stroke: tone.fill, strokeWidth: borderWidth + 4 });
      const circle = new Fabric.Circle({ ...childProps, radius: diameter / 2, stroke: tone.stroke, strokeWidth: borderWidth });
      const group = new Fabric.Group([contour, circle], { ...commonProps(element, options.interactive), lockUniScaling: Boolean(options.interactive) });
      group.baseWidth = diameter; group.baseHeight = diameter; return group;
    }
    const contour = new Fabric.Rect({ ...childProps, width: element.width, height: element.height, stroke: tone.fill, strokeWidth: borderWidth + 4 });
    const rect = new Fabric.Rect({ ...childProps, width: element.width, height: element.height, stroke: tone.stroke, strokeWidth: borderWidth });
    const group = new Fabric.Group([contour, rect], commonProps(element, options.interactive));
    group.baseWidth = element.width; group.baseHeight = element.height; return group;
  }

  async function imageObject(element, options) {
    const imageSource = Core.safeImageSource?.(element.image) || "";
    if (!imageSource) return null;
    const image = await Fabric.FabricImage.fromURL(imageSource, { crossOrigin: "anonymous" });
    const fit = element.fit === "cover" ? "cover" : "contain";
    const scale = (fit === "cover" ? Math.max : Math.min)(element.width / image.width, element.height / image.height);
    const centerX = element.width / 2;
    const centerY = element.height / 2;
    image.set({
      left: centerX,
      top: centerY,
      originX: "center",
      originY: "center",
      scaleX: scale * (element.flipX ? -1 : 1),
      scaleY: scale * (element.flipY ? -1 : 1),
      selectable: false,
      evented: false,
    });
    if (fit === "cover") {
      image.clipPath = new Fabric.Rect({
        left: centerX,
        top: centerY,
        originX: "center",
        originY: "center",
        width: element.width,
        height: element.height,
        absolutePositioned: false,
      });
    }
    const frame = new Fabric.Rect({
      left: 0,
      top: 0,
      originX: "left",
      originY: "top",
      width: element.width,
      height: element.height,
      fill: "transparent",
      strokeWidth: 0,
      selectable: false,
      evented: false,
    });
    const group = new Fabric.Group([frame, image], {
      ...commonProps(element, options.interactive),
      left: element.x + element.width / 2,
      top: element.y + element.height / 2,
      originX: "center",
      originY: "center",
      lockUniScaling: Boolean(options.interactive),
    });
    group.objectRole = "procedure-image-frame";
    group.hasSceneAnnotations = Boolean(element.annotations?.length);
    return group;
  }

  function annotationPoint(element, annotation) {
    const centerX = element.x + element.width / 2;
    const centerY = element.y + element.height / 2;
    const localX = ((Number(annotation.x) || 0) - 50) * element.width / 100;
    const localY = ((Number(annotation.y) || 0) - 50) * element.height / 100;
    const flippedX = localX * (element.flipX ? -1 : 1);
    const flippedY = localY * (element.flipY ? -1 : 1);
    const angle = (Number(element.rotation) || 0) * Math.PI / 180;
    return {
      x: centerX + flippedX * Math.cos(angle) - flippedY * Math.sin(angle),
      y: centerY + flippedX * Math.sin(angle) + flippedY * Math.cos(angle),
    };
  }

  function annotationAngle(element, annotation) {
    const localAngle = (Number(annotation.rotation) || 0) * Math.PI / 180;
    const flippedX = Math.cos(localAngle) * (element.flipX ? -1 : 1);
    const flippedY = Math.sin(localAngle) * (element.flipY ? -1 : 1);
    const imageAngle = (Number(element.rotation) || 0) * Math.PI / 180;
    return Math.atan2(
      flippedX * Math.sin(imageAngle) + flippedY * Math.cos(imageAngle),
      flippedX * Math.cos(imageAngle) - flippedY * Math.sin(imageAngle),
    ) * 180 / Math.PI;
  }

  function markerObjects(element, annotation, annotationIndex) {
    const point = annotationPoint(element, annotation);
    const objects = [
      new Fabric.Circle({
        left: point.x,
        top: point.y,
        angle: Number(element.rotation) || 0,
        scaleX: element.flipX ? -1 : 1,
        scaleY: element.flipY ? -1 : 1,
        radius: 16,
        originX: "center",
        originY: "center",
        fill: "#155eef",
        stroke: "#ffffff",
        strokeWidth: 3,
        selectable: false,
        evented: false,
      }),
      new Fabric.Text(String(annotation.number || ""), {
        left: point.x,
        top: point.y,
        angle: Number(element.rotation) || 0,
        scaleX: element.flipX ? -1 : 1,
        scaleY: element.flipY ? -1 : 1,
        width: 32,
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: String(annotation.number || "").length > 1 ? 15 : 18,
        fontWeight: "bold",
        fill: "#ffffff",
        textAlign: "center",
        originX: "center",
        originY: "center",
        selectable: false,
        evented: false,
      }),
    ];
    objects.forEach((object) => {
      object.annotationOwnerId = element.id;
      object.annotationIndex = annotationIndex;
      object.annotationKind = "marker";
    });
    return objects;
  }

  function annotationArrowObject(element, annotation, annotationIndex) {
    const tone = toneOf(annotation.tone || "success");
    const point = annotationPoint(element, annotation);
    const object = new Fabric.Group([
      new Fabric.Line([0, 0, 78, 0], {
        stroke: tone.stroke,
        strokeWidth: 5,
        strokeLineCap: "round",
        strokeUniform: true,
      }),
      new Fabric.Triangle({
        left: 82,
        top: 0,
        width: 22,
        height: 22,
        fill: tone.stroke,
        angle: 90,
        originX: "center",
        originY: "center",
      }),
    ], {
      left: point.x,
      top: point.y,
      angle: annotationAngle(element, annotation),
      selectable: false,
      evented: false,
    });
    object.annotationOwnerId = element.id;
    object.annotationIndex = annotationIndex;
    object.annotationKind = "arrow";
    return object;
  }

  function annotationObjects(element) {
    return (element.annotations || []).flatMap((annotation, annotationIndex) => {
      if (annotation.type === "marker") return markerObjects(element, annotation, annotationIndex);
      if (annotation.type === "arrow") return [annotationArrowObject(element, annotation, annotationIndex)];
      return [];
    });
  }

  function syncAnnotationObject(element, object) {
    const annotation = element?.annotations?.[Number(object?.annotationIndex)];
    if (!annotation || object?.annotationOwnerId !== element.id) return;
    const point = annotationPoint(element, annotation);
    object.set({
      left: point.x,
      top: point.y,
      angle: object.annotationKind === "arrow" ? annotationAngle(element, annotation) : Number(element.rotation) || 0,
      ...(object.annotationKind === "marker" ? {
        scaleX: element.flipX ? -1 : 1,
        scaleY: element.flipY ? -1 : 1,
      } : {}),
    });
    object.setCoords?.();
  }

  function syncAnnotationObjects(element, objects) {
    (objects || []).forEach((object) => syncAnnotationObject(element, object));
  }

  async function create(element, options = {}) {
    const settings = { interactive: false, annotations: true, ...options };
    let object = null;
    if (element.type === "image") object = await imageObject(element, settings);
    else if (element.type === "arrow") object = arrowObject(element, settings);
    else if (element.type === "circle" || element.type === "square") object = shapeObject(element, settings);
    else object = textObject(element, settings);
    return object;
  }

  async function createWithAnnotations(element, options = {}) {
    const object = await create(element, options);
    const annotations = options.annotations === false ? [] : annotationObjects(element);
    return object ? [object, ...annotations] : annotations;
  }

  window.FabricObjectFactory = { create, createWithAnnotations, annotationObjects, plainText, syncAnnotationObjects, toneOf };
}());

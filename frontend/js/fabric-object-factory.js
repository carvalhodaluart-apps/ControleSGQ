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

  function commonProps(element, interactive) {
    const centered = usesCenteredOrigin(element);
    return {
      left: centered ? element.x + element.width / 2 : element.x,
      top: centered ? element.y + element.height / 2 : element.y,
      originX: centered ? "center" : "left",
      originY: centered ? "center" : "top",
      angle: element.rotation || 0,
      opacity: element.opacity ?? 1,
      selectable: Boolean(interactive) && !element.locked,
      evented: Boolean(interactive) && !element.locked,
      hasRotatingPoint: Boolean(interactive),
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

  function arrowObject(element, options) {
    const tone = toneOf(element.tone);
    const stroke = Math.max(1, Number(element.borderWidth) || 3);
    const headWidth = 24;
    const headCenter = Math.max(headWidth / 2, element.width - headWidth / 2);
    const lineEnd = Math.max(1, headCenter - headWidth / 2);
    const line = new Fabric.Line([0, element.height / 2, lineEnd, element.height / 2], {
      stroke: tone.stroke,
      strokeWidth: stroke,
      strokeLineCap: "round",
      strokeUniform: true,
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
    const group = new Fabric.Group([line, head], {
      ...commonProps(element, options.interactive),
      lockScalingY: Boolean(options.interactive),
    });
    group.objectRole = "procedure-arrow";
    group.arrowParts = { line, head };
    return group;
  }

  function shapeObject(element, options) {
    const tone = toneOf(element.tone);
    const props = {
      ...commonProps(element, options.interactive),
      fill: element.fill || "transparent",
      stroke: tone.stroke,
      strokeWidth: element.borderWidth,
      strokeUniform: true,
    };
    if (element.type === "circle") {
      const diameter = Math.max(1, Math.max(element.width, element.height));
      const circle = new Fabric.Circle({
        ...props,
        radius: diameter / 2,
        lockUniScaling: Boolean(options.interactive),
      });
      circle.baseWidth = diameter;
      circle.baseHeight = diameter;
      return circle;
    }
    return new Fabric.Rect({
      ...props,
      width: element.width,
      height: element.height,
    });
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

  function markerObjects(element, annotation) {
    const x = element.x + (Number(annotation.x) || 0) * element.width / 100;
    const y = element.y + (Number(annotation.y) || 0) * element.height / 100;
    const objects = [
      new Fabric.Circle({
        left: x,
        top: y,
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
        left: x,
        top: y,
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
    objects.forEach((object) => { object.annotationOwnerId = element.id; });
    return objects;
  }

  function annotationArrowObject(element, annotation) {
    const tone = toneOf(annotation.tone || "success");
    const x = element.x + (Number(annotation.x) || 0) * element.width / 100;
    const y = element.y + (Number(annotation.y) || 0) * element.height / 100;
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
      left: x,
      top: y,
      angle: Number(annotation.rotation) || 0,
      selectable: false,
      evented: false,
    });
    object.annotationOwnerId = element.id;
    return object;
  }

  function annotationObjects(element) {
    return (element.annotations || []).flatMap((annotation) => {
      if (annotation.type === "marker") return markerObjects(element, annotation);
      if (annotation.type === "arrow") return [annotationArrowObject(element, annotation)];
      return [];
    });
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

  window.FabricObjectFactory = { create, createWithAnnotations, annotationObjects, plainText, toneOf };
}());

(function () {
  const Fabric = window.fabric;
  const Core = window.SceneGraphCore;
  if (!Fabric || !Core) return;

  const STRIPE_WIDTH = 8;
  const PANEL_PADDING = 14;
  const MIN_WIDTH = 160;
  const MIN_HEIGHT = 56;
  const CORNER_RADIUS = 8;

  function toneOf(tone) {
    return Core.TONES?.[tone] || Core.TONES.success;
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function textFor(component) {
    return component?.textBox || component;
  }

  function setLocalCenter(object, x, y) {
    object.set({ left: x, top: y, originX: "center", originY: "center" });
  }

  function refreshBounds(component, anchor, width, height) {
    component.set({ width, height, scaleX: 1, scaleY: 1 });
    if (anchor) component.setPositionByOrigin(anchor, "center", "center");
    component.setCoords();
  }

  function updateTextBoxLayout(component, options = {}) {
    if (!component?.textBox || !component?.panel || !component?.stripe) return component;
    const textBox = component.textBox;
    const padding = Math.max(8, Number(options.padding ?? component.panelPadding) || PANEL_PADDING);
    const stripeWidth = Math.max(6, Number(options.stripeWidth ?? component.stripeWidth) || STRIPE_WIDTH);
    const currentWidth = Number(component.width) || Number(component.baseWidth) || 300;
    const width = Math.max(MIN_WIDTH, Number(options.width) || currentWidth);
    const innerWidth = Math.max(48, width - stripeWidth - padding * 2);
    const anchor = options.anchor || component.getCenterPoint?.();

    component.panelPadding = padding;
    component.stripeWidth = stripeWidth;
    textBox.set({ width: innerWidth, scaleX: 1, scaleY: 1, padding: 0 });
    textBox.initDimensions?.();
    const textHeight = Math.max(1, Number(textBox.height) || 1);
    const measuredHeight = textHeight + padding * 2;
    const height = Math.max(MIN_HEIGHT, Number(options.height) || measuredHeight);
    const contentTop = -height / 2 + padding + Math.max(0, (height - padding * 2 - textHeight) / 2);

    component.panel.set({
      width: Math.max(1, width - 2),
      height: Math.max(1, height - 2),
      rx: CORNER_RADIUS,
      ry: CORNER_RADIUS,
      fill: component.toneFill,
      stroke: component.toneStroke,
      strokeWidth: 2,
      strokeUniform: true,
    });
    component.stripe.set({
      width: stripeWidth,
      height,
      left: -width / 2 + stripeWidth / 2,
      top: 0,
      rx: CORNER_RADIUS,
      ry: CORNER_RADIUS,
      fill: component.toneStroke,
      strokeWidth: 0,
    });
    setLocalCenter(component.panel, 0, 0);
    setLocalCenter(component.textBox, -width / 2 + stripeWidth + padding + innerWidth / 2, contentTop + textHeight / 2);
    refreshBounds(component, anchor, width, height);
    component.baseWidth = component.width;
    component.baseHeight = component.height;
    return component;
  }

  function updateTone(component, tone) {
    const colors = toneOf(tone);
    component.tone = tone || component.tone || "success";
    component.toneFill = colors.fill;
    component.toneStroke = colors.stroke;
    return updateTextBoxLayout(component);
  }

  function resizeFromControl(eventData, transform, x, y, side) {
    const component = transform?.target;
    if (!isProcedureTextBox(component)) return false;
    const center = component.getCenterPoint();
    const angle = ((Number(component.angle) || 0) * Math.PI) / 180;
    const localX = (x - center.x) * Math.cos(angle) + (y - center.y) * Math.sin(angle);
    const previousWidth = Number(component.width) || MIN_WIDTH;
    const nextWidth = Math.max(MIN_WIDTH, side === "right" ? localX * 2 : -localX * 2);
    const delta = nextWidth - previousWidth;
    const anchor = {
      x: center.x + (side === "right" ? delta / 2 : -delta / 2) * Math.cos(angle),
      y: center.y + (side === "right" ? delta / 2 : -delta / 2) * Math.sin(angle),
    };
    updateTextBoxLayout(component, { width: nextWidth, anchor });
    component.set({ scaleX: 1, scaleY: 1 });
    return true;
  }

  function controlStyle() {
    return "ew-resize";
  }

  function createControls(component) {
    component.setControlsVisibility({ tl: false, tr: false, bl: false, br: false, mt: false, mb: false });
    component.controls.ml = new Fabric.Control({
      x: -0.5,
      y: 0,
      cursorStyleHandler: controlStyle,
      actionHandler: (eventData, transform, x, y) => resizeFromControl(eventData, transform, x, y, "left"),
      actionName: "resize-text-left",
      sizeX: 24,
      sizeY: 24,
      touchSizeX: 42,
      touchSizeY: 42,
    });
    component.controls.mr = new Fabric.Control({
      x: 0.5,
      y: 0,
      cursorStyleHandler: controlStyle,
      actionHandler: (eventData, transform, x, y) => resizeFromControl(eventData, transform, x, y, "right"),
      actionName: "resize-text-right",
      sizeX: 24,
      sizeY: 24,
      touchSizeX: 42,
      touchSizeY: 42,
    });
  }

  class ProcedureTextBox extends Fabric.Group {
    constructor(text, options = {}) {
      const colors = toneOf(options.tone);
      const width = Math.max(MIN_WIDTH, Number(options.width) || 300);
      const padding = PANEL_PADDING;
      const stripeWidth = STRIPE_WIDTH;
      const innerWidth = Math.max(48, width - stripeWidth - padding * 2);
      const textBox = new Fabric.Textbox(text || "", {
        left: 0,
        top: 0,
        originX: "center",
        originY: "center",
        width: innerWidth,
        fontFamily: options.fontFamily || "Arial, Helvetica, sans-serif",
        fontSize: Math.max(8, Number(options.fontSize) || 20),
        fontWeight: Number(options.fontWeight) >= 700 ? "bold" : "normal",
        fill: options.color || colors.text || "#000000",
      textAlign: options.textAlign || "center",
      lineHeight: Number(options.lineHeight) || 1.35,
        styles: options.styles || {},
        selectable: false,
        evented: true,
        editingBorderColor: colors.stroke,
        cursorColor: options.color || colors.text || "#000000",
        padding: 0,
      });
      const panel = new Fabric.Rect({
        left: 0,
        top: 0,
        originX: "center",
        originY: "center",
        width,
        height: Math.max(MIN_HEIGHT, Number(options.height) || 92),
        fill: colors.fill,
        stroke: colors.stroke,
        strokeWidth: 2,
        strokeUniform: true,
        rx: CORNER_RADIUS,
        ry: CORNER_RADIUS,
        selectable: false,
        evented: false,
      });
      const stripe = new Fabric.Rect({
        left: -width / 2 + stripeWidth / 2,
        top: 0,
        originX: "center",
        originY: "center",
        width: stripeWidth,
        height: panel.height,
        fill: colors.stroke,
        selectable: false,
        evented: false,
      });
      super([panel, stripe, textBox], {
        ...options,
        originX: "left",
        originY: "top",
        subTargetCheck: true,
        objectCaching: false,
        lockScalingFlip: true,
        lockUniScaling: false,
      });
      this.textBox = textBox;
      this.panel = panel;
      this.stripe = stripe;
      this.panelPadding = padding;
      this.stripeWidth = stripeWidth;
      this.tone = options.tone || "success";
      this.toneFill = colors.fill;
      this.toneStroke = colors.stroke;
      this.objectRole = "procedure-textbox";
      this.sceneType = "text";
      updateTextBoxLayout(this, { width, height: options.height || 92 });
      createControls(this);
    }

    enterTextEditing() {
      this.textBox.enterEditing();
    }
  }

  function isProcedureTextBox(object) {
    return Boolean(object?.objectRole === "procedure-textbox" && object.textBox);
  }

  function create(element, commonProps = {}) {
    const colors = toneOf(element.tone);
    const component = new ProcedureTextBox(element.text || "", {
      ...commonProps,
      width: Math.max(MIN_WIDTH, Number(element.width) || 300),
      height: Math.max(MIN_HEIGHT, Number(element.height) || 92),
      tone: element.tone || "success",
      fontFamily: element.fontFamily,
      fontSize: element.fontSize,
      fontWeight: element.fontWeight,
      textAlign: element.textAlign,
      lineHeight: element.lineHeight,
      color: element.color || colors.text,
      styles: element.styles || {},
    });
    component.set({
      sceneId: element.id,
      sceneType: "text",
      left: element.x,
      top: element.y,
      angle: element.rotation || 0,
      selectable: Boolean(commonProps.selectable) && !element.locked,
      evented: Boolean(commonProps.evented) && !element.locked,
      lockMovementX: Boolean(element.locked),
      lockMovementY: Boolean(element.locked),
    });
    return component;
  }

  window.ProcedureTextBox = {
    create,
    isProcedureTextBox,
    textFor,
    updateTone,
    updateTextBoxLayout,
    ProcedureTextBox,
  };
}());

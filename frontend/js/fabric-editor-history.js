(function () {
  function clone(value) {
    return JSON.parse(JSON.stringify(value || null));
  }

  class CanvasHistory {
    constructor(limit = 30) {
      this.limit = limit;
      this.undoStack = [];
      this.redoStack = [];
      this.before = null;
      this.imageCache = new Map();
      this.imageSequence = 0;
    }

    snapshot(card) {
      return this.compact(clone(card?.scene || null));
    }

    compact(scene) {
      if (!scene) return scene;
      scene.elements?.forEach((element) => {
        if (element.type !== "image" || typeof element.image !== "string" || element.image.length < 1024) return;
        let token = this.imageCache.get(element.image);
        if (!token) {
          token = `__history_image_${++this.imageSequence}__`;
          this.imageCache.set(element.image, token);
          this.imageCache.set(token, element.image);
        }
        element.image = token;
      });
      return scene;
    }

    materialize(scene) {
      const result = clone(scene);
      result?.elements?.forEach((element) => {
        if (typeof element.image === "string" && this.imageCache.has(element.image)) element.image = this.imageCache.get(element.image);
      });
      return result;
    }

    begin(card) {
      this.before = this.snapshot(card);
    }

    commit(card) {
      const before = this.before;
      const after = this.snapshot(card);
      this.before = null;
      if (!before || !after || JSON.stringify(before) === JSON.stringify(after)) return;
      this.undoStack.push({ before, after });
      if (this.undoStack.length > this.limit) this.undoStack.shift();
      this.redoStack = [];
    }

    push(before, after) {
      if (!before || !after || JSON.stringify(before) === JSON.stringify(after)) return;
      this.undoStack.push({ before: clone(before), after: clone(after) });
      if (this.undoStack.length > this.limit) this.undoStack.shift();
      this.redoStack = [];
    }

    undo() {
      const command = this.undoStack.pop();
      if (!command) return null;
      this.redoStack.push(command);
      return this.materialize(command.before);
    }

    redo() {
      const command = this.redoStack.pop();
      if (!command) return null;
      this.undoStack.push(command);
      return this.materialize(command.after);
    }
  }

  window.FabricEditorHistory = { CanvasHistory };
}());

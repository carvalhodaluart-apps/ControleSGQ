(function () {
  function clone(value) {
    return JSON.parse(JSON.stringify(value || null));
  }

  class CanvasHistory {
    constructor(limit = 50) {
      this.limit = limit;
      this.undoStack = [];
      this.redoStack = [];
      this.before = null;
    }

    snapshot(card) {
      return clone(card?.scene || null);
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
      return clone(command.before);
    }

    redo() {
      const command = this.redoStack.pop();
      if (!command) return null;
      this.undoStack.push(command);
      return clone(command.after);
    }
  }

  window.FabricEditorHistory = { CanvasHistory };
}());

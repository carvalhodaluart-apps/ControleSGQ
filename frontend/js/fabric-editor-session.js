(function () {
  const History = window.FabricEditorHistory;
  if (!History) return;

  const sessionsByElement = new Map();
  const sessionsByCanvas = new WeakMap();
  let activeSession = null;

  class EditorSession {
    constructor({ canvasElement, canvas, card, sectionIndex, cardIndex }) {
      this.canvasElement = canvasElement;
      this.canvas = canvas;
      this.card = card;
      this.sectionIndex = sectionIndex;
      this.cardIndex = cardIndex;
      this.history = new History.CanvasHistory();
      this.selection = null;
      this.tool = null;
      this.toolbar = null;
      this.fontToolbar = null;
      this.isEditingText = false;
      this.disposed = false;
    }

    containsObject(object) {
      return Boolean(object && object.canvas === this.canvas && object.sceneId);
    }
  }

  function register(options) {
    const session = new EditorSession(options);
    sessionsByElement.set(session.canvasElement, session);
    sessionsByCanvas.set(session.canvas, session);
    activeSession = session;
    return session;
  }

  function unregister(session) {
    if (!session) return;
    sessionsByElement.delete(session.canvasElement);
    session.disposed = true;
    if (activeSession === session) activeSession = null;
  }

  function fromElement(element) {
    return sessionsByElement.get(element) || null;
  }

  function fromCanvas(canvas) {
    return sessionsByCanvas.get(canvas) || null;
  }

  function all() {
    return Array.from(sessionsByElement.values());
  }

  function find(sectionIndex, cardIndex) {
    return all().find((session) => session.sectionIndex === sectionIndex && session.cardIndex === cardIndex) || null;
  }

  function setActive(session) {
    if (session && !session.disposed) activeSession = session;
  }

  function getActive() {
    return activeSession && !activeSession.disposed ? activeSession : null;
  }

  window.FabricEditorSession = {
    all,
    find,
    fromCanvas,
    fromElement,
    getActive,
    register,
    setActive,
    unregister,
  };
}());

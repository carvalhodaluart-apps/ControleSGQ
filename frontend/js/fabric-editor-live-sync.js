(function () {
  const Session = window.FabricEditorSession;
  const Transform = window.FabricEditorTransform;
  if (!Session || !Transform) return;

  function syncMountedScenes(procedure) {
    Session.all().forEach((session) => {
      const card = procedure?.sections?.[session.sectionIndex]?.stepCards?.[session.cardIndex];
      // While cropping, the temporary crop rectangle is the active object.
      // Do not serialize the old image frame over a crop that is still open.
      if (!card || !session.canvas || session.isCroppingImage) return;
      session.canvas.getObjects().forEach((object) => {
        if (!object?.sceneId || object.sceneType === "text-editor" || object.sceneType === "image-crop-editor") return;
        Transform.syncElementFromObject(card, object, { normalize: false, keepInside: false, preservePosition: true });
      });
      Transform.syncBlocks(card);
    });
    return procedure;
  }

  window.FabricEditorLiveSync = { syncMountedScenes };
}());

(function () {
  const Factory = window.FabricObjectFactory;
  if (!Factory) return;

  function refresh(canvas, element) {
    if (!canvas || !element) return;
    canvas.getObjects().filter((object) => object.annotationOwnerId === element.id)
      .forEach((object) => canvas.remove(object));
    Factory.annotationObjects(element).forEach((object) => canvas.add(object));
  }

  function remove(canvas, element) {
    if (!canvas || !element) return;
    canvas.getObjects().filter((object) => object.annotationOwnerId === element.id)
      .forEach((object) => canvas.remove(object));
  }

  function sync(canvas, element) {
    if (!canvas || !element) return;
    Factory.syncAnnotationObjects?.(
      element,
      canvas.getObjects().filter((object) => object.annotationOwnerId === element.id),
    );
  }

  window.FabricAnnotationLayer = { refresh, remove, sync };
}());

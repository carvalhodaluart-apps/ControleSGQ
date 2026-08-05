const crypto = require("crypto");
const sharp = require("sharp");
const {
  ITEM_SCENE_SIZE,
  STEP_SCENE_SIZE,
  cardToScene,
  itemSectionToScene,
  sceneToSvg,
} = require("../../frontend/js/scene-graph-core");

const SCENE_RENDER_CACHE_LIMIT = 80;
const sceneRenderCache = new Map();

function cacheKey(svg, width) {
  return `${width}:${crypto.createHash("sha256").update(svg).digest("hex")}`;
}

function rememberRenderedScene(key, image) {
  sceneRenderCache.set(key, image);
  while (sceneRenderCache.size > SCENE_RENDER_CACHE_LIMIT) {
    sceneRenderCache.delete(sceneRenderCache.keys().next().value);
  }
}

async function renderScenePng(scene, width) {
  if (!scene.elements.length) return null;
  const svg = sceneToSvg(scene);
  const key = cacheKey(svg, width);
  if (sceneRenderCache.has(key)) return sceneRenderCache.get(key);
  const image = await sharp(Buffer.from(svg)).resize({ width }).png().toBuffer();
  rememberRenderedScene(key, image);
  return image;
}

async function renderStepCardPng(card, sectionIndex, cardIndex) {
  return renderScenePng(cardToScene(card, sectionIndex, cardIndex), STEP_SCENE_SIZE.width * 2);
}

async function renderItemBoardPng(section, sectionIndex) {
  return renderScenePng(itemSectionToScene(section, sectionIndex), ITEM_SCENE_SIZE.width * 2);
}

async function renderProcedureStepCards(procedure) {
  const rendered = new Map();
  await Promise.all((procedure.sections || []).flatMap((section, sectionIndex) => (
    (section.stepCards || []).map(async (card, cardIndex) => {
      try {
        const image = await renderStepCardPng(card, sectionIndex, cardIndex);
        if (image) rendered.set(`${sectionIndex}:${cardIndex}`, image);
      } catch (error) {
        console.warn(`Falha no scene graph ${sectionIndex}:${cardIndex}:`, error.message);
      }
    })
  )));
  return rendered;
}

async function renderProcedureItemBoards(procedure) {
  const rendered = new Map();
  await Promise.all((procedure.sections || []).map(async (section, sectionIndex) => {
    if (section.kind !== "items") return;
    try {
      const image = await renderItemBoardPng(section, sectionIndex);
      if (image) rendered.set(String(sectionIndex), image);
    } catch (error) {
      console.warn(`Falha no scene graph de itens ${sectionIndex}:`, error.message);
    }
  }));
  return rendered;
}

module.exports = {
  ITEM_SCENE_SIZE,
  STEP_SCENE_SIZE,
  renderProcedureItemBoards,
  renderProcedureStepCards,
};

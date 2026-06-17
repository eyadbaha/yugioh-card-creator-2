import type { APIBody } from "./types.js";
import {
  formatMonsterType,
  getTextVariant,
  isMonsterCard,
  linkArrowPositions,
  type CardRenderPlan,
  type StandardRenderLayer,
} from "./renderPlan.js";

const appendRepeated = (
  layers: StandardRenderLayer[],
  count: number,
  createLayer: (index: number) => StandardRenderLayer
) => {
  for (let index = 0; index < count; index++) {
    layers.push(createLayer(index));
  }
};

const appendMonsterFrameLayers = (layers: StandardRenderLayer[], options: APIBody, statCount: number) => {
  if (options.template === "xyz") {
    appendRepeated(layers, statCount, (index) => ({ kind: "rank", index }));
    layers.push({ kind: "def", text: options.def as string });
    return;
  }

  if (options.template === "link") {
    const selectedLinkArrows = new Set(options.linkArrows ?? []);
    layers.push({ kind: "linkRating", text: selectedLinkArrows.size.toString() });

    Array.from(selectedLinkArrows)
      .filter((arrow) => linkArrowPositions.includes(arrow))
      .reverse()
      .forEach((arrow) => layers.push({ kind: "linkArrow", arrow }));
    return;
  }

  appendRepeated(layers, statCount, (index) => ({ kind: "level", index }));
  layers.push({ kind: "def", text: options.def as string });
};

const appendPendulumLayers = (layers: StandardRenderLayer[], options: APIBody) => {
  const scaleText = options.scale?.toString() || "0";

  layers.push(
    { kind: "pendulumArtMask" },
    { kind: "pendulumArt" },
    { kind: "templateOverlay", templateName: `pendulum-${options.template}` },
    { kind: "templateOverlay", templateName: "pendulum" },
    { kind: "pendulumText", text: options.pendulumText || "" },
    { kind: "scale", text: scaleText, side: "right" },
    { kind: "scale", text: scaleText, side: "left" }
  );
};

const buildStandardCardPlan = (options: APIBody): CardRenderPlan<StandardRenderLayer> => {
  const layers: StandardRenderLayer[] = [];
  const statCount = options.disableStats ? 0 : options.level || 0;

  if (isMonsterCard(options)) {
    const monsterType = formatMonsterType(options.monsterType);

    if (options.pendulum !== false && options.template !== "link") {
      appendPendulumLayers(layers, options);
    } else if (!options.fullArt) {
      layers.push({ kind: "art" });
    }

    layers.push(
      { kind: "monsterType", text: monsterType },
      { kind: "monsterText", text: options.cardText, variant: getTextVariant(options) },
      { kind: "atk", text: options.atk as string }
    );

    if (options.template === "link") {
      appendMonsterFrameLayers(layers, options, statCount);
      layers.push(
        { kind: "name", text: options.name, overrush: options.overrushName },
        { kind: "attribute", attribute: options.attribute }
      );
    } else {
      layers.push(
        { kind: "name", text: options.name, overrush: options.overrushName },
        { kind: "attribute", attribute: options.attribute }
      );
      appendMonsterFrameLayers(layers, options, statCount);
    }
  } else {
    layers.push({ kind: "spellText", text: options.cardText });

    if (!options.fullArt) {
      layers.push({ kind: "art" });
    }

    if (options.icon === "normal") {
      layers.push({ kind: "spellTypeNormal", attribute: options.attribute });
    } else {
      layers.push({ kind: "spellType", attribute: options.attribute }, { kind: "spellIcon", icon: options.icon });
    }

    layers.push(
      { kind: "name", text: options.name, overrush: options.overrushName },
      { kind: "attribute", attribute: options.attribute }
    );
  }

  return {
    template: options.template,
    fullArt: Boolean(options.fullArt),
    layers,
  };
};

export { buildStandardCardPlan };

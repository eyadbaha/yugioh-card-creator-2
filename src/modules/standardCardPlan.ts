import type { APIBody } from "./types.js";
import {
  getTextVariant,
  isMonsterCard,
  linkArrowPositions,
  prepend,
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

const buildStandardCardPlan = (options: APIBody): CardRenderPlan<StandardRenderLayer> => {
  const layers: StandardRenderLayer[] = [];
  const statCount = options.disableStats ? 0 : options.level || 0;

  prepend(
    layers,
    { kind: "name", text: options.name, overrush: options.overrushName },
    { kind: "attribute", attribute: options.attribute }
  );

  if (isMonsterCard(options)) {
    if (options.template === "xyz") {
      appendRepeated(layers, statCount, (index) => ({ kind: "rank", index }));
      layers.push({ kind: "def", text: options.def as string });
    } else if (options.template === "link") {
      const selectedLinkArrows = new Set(options.linkArrows ?? []);

      selectedLinkArrows.forEach((arrow) => {
        if (linkArrowPositions.includes(arrow)) {
          prepend(layers, { kind: "linkArrow", arrow });
        }
      });

      prepend(layers, { kind: "linkRating", text: selectedLinkArrows.size.toString() });
    } else {
      appendRepeated(layers, statCount, (index) => ({ kind: "level", index }));
      layers.push({ kind: "def", text: options.def as string });
    }

    prepend(
      layers,
      { kind: "monsterType", text: options.monsterType as string },
      { kind: "monsterText", text: options.cardText, variant: getTextVariant(options.monsterType) },
      { kind: "atk", text: options.atk as string }
    );

    if (options.pendulum === false || options.template === "link") {
      if (!options.fullArt) {
        prepend(layers, { kind: "art" });
      }
    } else {
      const scaleText = options.scale?.toString() || "0";

      prepend(
        layers,
        { kind: "pendulumArtMask" },
        { kind: "pendulumArt" },
        { kind: "templateOverlay", templateName: `pendulum-${options.template}` },
        { kind: "templateOverlay", templateName: "pendulum" },
        { kind: "pendulumText", text: options.pendulumText || "" },
        { kind: "scale", text: scaleText, side: "right" },
        { kind: "scale", text: scaleText, side: "left" }
      );
    }
  } else {
    if (options.icon === "normal") {
      prepend(layers, { kind: "spellTypeNormal", attribute: options.attribute });
    } else {
      prepend(
        layers,
        { kind: "spellType", attribute: options.attribute },
        { kind: "spellIcon", icon: options.icon }
      );
    }

    if (!options.fullArt) {
      prepend(layers, { kind: "art" });
    }

    prepend(layers, { kind: "spellText", text: options.cardText });
  }

  return {
    template: options.template,
    fullArt: Boolean(options.fullArt),
    layers,
  };
};

export { buildStandardCardPlan };

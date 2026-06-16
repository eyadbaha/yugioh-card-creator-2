import type { APIBody } from "./types.js";
import { getTextVariant, isMonsterCard, type CardRenderPlan, type RushRenderLayer } from "./renderPlan.js";

const getRushSpellTypeParts = (monsterType: string) => {
  const icon = monsterType.toLocaleLowerCase().match(/\/([^/]+)\]$/)?.[1] || "";
  const text = monsterType.replace(/([^]]*)\]/, "$1");

  return { text, icon };
};

const appendRushTypeLayers = (layers: RushRenderLayer[], monsterType: string) => {
  if (["/equip]", "/field]"].some((suffix) => monsterType.toLocaleLowerCase().endsWith(suffix))) {
    const { text, icon } = getRushSpellTypeParts(monsterType);

    layers.push(
      { kind: "typeText", text },
      { kind: "typeIcon", icon, precedingText: text },
      { kind: "typeTextAfterIcon", text: "]", precedingText: text }
    );
    return;
  }

  layers.push({ kind: "typeText", text: monsterType });
};

const buildRushCardPlan = (options: APIBody): CardRenderPlan<RushRenderLayer> => {
  const layers: RushRenderLayer[] = [];
  const monsterType = options.monsterType ?? "";
  const showStats = !options.disableStats;

  if (!options.fullArt) {
    layers.push({ kind: "art" });
  }

  if (isMonsterCard(options)) {
    if (showStats && options.maxAtk) {
      layers.push({ kind: "maxSection" }, { kind: "maxAtk", text: options.maxAtk as string });
    }

    if (showStats) {
      layers.push(
        { kind: "statSection" },
        { kind: "levelIcon" },
        { kind: "levelText", text: `${options.level || "0"}` }
      );
    }

    layers.push({ kind: "monsterType", text: monsterType });
  } else {
    appendRushTypeLayers(layers, monsterType);
  }

  if (options.legend && showStats) {
    layers.push({ kind: "legend" });
  }

  layers.push(
    { kind: "name", text: options.name, overrush: options.overrushName },
    { kind: "attribute", attribute: options.attribute },
    { kind: "cardText", text: options.cardText, variant: getTextVariant(monsterType) }
  );

  if (isMonsterCard(options) && showStats) {
    layers.push({ kind: "atk", text: options.atk as string }, { kind: "def", text: options.def as string });
  }

  return {
    template: options.template,
    fullArt: Boolean(options.fullArt),
    layers,
  };
};

export { buildRushCardPlan };

import type { APIBody } from "./types.js";
import { getTextVariant, isMonsterCard, prepend, type CardRenderPlan, type RushRenderLayer } from "./renderPlan.js";

const getRushSpellTypeParts = (monsterType: string) => {
  const icon = monsterType.toLocaleLowerCase().match(/\/([^/]+)\]$/)?.[1] || "";
  const text = monsterType.replace(/([^]]*)\]/, "$1");

  return { text, icon };
};

const buildRushCardPlan = (options: APIBody): CardRenderPlan<RushRenderLayer> => {
  const layers: RushRenderLayer[] = [];
  const monsterType = options.monsterType ?? "";

  prepend(
    layers,
    { kind: "name", text: options.name },
    { kind: "attribute", attribute: options.attribute },
    { kind: "cardText", text: options.cardText, variant: getTextVariant(monsterType) }
  );

  if (options.legend && !options.disableStats) {
    prepend(layers, { kind: "legend" });
  }

  if (isMonsterCard(options)) {
    prepend(layers, { kind: "monsterType", text: monsterType });

    if (!options.disableStats) {
      prepend(
        layers,
        { kind: "statSection" },
        { kind: "levelIcon" },
        { kind: "levelText", text: `${options.level || "0"}` }
      );

      if (options.maxAtk) {
        prepend(layers, { kind: "maxSection" }, { kind: "maxAtk", text: options.maxAtk as string });
      }

      layers.push({ kind: "atk", text: options.atk as string }, { kind: "def", text: options.def as string });
    }
  } else if (["/equip]", "/field]"].some((suffix) => monsterType.toLocaleLowerCase().endsWith(suffix))) {
    const { text, icon } = getRushSpellTypeParts(monsterType);

    prepend(
      layers,
      { kind: "typeText", text },
      { kind: "typeIcon", icon, precedingText: text },
      { kind: "typeTextAfterIcon", text: "]", precedingText: text }
    );
  } else {
    prepend(layers, { kind: "typeText", text: monsterType });
  }

  if (!options.fullArt) {
    prepend(layers, { kind: "art" });
  }

  return {
    template: options.template,
    fullArt: Boolean(options.fullArt),
    layers,
  };
};

export { buildRushCardPlan };

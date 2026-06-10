import type { APIBody } from "./types.js";

const linkArrowPositions = [
  "Top",
  "Top-Right",
  "Right",
  "Bottom-Right",
  "Bottom",
  "Bottom-Left",
  "Left",
  "Top-Left",
] as const;

type LinkArrowPosition = (typeof linkArrowPositions)[number];
type TextVariant = "effect" | "normal" | "normalPendulum";

type CardRenderPlan<TLayer> = {
  template: APIBody["template"];
  fullArt: boolean;
  layers: TLayer[];
};

type LoadedCardArt = {
  buffer: Buffer;
  getDimensions: () => { width: number; height: number };
};

const prepend = <TLayer>(layers: TLayer[], ...newLayers: TLayer[]) => {
  layers.unshift(...newLayers);
};

type StandardRenderLayer =
  | { kind: "name"; text: string; overrush?: boolean }
  | { kind: "attribute"; attribute?: string }
  | { kind: "rank"; index: number }
  | { kind: "level"; index: number }
  | { kind: "linkArrow"; arrow: LinkArrowPosition }
  | { kind: "linkRating"; text: string }
  | { kind: "monsterType"; text: string }
  | { kind: "atk"; text: string }
  | { kind: "def"; text: string }
  | { kind: "monsterText"; text: string; variant: TextVariant }
  | { kind: "spellText"; text: string }
  | { kind: "art" }
  | { kind: "pendulumArtMask" }
  | { kind: "pendulumArt" }
  | { kind: "templateOverlay"; templateName: string }
  | { kind: "pendulumText"; text: string }
  | { kind: "scale"; text: string; side: "left" | "right" }
  | { kind: "spellTypeNormal"; attribute?: string }
  | { kind: "spellType"; attribute?: string }
  | { kind: "spellIcon"; icon?: string };

type RushRenderLayer =
  | { kind: "name"; text: string }
  | { kind: "attribute"; attribute?: string }
  | { kind: "cardText"; text: string; variant: TextVariant }
  | { kind: "legend" }
  | { kind: "monsterType"; text: string }
  | { kind: "statSection" }
  | { kind: "levelIcon" }
  | { kind: "levelText"; text: string }
  | { kind: "maxSection" }
  | { kind: "atk"; text: string }
  | { kind: "def"; text: string }
  | { kind: "maxAtk"; text: string }
  | { kind: "typeText"; text: string }
  | { kind: "typeIcon"; icon: string; precedingText: string }
  | { kind: "typeTextAfterIcon"; text: string; precedingText: string }
  | { kind: "art" };

const isMonsterCard = (options: APIBody) =>
  options.template !== "spell" && options.template !== "trap" && Boolean(options.monsterType);

const getTextVariant = (monsterType = ""): TextVariant => {
  const normalizedType = monsterType.toLocaleLowerCase();
  if (!normalizedType.includes("normal")) return "effect";
  return normalizedType.includes("pendulum") ? "normalPendulum" : "normal";
};

export {
  linkArrowPositions,
  isMonsterCard,
  getTextVariant,
  prepend,
  type CardRenderPlan,
  type LinkArrowPosition,
  type LoadedCardArt,
  type RushRenderLayer,
  type StandardRenderLayer,
  type TextVariant,
};

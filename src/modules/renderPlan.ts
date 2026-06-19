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
  | { kind: "statDivider" }
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
  | { kind: "name"; text: string; overrush?: boolean }
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
  options.template !== "spell" &&
  options.template !== "trap" &&
  (Array.isArray(options.monsterType) ? options.monsterType.length > 0 : Boolean(options.monsterType));

const formatMonsterType = (monsterType: APIBody["monsterType"] = "") =>
  Array.isArray(monsterType) ? `[${monsterType.join(" / ")}]` : monsterType;

const getTextVariant = (options: Pick<APIBody, "template" | "pendulum">): TextVariant => {
  if (options.template !== "normal") return "effect";
  return options.pendulum ? "normalPendulum" : "normal";
};

export {
  linkArrowPositions,
  isMonsterCard,
  formatMonsterType,
  getTextVariant,
  type CardRenderPlan,
  type LinkArrowPosition,
  type LoadedCardArt,
  type RushRenderLayer,
  type StandardRenderLayer,
  type TextVariant,
};

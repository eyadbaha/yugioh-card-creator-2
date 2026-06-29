import {
  afterMeasuredTextIcon,
  textInput,
  textWidthOffset,
  type RenderOverlay,
  type StyledCardRender,
} from "./cardRenderer.js";
import {
  artOverlay,
  atkOverlay,
  attributeOverlay,
  cardBaseInput,
  defOverlay,
  lowerAssetName,
  typeTextOverlay,
  type StyleAssetResolver,
} from "./styleApplierCommon.js";
import type { CardRenderPlan, LoadedCardArt, RushRenderLayer, TextVariant } from "./renderPlan.js";
import type { generateOptions, settings } from "./types.js";

const rushStyleAssetRequirements = {
  required: {
    icons: [
      "dark.png",
      "earth.png",
      "fire.png",
      "legend.png",
      "light.png",
      "lv.png",
      "max.png",
      "spell.png",
      "stat.png",
      "trap.png",
      "water.png",
      "wind.png",
    ],
    template: ["effect.png", "fusion.png", "normal.png", "spell.png", "trap.png"],
  },
  optional: {
    icons: ["divine.png", "equip.png", "field.png", "laugh.png"],
    template: ["ritual.png", "synchro.png", "xyz.png", "link.png", "token.png"],
  },
};

const requireSetting = <T>(value: T | undefined, key: string): T => {
  if (!value) {
    throw new Error(`Rush style is missing required settings section "${key}"`);
  }

  return value;
};

const getRushTextOptions = (style: settings, variant: TextVariant): generateOptions => {
  const isNormal = variant === "normal" || variant === "normalPendulum";

  return {
    ...style.text,
    fontFamily:
      variant === "normalPendulum"
        ? style.text.fontFamilyNormalPendulum || style.text.fontFamilyNormal
        : isNormal
        ? style.text.fontFamilyNormal
        : style.text.fontFamily,
    size: isNormal ? style.text.sizeNormal || 1 : style.text.size,
  };
};

const getInlineTypeOptions = (style: settings): generateOptions => ({ ...style.type, align: "left" });

const getTypeIconLeft = (style: settings, precedingText: string) =>
  textWidthOffset(precedingText, getInlineTypeOptions(style), (style.type.left || 0) + style.spellIcon.icon.width / 2);

const getTypeTextAfterIconLeft = (style: settings, precedingText: string) =>
  afterMeasuredTextIcon(
    precedingText,
    getInlineTypeOptions(style),
    style.type.left || 0,
    style.spellIcon.icon.width,
    style.type.size || 0
  );

const buildLayerOverlay = (
  layer: RushRenderLayer,
  style: settings,
  assets: StyleAssetResolver,
  art: LoadedCardArt
): RenderOverlay => {
  switch (layer.kind) {
    case "name":
      return {
        input: textInput(layer.text, { ...style.name, overrush: layer.overrush ?? style.name.overrush }),
        ...style.name,
      };
    case "attribute":
      return attributeOverlay(assets, style, layer.attribute);
    case "cardText":
      return {
        input: textInput(layer.text, getRushTextOptions(style, layer.variant)),
        top: style.text.top,
        left: style.text.left,
      };
    case "legend":
      return {
        input: assets("icons", "legend.png").buffer,
        ...style.legend,
      };
    case "monsterType":
      return typeTextOverlay(style, layer.text);
    case "typeText":
      return typeTextOverlay(style, layer.text, { align: "left" });
    case "statSection":
      return {
        input: assets("icons", "stat.png").buffer,
        ...style.statSection,
      };
    case "levelIcon":
      const level = requireSetting(style.level, "level");
      return {
        input: assets("icons", "lv.png").buffer,
        ...level,
      };
    case "levelText":
      const levelString = requireSetting(requireSetting(style.level, "level").levelString, "level.levelString");
      return {
        input: textInput(layer.text, levelString),
        ...levelString,
      };
    case "maxSection":
      return {
        input: assets("icons", "max.png").buffer,
        ...style.maxSection,
      };
    case "atk":
      return atkOverlay(style, layer.text);
    case "def":
      return defOverlay(style, layer.text);
    case "maxAtk":
      return {
        input: textInput(layer.text, style.stat),
        ...style.stat.maxAtk,
      };
    case "typeIcon":
      return {
        input: assets("icons", `${lowerAssetName(layer.icon)}.png`).buffer,
        top: style.type.top,
        left: getTypeIconLeft(style, layer.precedingText),
      };
    case "typeTextAfterIcon":
      return {
        input: textInput(layer.text, getInlineTypeOptions(style)),
        top: style.type.top,
        left: getTypeTextAfterIconLeft(style, layer.precedingText),
      };
    case "art":
      return artOverlay(style, art);
  }
};

const applyRushStyle = (
  plan: CardRenderPlan<RushRenderLayer>,
  style: settings,
  art: LoadedCardArt,
  assets: StyleAssetResolver
): StyledCardRender => ({
  base: cardBaseInput(plan, assets, art),
  overlays: plan.layers.map((layer) => buildLayerOverlay(layer, style, assets, art)),
});

export { applyRushStyle, rushStyleAssetRequirements };

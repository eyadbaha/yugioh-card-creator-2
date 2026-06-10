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

const getTypeIconLeft = (style: settings, precedingText: string) =>
  textWidthOffset(precedingText, style.type, (style.type.left || 0) + style.spellIcon.icon.width / 2);

const getTypeTextAfterIconLeft = (style: settings, precedingText: string) =>
  afterMeasuredTextIcon(
    precedingText,
    style.type,
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
        input: textInput(layer.text, { ...style.name }),
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
        input: assets("icons", "legend.png"),
        ...style.legend,
      };
    case "monsterType":
    case "typeText":
      return typeTextOverlay(style, layer.text);
    case "statSection":
      return {
        input: assets("icons", "stat.png"),
        ...style.statSection,
      };
    case "levelIcon":
      return {
        input: assets("icons", "lv.png"),
        ...style.level,
      };
    case "levelText":
      return {
        input: textInput(layer.text, style.level.levelString),
        ...style.level.levelString,
      };
    case "maxSection":
      return {
        input: assets("icons", "max.png"),
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
        input: assets("icons", `${lowerAssetName(layer.icon)}.png`),
        top: style.type.top,
        left: getTypeIconLeft(style, layer.precedingText),
      };
    case "typeTextAfterIcon":
      return {
        input: textInput(layer.text, style.type),
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

export { applyRushStyle };

import type { LoadedCardArt, StandardRenderLayer, CardRenderPlan, TextVariant } from "./renderPlan.js";
import {
  resizedImageInput,
  solidImageInput,
  textInput,
  type ImageResizeOptions,
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
import type { generateOptions, settings } from "./types.js";

const getNameTextOptions = (plan: CardRenderPlan<StandardRenderLayer>, style: settings, layer: StandardRenderLayer) => {
  const forceWhiteName = ["link", "xyz", "spell", "trap"].some((template) => `${plan.template}`.includes(template));
  const color = forceWhiteName ? "white" : style.name.color;

  return {
    ...style.name,
    color,
    overrush: layer.kind === "name" ? layer.overrush : undefined,
  };
};

const getMonsterTextOptions = (style: settings, variant: TextVariant): generateOptions => {
  if (variant === "normalPendulum") {
    return {
      ...style.text,
      fontFamily: style.text.fontFamilyNormalPendulum,
    };
  }

  if (variant === "normal") {
    return {
      ...style.text,
      fontFamily: style.text.fontFamilyNormal,
    };
  }

  return style.text;
};

const getPendulumArtResizeOptions = (style: settings, art: LoadedCardArt): ImageResizeOptions => {
  const { width, height } = art.getDimensions();
  const artRatio = height / width;

  if (artRatio < style.pendulumArt.height2 / style.pendulumArt.width) {
    return {
      width: style.pendulumArt.width,
      height: style.pendulumArt.height2,
      fit: "fill",
    };
  }

  if (artRatio < style.pendulumArt.height1 / style.pendulumArt.width) {
    return {
      width: style.pendulumArt.width,
      height: style.pendulumArt.height2,
      position: "top",
    };
  }

  if (artRatio < 1.263) {
    return {
      width: style.pendulumArt.width,
      height: style.pendulumArt.height1,
      position: "top",
    };
  }

  return {
    width: style.pendulumArt.width,
    height: style.pendulumArt.height,
    position: "top",
  };
};

const buildLayerOverlay = (
  layer: StandardRenderLayer,
  plan: CardRenderPlan<StandardRenderLayer>,
  style: settings,
  assets: StyleAssetResolver,
  art: LoadedCardArt
): RenderOverlay => {
  switch (layer.kind) {
    case "name":
      return {
        input: textInput(layer.text, getNameTextOptions(plan, style, layer)),
        ...style.name,
      };
    case "attribute":
      return attributeOverlay(assets, style, layer.attribute);
    case "rank":
      return {
        input: assets("icons", "r.png"),
        left: (style.rank.left as number) + (style.level.width + (style.level.spacing as number)) * layer.index,
        top: style.level.top,
      };
    case "level":
      return {
        input: assets("icons", "lv.png"),
        left: (style.level.left as number) - (style.level.width + (style.level.spacing as number)) * layer.index,
        top: style.level.top,
      };
    case "linkArrow":
      return {
        input: assets("icons", `${layer.arrow.toLocaleLowerCase()}.png`),
        ...style.linkArrows[layer.arrow],
      };
    case "linkRating":
      return {
        input: textInput(layer.text, style.linkRating),
        ...style.linkRating,
      };
    case "monsterType":
      return typeTextOverlay(style, layer.text);
    case "atk":
      return atkOverlay(style, layer.text);
    case "def":
      return defOverlay(style, layer.text);
    case "monsterText":
      return {
        input: textInput(layer.text, getMonsterTextOptions(style, layer.variant)),
        top: style.text.top,
        left: style.text.left,
      };
    case "spellText":
      return {
        input: textInput(layer.text, style.textSpell),
        ...style.textSpell,
      };
    case "art":
      return artOverlay(style, art);
    case "pendulumArtMask":
      return {
        input: solidImageInput(
          style.pendulumArt.width,
          style.pendulumArt.height,
          4,
          { r: 255, g: 255, b: 255, alpha: 1 },
          "jpeg"
        ),
        ...style.pendulumArt,
      };
    case "pendulumArt":
      return {
        input: resizedImageInput(art.buffer, getPendulumArtResizeOptions(style, art)),
        ...style.pendulumArt,
      };
    case "templateOverlay":
      return {
        input: assets("template", `${layer.templateName}.png`),
      };
    case "pendulumText":
      return {
        input: textInput(layer.text, style.pendulumText),
        ...style.pendulumText,
      };
    case "scale":
      return {
        input: textInput(layer.text, style.scale),
        ...(layer.side === "left" ? style.scale.leftScale : style.scale.rightScale),
      };
    case "spellTypeNormal":
      return {
        input: assets("icons", `${lowerAssetName(layer.attribute)}-normal.png`),
        ...style.spellIcon.text,
      };
    case "spellType":
      return {
        input: assets("icons", `${lowerAssetName(layer.attribute)}-icon.png`),
        ...style.spellIcon.text,
      };
    case "spellIcon":
      return {
        input: assets("icons", `${lowerAssetName(layer.icon)}.png`),
        ...style.spellIcon.icon,
      };
  }
};

const applyStandardStyle = (
  plan: CardRenderPlan<StandardRenderLayer>,
  style: settings,
  art: LoadedCardArt,
  assets: StyleAssetResolver
): StyledCardRender => ({
  base: cardBaseInput(plan, assets, art),
  overlays: plan.layers.map((layer) => buildLayerOverlay(layer, plan, style, assets, art)),
});

export { applyStandardStyle };

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
  atkOverlays,
  attributeOverlay,
  cardBaseInput,
  defOverlays,
  lowerAssetName,
  statDividerOverlay,
  typeTextOverlay,
  type StyleAssetResolver,
} from "./styleApplierCommon.js";
import type { generateOptions, settings } from "./types.js";

const standardStyleAssetRequirements = {
  required: {
    icons: [
      "dark.png",
      "divine.png",
      "earth.png",
      "fire.png",
      "laugh.png",
      "light.png",
      "lv.png",
      "r.png",
      "spell-icon.png",
      "spell-normal.png",
      "spell.png",
      "trap-icon.png",
      "trap-normal.png",
      "trap.png",
      "water.png",
      "wind.png",
      "bottom-left.png",
      "bottom-right.png",
      "bottom.png",
      "left.png",
      "right.png",
      "top-left.png",
      "top-right.png",
      "top.png",
    ],
    template: [
      "effect.png",
      "fusion.png",
      "link.png",
      "normal.png",
      "ritual.png",
      "spell.png",
      "synchro.png",
      "token.png",
      "trap.png",
      "xyz.png",
    ],
  },
  optional: {
    icons: ["continuous.png", "counter.png", "equip.png", "field.png", "quick-play.png", "ritual.png"],
    template: [
      "pendulum.png",
      "pendulum-effect.png",
      "pendulum-fusion.png",
      "pendulum-normal.png",
      "pendulum-ritual.png",
      "pendulum-synchro.png",
      "pendulum-xyz.png",
    ],
  },
};

const requireSetting = <T>(value: T | undefined, key: string): T => {
  if (!value) {
    throw new Error(`Standard style is missing required settings section "${key}"`);
  }

  return value;
};

const getNameTextOptions = (
  plan: CardRenderPlan<StandardRenderLayer>,
  style: settings,
  layer: Extract<StandardRenderLayer, { kind: "name" }>
) => {
  const forceWhiteName = ["link", "xyz", "spell", "trap"].some((template) => `${plan.template}`.includes(template));
  const color = forceWhiteName ? "white" : style.name.color;

  return {
    ...style.name,
    color,
    overrush: layer.overrush ?? style.name.overrush,
  };
};

const getMonsterTextOptions = (style: settings, variant: TextVariant): generateOptions => {
  if (variant === "normalPendulum") {
    return {
      ...style.text,
      fontFamily: style.text.fontFamilyNormalPendulum || style.text.fontFamilyNormal,
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
  const pendulumArt = requireSetting(style.pendulumArt, "pendulumArt");
  const { width, height } = art.getDimensions();
  const artRatio = height / width;

  if (artRatio < pendulumArt.height2 / pendulumArt.width) {
    return {
      width: pendulumArt.width,
      height: pendulumArt.height2,
      fit: "fill",
    };
  }

  if (artRatio < pendulumArt.height1 / pendulumArt.width) {
    return {
      width: pendulumArt.width,
      height: pendulumArt.height2,
      position: "top",
    };
  }

  if (artRatio < 1.263) {
    return {
      width: pendulumArt.width,
      height: pendulumArt.height1,
      position: "top",
    };
  }

  return {
    width: pendulumArt.width,
    height: pendulumArt.height,
    position: "top",
  };
};

const buildLayerOverlay = (
  layer: StandardRenderLayer,
  plan: CardRenderPlan<StandardRenderLayer>,
  style: settings,
  assets: StyleAssetResolver,
  art: LoadedCardArt
): RenderOverlay | RenderOverlay[] | undefined => {
  switch (layer.kind) {
    case "name":
      return {
        input: textInput(layer.text, getNameTextOptions(plan, style, layer)),
        ...style.name,
      };
    case "attribute":
      return attributeOverlay(assets, style, layer.attribute);
    case "rank":
      const rank = requireSetting(style.rank, "rank");
      const rankLevel = requireSetting(style.level, "level");
      return {
        input: assets("icons", "r.png").buffer,
        left: (rank.left as number) + (rankLevel.width + (rankLevel.spacing as number)) * layer.index,
        top: rankLevel.top,
      };
    case "level":
      const level = requireSetting(style.level, "level");
      return {
        input: assets("icons", "lv.png").buffer,
        left: (level.left as number) - (level.width + (level.spacing as number)) * layer.index,
        top: level.top,
      };
    case "linkArrow":
      const linkArrows = requireSetting(style.linkArrows, "linkArrows");
      return {
        input: assets("icons", `${layer.arrow.toLocaleLowerCase()}.png`).buffer,
        ...linkArrows[layer.arrow],
      };
    case "linkRating":
      const linkRating = requireSetting(style.linkRating, "linkRating");
      return {
        input: textInput(layer.text, linkRating),
        ...linkRating,
      };
    case "monsterType":
      return typeTextOverlay(style, layer.text);
    case "atk":
      return atkOverlays(style, layer.text);
    case "def":
      return defOverlays(style, layer.text);
    case "statDivider":
      return statDividerOverlay(style);
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
      const pendulumArtMask = requireSetting(style.pendulumArt, "pendulumArt");
      return {
        input: solidImageInput(
          pendulumArtMask.width,
          pendulumArtMask.height,
          4,
          { r: 255, g: 255, b: 255, alpha: 1 },
          "jpeg"
        ),
        ...pendulumArtMask,
      };
    case "pendulumArt":
      const pendulumArt = requireSetting(style.pendulumArt, "pendulumArt");
      return {
        input: resizedImageInput(art.buffer, getPendulumArtResizeOptions(style, art)),
        ...pendulumArt,
      };
    case "templateOverlay":
      return {
        input: assets("template", `${layer.templateName}.png`).buffer,
      };
    case "pendulumText":
      const pendulumText = requireSetting(style.pendulumText, "pendulumText");
      return {
        input: textInput(layer.text, pendulumText),
        ...pendulumText,
      };
    case "scale":
      const scale = requireSetting(style.scale, "scale");
      return {
        input: textInput(layer.text, scale),
        ...(layer.side === "left" ? scale.leftScale : scale.rightScale),
      };
    case "spellTypeNormal":
      return {
        input: assets("icons", `${lowerAssetName(layer.attribute)}-normal.png`).buffer,
        ...style.spellIcon.text,
      };
    case "spellType":
      return {
        input: assets("icons", `${lowerAssetName(layer.attribute)}-icon.png`).buffer,
        ...style.spellIcon.text,
      };
    case "spellIcon":
      return {
        input: assets("icons", `${lowerAssetName(layer.icon)}.png`).buffer,
        ...style.spellIcon.icon,
      };
  }
};

const flattenRenderOverlay = (overlays: Array<RenderOverlay | RenderOverlay[] | undefined>): RenderOverlay[] =>
  overlays.flatMap((overlay) => {
    if (!overlay) return [];
    return Array.isArray(overlay) ? overlay : [overlay];
  });

const applyStandardStyle = (
  plan: CardRenderPlan<StandardRenderLayer>,
  style: settings,
  art: LoadedCardArt,
  assets: StyleAssetResolver
): StyledCardRender => ({
  base: cardBaseInput(plan, assets, art),
  overlays: flattenRenderOverlay(plan.layers.map((layer) => buildLayerOverlay(layer, plan, style, assets, art))),
});

export { applyStandardStyle, standardStyleAssetRequirements };

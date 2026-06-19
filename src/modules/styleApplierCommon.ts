import {
  imageSizedToInput,
  resizedImageInput,
  solidImageInput,
  textInput,
  type RenderOverlay,
  type RenderSource,
} from "./cardRenderer.js";
import type { CardRenderPlan, LoadedCardArt } from "./renderPlan.js";
import type { LoadedStyle, LoadedStyleAsset } from "./styleRegistry.js";
import type { generateOptions, settings } from "./types.js";

type StyleAssetResolver = (area: "icons" | "template", fileName: string) => LoadedStyleAsset;

const createStyleAssetResolver =
  (style: LoadedStyle): StyleAssetResolver =>
  (area, fileName) => {
    const asset = style.assets[area].get(fileName);
    if (!asset) {
      throw new Error(`Missing ${area} asset "${fileName}" for style "${style.section}/${style.name}"`);
    }

    return asset;
  };

const lowerAssetName = (value?: string) => value?.toLocaleLowerCase();

const positionedTextOverlay = (
  text: string,
  textOptions: generateOptions,
  position: { left?: number; top?: number }
): RenderOverlay => ({
  input: textInput(text, textOptions),
  ...position,
});

const attributeOverlay = (assets: StyleAssetResolver, style: settings, attribute?: string): RenderOverlay => ({
  input: assets("icons", `${lowerAssetName(attribute)}.png`).buffer,
  ...style.attribute,
});

const typeTextOverlay = (style: settings, text: string): RenderOverlay =>
  positionedTextOverlay(text, style.type, { top: style.type.top, left: style.type.left });

const atkOverlay = (style: settings, text: string): RenderOverlay =>
  positionedTextOverlay(`${style.statLabels?.atk ?? ""}${text}`, style.stat, {
    top: style.stat.atk.top,
    left: style.stat.atk.left,
  });

const defOverlay = (style: settings, text: string): RenderOverlay =>
  positionedTextOverlay(`${style.statLabels?.def ?? ""}${text}`, style.stat, style.stat.def);

const parseHexColor = (color: string): { r: number; g: number; b: number } | undefined => {
  const normalized = color.trim();
  const hex =
    normalized.length === 4 && normalized.startsWith("#")
      ? normalized
          .slice(1)
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : normalized.length === 7 && normalized.startsWith("#")
        ? normalized.slice(1)
        : "";

  if (!/^[0-9a-f]{6}$/i.test(hex)) return undefined;

  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
};

const getSolidColor = (color: string, opacity: number | undefined) => {
  if (opacity === undefined || opacity >= 1) return color;
  if (color.toLowerCase() === "black") return { r: 0, g: 0, b: 0, alpha: opacity };
  if (color.toLowerCase() === "white") return { r: 255, g: 255, b: 255, alpha: opacity };

  const rgb = parseHexColor(color);
  return rgb ? { ...rgb, alpha: opacity } : color;
};

const statDividerOverlay = (style: settings): RenderOverlay | undefined => {
  const divider = style.statDivider;
  if (!divider) return undefined;

  return {
    input: solidImageInput(
      Math.max(1, Math.round(divider.width)),
      Math.max(1, Math.round(divider.height)),
      4,
      getSolidColor(divider.color, divider.opacity),
      "png"
    ),
    left: divider.left,
    top: divider.top,
  };
};

const artOverlay = (style: settings, art: LoadedCardArt): RenderOverlay => ({
  input: resizedImageInput(art.buffer, { width: style.art.width, height: style.art.height }),
  top: style.art.top,
  left: style.art.left,
  blend: "dest-over",
});

const cardBaseInput = <TLayer>(
  plan: CardRenderPlan<TLayer>,
  assets: StyleAssetResolver,
  art: LoadedCardArt
): RenderSource => {
  const template = assets("template", `${plan.template}.png`);

  return plan.fullArt ? imageSizedToInput(art.buffer, template.dimensions, "png") : template.buffer;
};

export {
  artOverlay,
  atkOverlay,
  attributeOverlay,
  cardBaseInput,
  createStyleAssetResolver,
  defOverlay,
  lowerAssetName,
  positionedTextOverlay,
  statDividerOverlay,
  typeTextOverlay,
  type StyleAssetResolver,
};

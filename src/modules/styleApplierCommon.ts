import {
  imageSizedToInput,
  resizedImageInput,
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
  positionedTextOverlay(text, style.stat, { top: style.stat.atk.top, left: style.stat.atk.left });

const defOverlay = (style: settings, text: string): RenderOverlay =>
  positionedTextOverlay(text, style.stat, style.stat.def);

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
  typeTextOverlay,
  type StyleAssetResolver,
};

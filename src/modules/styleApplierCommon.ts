import {
  imageSizedToInput,
  resizedImageInput,
  textInput,
  type RenderOverlay,
  type RenderSource,
} from "./cardRenderer.js";
import path from "path";
import type { CardRenderPlan, LoadedCardArt } from "./renderPlan.js";
import type { LoadedStyle } from "./styleRegistry.js";
import type { settings } from "./types.js";

type StyleAssetResolver = (area: "icons" | "template", fileName: string) => string;

const createStyleAssetResolver =
  (style: LoadedStyle): StyleAssetResolver =>
  (area, fileName) => {
    if (!style.assets[area].has(fileName)) {
      throw new Error(`Missing ${area} asset "${fileName}" for style "${style.type}/${style.name}"`);
    }

    return path.join(style.directory, area, fileName);
  };

const lowerAssetName = (value?: string) => value?.toLocaleLowerCase();

const attributeOverlay = (assets: StyleAssetResolver, style: settings, attribute?: string): RenderOverlay => ({
  input: assets("icons", `${lowerAssetName(attribute)}.png`),
  ...style.attribute,
});

const typeTextOverlay = (style: settings, text: string): RenderOverlay => ({
  input: textInput(text, style.type),
  top: style.type.top,
  left: style.type.left,
});

const atkOverlay = (style: settings, text: string): RenderOverlay => ({
  input: textInput(text, style.stat),
  top: style.stat.atk.top,
  left: style.stat.atk.left,
});

const defOverlay = (style: settings, text: string): RenderOverlay => ({
  input: textInput(text, style.stat),
  ...style.stat.def,
});

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
  const templatePath = assets("template", `${plan.template}.png`);

  return plan.fullArt ? imageSizedToInput(art.buffer, templatePath, "png") : templatePath;
};

export {
  artOverlay,
  atkOverlay,
  attributeOverlay,
  cardBaseInput,
  createStyleAssetResolver,
  defOverlay,
  lowerAssetName,
  typeTextOverlay,
  type StyleAssetResolver,
};

import {
  imageSizedToInput,
  resizedImageInput,
  textInput,
  type RenderOverlay,
  type RenderSource,
} from "./cardRenderer.js";
import type { CardRenderPlan, LoadedCardArt } from "./renderPlan.js";
import type { settings } from "./types.js";

type CardKind = "standard" | "rush";
type StyleAssetResolver = (area: "icons" | "template", fileName: string) => string;

const createStyleAssetResolver =
  (assetsDir: string, kind: CardKind, styleName: string): StyleAssetResolver =>
  (area, fileName) =>
    `${assetsDir}/${kind}/${styleName}/${area}/${fileName}`;

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
  type CardKind,
  type StyleAssetResolver,
};

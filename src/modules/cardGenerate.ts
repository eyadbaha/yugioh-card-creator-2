import { loadCardArt } from "./cardArt.js";
import { renderCardImage } from "./cardRenderer.js";
import { buildStandardCardPlan } from "./standardCardPlan.js";
import { applyStandardStyle } from "./standardStyleApplier.js";
import { createStyleAssetResolver } from "./styleApplierCommon.js";
import type { LoadedStyle } from "./styleRegistry.js";
import type { APIBody } from "./types.js";

const cardGenerate = async (options: APIBody, stylePack: LoadedStyle) => {
  const style = stylePack.settings;
  const assets = createStyleAssetResolver(stylePack);
  const art = await loadCardArt(options.art);
  const plan = buildStandardCardPlan(options);
  const styledCard = applyStandardStyle(plan, style, art, assets);

  return renderCardImage(styledCard);
};

export { cardGenerate };

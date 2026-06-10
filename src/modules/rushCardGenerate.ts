import { loadCardArt } from "./cardArt.js";
import { renderCardImage } from "./cardRenderer.js";
import { buildRushCardPlan } from "./rushCardPlan.js";
import { applyRushStyle } from "./rushStyleApplier.js";
import { createStyleAssetResolver } from "./styleApplierCommon.js";
import type { LoadedStyle } from "./styleRegistry.js";
import type { APIBody } from "./types.js";

const rushCardGenerate = async (options: APIBody, stylePack: LoadedStyle) => {
  const style = stylePack.settings;
  const assets = createStyleAssetResolver(stylePack);
  const art = await loadCardArt(options.art);
  const plan = buildRushCardPlan(options);
  const styledCard = applyRushStyle(plan, style, art, assets);

  return renderCardImage(styledCard);
};

export { rushCardGenerate };

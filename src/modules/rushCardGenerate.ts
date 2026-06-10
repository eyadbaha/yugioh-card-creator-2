import { loadCardArt } from "./cardArt.js";
import { renderCardImage } from "./cardRenderer.js";
import { buildRushCardPlan } from "./rushCardPlan.js";
import { applyRushStyle } from "./rushStyleApplier.js";
import { createStyleAssetResolver } from "./styleApplierCommon.js";
import type { APIBody, settings } from "./types.js";

const rushCardGenerate = async (options: APIBody, importedStyle: settings) => {
  const assetsDir = process.env.ASSETS_DIR || `./assets`;
  const styleName = importedStyle.styleName || options.style;
  const style = { ...importedStyle, styleName };
  const assets = createStyleAssetResolver(assetsDir, "rush", styleName);
  const art = await loadCardArt(options.art);
  const plan = buildRushCardPlan(options);
  const styledCard = applyRushStyle(plan, style, art, assets);

  return renderCardImage(styledCard);
};

export { rushCardGenerate };

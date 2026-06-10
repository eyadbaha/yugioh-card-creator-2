import { loadCardArt } from "./cardArt.js";
import { renderCardImage } from "./cardRenderer.js";
import { buildStandardCardPlan } from "./standardCardPlan.js";
import { applyStandardStyle } from "./standardStyleApplier.js";
import { createStyleAssetResolver } from "./styleApplierCommon.js";
import type { APIBody, settings } from "./types.js";

const cardGenerate = async (options: APIBody, importedStyle: settings) => {
  const assetsDir = process.env.ASSETS_DIR || `./assets`;
  const styleName = importedStyle.styleName || options.style;
  const style = { ...importedStyle, styleName };
  const assets = createStyleAssetResolver(assetsDir, "standard", styleName);
  const art = await loadCardArt(options.art);
  const plan = buildStandardCardPlan(options);
  const styledCard = applyStandardStyle(plan, style, art, assets);

  return renderCardImage(styledCard);
};

export { cardGenerate };

import { loadCardArt } from "./cardArt.js";
import { renderCardImage, type StyledCardRender } from "./cardRenderer.js";
import type { CardRenderPlan, LoadedCardArt } from "./renderPlan.js";
import { buildRushCardPlan } from "./rushCardPlan.js";
import { applyRushStyle } from "./rushStyleApplier.js";
import { buildStandardCardPlan } from "./standardCardPlan.js";
import { applyStandardStyle } from "./standardStyleApplier.js";
import { createStyleAssetResolver, type StyleAssetResolver } from "./styleApplierCommon.js";
import type { LoadedStyle } from "./styleRegistry.js";
import type { APIBody, settings } from "./types.js";

type CardPlanBuilder<TLayer> = (options: APIBody) => CardRenderPlan<TLayer>;
type StyleApplier<TLayer> = (
  plan: CardRenderPlan<TLayer>,
  style: settings,
  art: LoadedCardArt,
  assets: StyleAssetResolver
) => StyledCardRender;

const createCardGenerator =
  <TLayer>(buildPlan: CardPlanBuilder<TLayer>, applyStyle: StyleApplier<TLayer>) =>
  async (options: APIBody, stylePack: LoadedStyle) => {
    const style = stylePack.settings;
    const assets = createStyleAssetResolver(stylePack);
    const art = await loadCardArt(options.art);
    const plan = buildPlan(options);
    const styledCard = applyStyle(plan, style, art, assets);

    return renderCardImage(styledCard, stylePack.renderContext);
  };

const cardGenerate = createCardGenerator(buildStandardCardPlan, applyStandardStyle);
const rushCardGenerate = createCardGenerator(buildRushCardPlan, applyRushStyle);

export { cardGenerate, createCardGenerator, rushCardGenerate };

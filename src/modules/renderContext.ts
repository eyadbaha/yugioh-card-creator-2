import type * as fontkit from "fontkit";

type FontMetrics = Record<string, fontkit.Font>;

type GeneralRenderAssets = {
  overRushCoverDataUri: string;
};

type RenderContext = {
  fontMetrics: FontMetrics;
  generalAssets: GeneralRenderAssets;
};

const requireFont = (context: RenderContext, fontFamily: string) => {
  const fontInstance = context.fontMetrics[fontFamily];
  if (!fontInstance) {
    throw new Error(`Missing loaded font metrics for "${fontFamily}"`);
  }

  return fontInstance;
};

export { requireFont, type FontMetrics, type GeneralRenderAssets, type RenderContext };

import * as fontkit from "fontkit";
import fs from "fs";
import path from "path";
import type { FontMetrics } from "./renderContext.js";

const isFontFile = (filePath: string) => /\.(otf|ttf)$/i.test(filePath);

const collectFontFiles = (sourcePath: string): string[] => {
  if (!fs.existsSync(sourcePath)) return [];

  const stats = fs.statSync(sourcePath);
  if (stats.isFile()) return isFontFile(sourcePath) ? [sourcePath] : [];
  if (!stats.isDirectory()) return [];

  return fs
    .readdirSync(sourcePath)
    .map((file) => path.join(sourcePath, file))
    .filter(isFontFile);
};

const loadFontMetrics = (fontSources: string[]): FontMetrics => {
  const fontMetrics: FontMetrics = {};

  for (const fontFile of fontSources.flatMap(collectFontFiles)) {
    const fontName = path.basename(fontFile).replace(/\.(otf|ttf)$/i, "");
    fontMetrics[fontName] = fontkit.openSync(fontFile) as fontkit.Font;
  }

  return fontMetrics;
};

export { collectFontFiles, loadFontMetrics };

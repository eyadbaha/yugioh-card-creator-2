import * as fontkit from "fontkit";
import fs from "fs";
import path from "path";

const getFontMetrics = () => {
  if (global.fontMetrics) return global.fontMetrics;
  const fontsPath = path.join(process.env.STYLES_DIR || "./styles", "general", "fonts");
  const fontMetrics: Record<string, ReturnType<typeof fontkit.openSync>> = {};
  fs.readdirSync(fontsPath).forEach((file) => {
    if (file.endsWith(".ttf") || file.endsWith(".otf")) {
      const fontInstance = fontkit.openSync(path.join(fontsPath, file));
      const fontName = file.replace(/.ttf/g, "").replace(/.otf/g, "");
      fontMetrics[fontName] = fontInstance;
    }
  });
  global.fontMetrics = fontMetrics;
};

export { getFontMetrics };

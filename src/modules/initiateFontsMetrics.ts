import * as fontkit from "fontkit";
import fs from "fs";

const getFontMetrics = () => {
  if (global.fontMetrics) return global.fontMetrics;
  const fontsPath = `${process.env.ASSETS_DIR || "./assets"}/fonts`;
  fs.readdirSync(fontsPath).forEach((file) => {
    if (file.endsWith(".ttf") || file.endsWith(".otf")) {
      const fontInstance = fontkit.openSync(`${process.env.ASSETS_DIR || "./assets"}/fonts/${file}`);
      console.log(fontInstance);
    }
  });
};

export { getFontMetrics };

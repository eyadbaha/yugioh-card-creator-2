import fs from "fs";
import sharp from "sharp";

const preloadImages = async (dir: string) => {
  const files = fs.readdirSync(dir);

  const result: any = {};

  for (const file of files) {
    const filePath = `${dir}/${file}`;
    const stats = fs.statSync(filePath);

    if (stats.isDirectory()) {
      result[file] = await preloadImages(filePath);
    } else if (filePath.endsWith(".png")) {
      result[file.replace(".png", "")] = await sharp(filePath);
    }
  }

  return result;
};

const getAsstes = async () => {
  if (!global.assets) global.assets = await preloadImages("./assets");
  return global.assets;
};

export { getAsstes };

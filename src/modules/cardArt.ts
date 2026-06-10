import axios from "axios";
import { imageSize as sizeOf } from "image-size";
import { z } from "zod";
import type { LoadedCardArt } from "./renderPlan.js";

const loadCardArt = async (art: string): Promise<LoadedCardArt> => {
  const buffer = z.string().url().safeParse(art).success
    ? ((await axios({ url: art, responseType: "arraybuffer" })).data as Buffer)
    : Buffer.from(art, "base64");
  let dimensions: { width: number; height: number } | undefined;

  return {
    buffer,
    getDimensions: () => {
      if (!dimensions) {
        const metadata = sizeOf(buffer);
        dimensions = { width: metadata.width as number, height: metadata.height as number };
      }

      return dimensions;
    },
  };
};

export { loadCardArt };

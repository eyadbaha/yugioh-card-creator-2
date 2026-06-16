import axios from "axios";
import { imageSize as sizeOf } from "image-size";
import { z } from "zod";
import type { LoadedCardArt } from "./renderPlan.js";

const maxArtBytes = 15 * 1024 * 1024;
const artFetchTimeoutMs = 10_000;

class CardArtLoadError extends Error {
  constructor(message = "art could not be loaded") {
    super(message);
    this.name = "CardArtLoadError";
  }
}

const loadCardArt = async (art: string): Promise<LoadedCardArt> => {
  let buffer: Buffer;
  try {
    buffer = z.string().url().safeParse(art).success
      ? Buffer.from(
          (
            await axios({
              url: art,
              responseType: "arraybuffer",
              timeout: artFetchTimeoutMs,
              maxContentLength: maxArtBytes,
              maxBodyLength: maxArtBytes,
            })
          ).data as ArrayBuffer
        )
      : Buffer.from(art, "base64");
  } catch (error) {
    throw new CardArtLoadError((error as Error).message);
  }

  if (buffer.length > maxArtBytes) {
    throw new CardArtLoadError(`art is larger than ${maxArtBytes} bytes`);
  }

  let dimensions: { width: number; height: number };
  try {
    const metadata = sizeOf(buffer);
    dimensions = { width: metadata.width as number, height: metadata.height as number };
  } catch {
    throw new CardArtLoadError();
  }

  return {
    buffer,
    getDimensions: () => dimensions,
  };
};

export { CardArtLoadError, loadCardArt };

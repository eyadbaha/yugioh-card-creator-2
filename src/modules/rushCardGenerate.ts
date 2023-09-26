import { textGenerate } from "./textGenerate.js";
import sharp from "sharp";
import type { APIBody, linkArrows, settings } from "./types.js";
import { z } from "zod";
import axios from "axios";

interface OverlayOptionsPromises extends Omit<sharp.OverlayOptions, "input"> {
  input: Promise<Buffer> | string;
}

const rushCardGenerate = async (options: APIBody, importedStyle: settings) => {
  const assetsDir = process.env.ASSETS_DIR || `./assets`;
  let artBuffer: Buffer = Buffer.from("");
  if (z.string().url().safeParse(options.art).success) {
    artBuffer = (await axios({ url: options.art, responseType: "arraybuffer" })).data as Buffer;
  } else {
    artBuffer = Buffer.from(options.art, "base64");
  }
  const OverlayOptions: OverlayOptionsPromises[] = [];
  const card = sharp(`${assetsDir}/rush/${importedStyle.styleName}/template/${options.template}.png`);
  //Name, Attribute overlay
  OverlayOptions.unshift(
    { input: textGenerate(options.name, { ...importedStyle.name }), ...importedStyle.name },
    {
      input: `${assetsDir}/rush/${importedStyle.styleName}/icons/${options.attribute?.toLocaleLowerCase()}.png`,
      ...importedStyle.attribute,
    },
    {
      input: textGenerate(options.cardText, {
        ...importedStyle.text,
        fontFamily: options.monsterType.toLocaleLowerCase()?.includes("normal")
          ? options.monsterType.toLocaleLowerCase()?.includes("pendulum")
            ? importedStyle.text.fontFamilyNormalPendulum
            : importedStyle.text.fontFamilyNormal
          : importedStyle.text.fontFamily,
      }),
      top: importedStyle.text.top,
      left: importedStyle.text.left,
    },
    {
      input: textGenerate(options.monsterType, importedStyle.type),
      top: importedStyle.type.top,
      left: importedStyle.type.left,
    }
  );
  if (options.template != "spell" && options.template != "trap" && options.monsterType) {
    //Card is a Monster

    //Overlay Monster  type text, Attack, Description
    const [monsterType, atk] = [
      textGenerate(options.monsterType, importedStyle.type),
      textGenerate(options.atk as string, importedStyle.stat),
    ];
    OverlayOptions.unshift(
      { input: `${assetsDir}/rush/${importedStyle.styleName}/icons/stat.png`, ...importedStyle.statSection },
      { input: `${assetsDir}/rush/${importedStyle.styleName}/icons/lv.png`, ...importedStyle.level },
      {
        input: textGenerate(`${options.level || "0"}`, importedStyle.level.levelString),
        ...importedStyle.level.levelString,
      }
    );
    if (options.maxAtk) {
      //Overlay Maximum Section
      OverlayOptions.unshift(
        {
          input: `${assetsDir}/rush/${importedStyle.styleName}/icons/max.png`,
          ...importedStyle.maxSection,
        },
        {
          input: textGenerate(options.maxAtk as string, importedStyle.stat),
          ...importedStyle.stat.maxAtk,
        }
      );
    }
    //Overlay Defence, Level, Stats Section
    OverlayOptions.push(
      { input: atk, top: importedStyle.stat.atk.top, left: importedStyle.stat.atk.left },
      {
        input: textGenerate(options.def as string, importedStyle.stat),
        ...importedStyle.stat.def,
      }
    );
  } //Overlay Art
  const art = sharp(artBuffer).resize(importedStyle.art.width, importedStyle.art.height).toBuffer();
  OverlayOptions.unshift({
    input: art,
    top: importedStyle.art.top,
    left: importedStyle.art.left,
    blend: "dest-over",
  });
  const ResolvedOverlayOptionsinput: (Buffer | string)[] = await Promise.all(
    OverlayOptions.map((option) => {
      return option.input;
    })
  );
  const ResolvedOverlayOptions: sharp.OverlayOptions[] = OverlayOptions.map((element, index) => {
    return { ...element, input: ResolvedOverlayOptionsinput[index] };
  });
  card.composite(ResolvedOverlayOptions);
  const imgBuffer = await card.webp({ quality: 100 }).toBuffer();
  return imgBuffer;
};

export { rushCardGenerate };

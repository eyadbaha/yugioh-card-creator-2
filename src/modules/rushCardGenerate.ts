import { textGenerate } from "./textGenerate.js";
import sharp from "sharp";
import type { APIBody, settings } from "./types.js";
import { z } from "zod";
import axios from "axios";
import { getTxtWidth } from "./textSizeCalculate.js";

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
  const monsterType = options.monsterType ?? "";
  const OverlayOptions: OverlayOptionsPromises[] = [];
  const templatePath = `${assetsDir}/rush/${importedStyle.styleName}/template/${options.template}.png`;
  const cardSize = options.fullArt
    ? ((m) => ({ width: m.width as number, height: m.height as number }))(await sharp(templatePath).metadata())
    : { width: 0, height: 0 };
  const card = options.fullArt
    ? sharp(await sharp(artBuffer).resize(cardSize.width, cardSize.height).png().toBuffer())
    : sharp(templatePath);
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
        fontFamily: monsterType.toLocaleLowerCase().includes("normal")
          ? monsterType.toLocaleLowerCase().includes("pendulum")
            ? importedStyle.text.fontFamilyNormalPendulum
            : importedStyle.text.fontFamilyNormal
          : importedStyle.text.fontFamily,
        size: monsterType.toLocaleLowerCase().includes("normal") ? importedStyle.text.sizeNormal || 1 : importedStyle.text.size,
      }),
      top: importedStyle.text.top,
      left: importedStyle.text.left,
    }
  );
  if (options.legend && !options.disableStats) {
    OverlayOptions.unshift({
      input: `${assetsDir}/rush/${importedStyle.styleName}/icons/legend.png`,
      ...importedStyle.legend,
    });
  }
  if (options.template != "spell" && options.template != "trap" && monsterType) {
    //Card is a Monster

    //Overlay Monster  type text, Attack, Description
    const atk = textGenerate(options.atk as string, { ...importedStyle.stat });
    OverlayOptions.unshift({
      input: textGenerate(monsterType, importedStyle.type),
      top: importedStyle.type.top,
      left: importedStyle.type.left,
    });
    if (!options.disableStats) {
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
    }
  } else {
    //Card is Spell/Trap
    if (["/equip]", "/field]"].some((e) => monsterType.toLocaleLowerCase().endsWith(e))) {
      const type = monsterType.replace(/([^]]*)\]/, "$1");
      const width = getTxtWidth(type, importedStyle.type);
      const icon = monsterType.toLocaleLowerCase().match(/\/([^/]+)\]$/)?.[1] || "";
      const typeLeft = importedStyle.type.left || 0;
      const typeSize = importedStyle.type.size || 0;
      const iconPosition = {
        top: importedStyle.type.top,
        left: Math.ceil(typeLeft + width + importedStyle.spellIcon.icon.width / 2),
      };
      const lastPosition = {
        top: importedStyle.type.top,
        left: Math.ceil(iconPosition.left + importedStyle.spellIcon.icon.width + typeSize * 0.1),
      };
      OverlayOptions.unshift(
        {
          input: textGenerate(type, importedStyle.type),
          top: importedStyle.type.top,
          left: importedStyle.type.left,
        },
        {
          input: `${assetsDir}/rush/${importedStyle.styleName}/icons/${icon}.png`,
          ...iconPosition,
        },
        {
          input: textGenerate("]", importedStyle.type),
          ...lastPosition,
        }
      );
    } else {
      OverlayOptions.unshift({
        input: textGenerate(monsterType, importedStyle.type),
        top: importedStyle.type.top,
        left: importedStyle.type.left,
      });
    }
  } //Overlay Art
  if (!options.fullArt) {
    const art = sharp(artBuffer).resize(importedStyle.art.width, importedStyle.art.height).toBuffer();
    OverlayOptions.unshift({
      input: art,
      top: importedStyle.art.top,
      left: importedStyle.art.left,
      blend: "dest-over",
    });
  }
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

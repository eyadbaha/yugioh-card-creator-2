import { textGenerate } from "./textGenerate.js";
import sharp from "sharp";
import type { APIBody, linkArrows, settings } from "./types";
import sizeOf from "image-size";
import { z } from "zod";
import axios from "axios";

interface OverlayOptionsPromises extends Omit<sharp.OverlayOptions, "input"> {
  input: Promise<Buffer> | string;
}

const cardGenerate = async (options: APIBody, importedStyle: settings) => {
  const assetsDir = process.env.ASSETS_DIR || `./assets`;
  let artBuffer: Buffer = Buffer.from("");
  if (z.string().url().safeParse(options.art).success) {
    artBuffer = (await axios({ url: options.art, responseType: "arraybuffer" })).data as Buffer;
  } else {
    artBuffer = Buffer.from(options.art, "base64");
  }
  const artMetaData = sizeOf(artBuffer);
  const OverlayOptions: OverlayOptionsPromises[] = [];
  let nameColor = importedStyle.name.color;
  ["link", "xyz", "spell", "trap"].forEach((e) => {
    options.template.includes(e) ? (nameColor = "white") : null;
  });
  const card = sharp(`${assetsDir}/standard/${importedStyle.styleName}/template/${options.template}.png`);
  //Name, Attribute overlay
  OverlayOptions.unshift(
    { input: textGenerate(options.name, { ...importedStyle.name, color: nameColor }), ...importedStyle.name },
    {
      input: `${assetsDir}/standard/${importedStyle.styleName}/icons/${options.attribute?.toLocaleLowerCase()}.png`,
      ...importedStyle.attribute,
    }
  );
  if (options.template != "spell" && options.template != "trap" && options.monsterType) {
    //Card is a Monster
    if (options.template == "xyz") {
      //Card is an Xyz Monster
      //Rank overlay
      for (let n: number = 0; n < (options.level as number); n++) {
        OverlayOptions.push({
          input: `${assetsDir}/standard/${importedStyle.styleName}/icons/r.png`,
          left:
            (importedStyle.rank.left as number) +
            (importedStyle.level.width + (importedStyle.level.spacing as number)) * n,
          top: importedStyle.level.top,
        });
      }
      //Defence overlay
      OverlayOptions.push({
        input: textGenerate(options.def as string, importedStyle.stat),
        ...importedStyle.stat.def,
      });
    } else if (options.template == "link") {
      //Card is a Link Monster
      const linkArrowPositions: (keyof linkArrows)[] = [
        "Top",
        "Top-Right",
        "Right",
        "Bottom-Right",
        "Bottom",
        "Bottom-Left",
        "Left",
        "Top-Left",
      ];
      const linkArrows = linkArrowPositions.map((value) => {
        return `${assetsDir}/standard/${importedStyle.styleName}/icons/${value.toLocaleLowerCase()}.png`;
      });
      //Overlay Link Arrows
      options.linkArrows?.forEach((value) => {
        for (let i = 0; i < linkArrowPositions.length; i++) {
          if (value == linkArrowPositions[i]) {
            OverlayOptions.unshift({
              input: linkArrows[i],
              ...importedStyle.linkArrows[linkArrowPositions[i]],
            });
            break;
          }
        }
      });
      //Overlay Link Rating text
      OverlayOptions.unshift({
        input: textGenerate(options.level?.toString() || "0", importedStyle.linkRating),
        ...importedStyle.linkRating,
      });
    } else {
      //Overlay Levels
      for (let n: number = 0; n < (options.level as number); n++) {
        OverlayOptions.push({
          input: `${assetsDir}/standard/${importedStyle.styleName}/icons/lv.png`,
          left:
            (importedStyle.level.left as number) -
            (importedStyle.level.width + (importedStyle.level.spacing as number)) * n,
          top: importedStyle.level.top,
        });
      }
      //Overlay Defence
      OverlayOptions.push({
        input: textGenerate(options.def as string, importedStyle.stat),
        ...importedStyle.stat.def,
      });
    }
    //Overlay Monster  type text, Attack, Description
    const [monsterType, atk, cardText] = [
      textGenerate(options.monsterType, importedStyle.type),
      textGenerate(options.atk as string, importedStyle.stat),
      textGenerate(options.cardText, {
        ...importedStyle.text,
        fontFamily: options.monsterType.toLocaleLowerCase()?.includes("normal")
          ? options.monsterType.toLocaleLowerCase()?.includes("pendulum")
            ? importedStyle.text.fontFamilyNormalPendulum
            : importedStyle.text.fontFamilyNormal
          : importedStyle.text.fontFamily,
      }),
    ];
    OverlayOptions.unshift(
      { input: monsterType, top: importedStyle.type.top, left: importedStyle.type.left },
      { input: cardText, top: importedStyle.text.top, left: importedStyle.text.left },
      { input: atk, top: importedStyle.stat.atk.top, left: importedStyle.stat.atk.left }
    );
    if (options.pendulum == false || options.template == "link") {
      //Card is not a Pendulum
      const art = sharp(artBuffer).resize(importedStyle.art.width, importedStyle.art.height).toBuffer();
      OverlayOptions.unshift({
        input: art,
        top: importedStyle.art.top,
        left: importedStyle.art.left,
        blend: "dest-over",
      });
    } else {
      //Card is a Pendulum
      const artRatio: number = (artMetaData.height as number) / (artMetaData.width as number);
      let artResizeOptions: sharp.ResizeOptions;
      if (artRatio < importedStyle.pendulumArt.height2 / importedStyle.pendulumArt.width) {
        artResizeOptions = {
          width: importedStyle.pendulumArt.width,
          height: importedStyle.pendulumArt.height2,
          fit: "fill",
        };
      } else if (artRatio < importedStyle.pendulumArt.height1 / importedStyle.pendulumArt.width) {
        artResizeOptions = {
          width: importedStyle.pendulumArt.width,
          height: importedStyle.pendulumArt.height2,
          position: "top",
        };
      } else if (artRatio < 1.263) {
        artResizeOptions = {
          width: importedStyle.pendulumArt.width,
          height: importedStyle.pendulumArt.height1,
          position: "top",
        };
      } else {
        artResizeOptions = {
          width: importedStyle.pendulumArt.width,
          height: importedStyle.pendulumArt.height,
          position: "top",
        };
      }
      const [pendulum, pendulumTemplate, scale, art, artMask, pendulumText] = [
        `${assetsDir}/standard/${importedStyle.styleName}/template/pendulum.png`,
        `${assetsDir}/standard/${importedStyle.styleName}/template/pendulum-${options.template}.png`,
        textGenerate(options.scale?.toString() || "0", importedStyle.scale),
        sharp(artBuffer).resize(artResizeOptions).toBuffer(),
        sharp({
          create: {
            width: importedStyle.pendulumArt.width,
            height: importedStyle.pendulumArt.height,
            channels: 4,
            background: { r: 255, g: 255, b: 255, alpha: 1 },
          },
        })
          .jpeg()
          .toBuffer(),
        textGenerate(options.pendulumText || "", importedStyle.pendulumText),
      ];
      OverlayOptions.unshift(
        { input: artMask, ...importedStyle.pendulumArt },
        { input: art, ...importedStyle.pendulumArt },
        { input: pendulumTemplate },
        { input: pendulum },
        { input: pendulumText, ...importedStyle.pendulumText },
        { input: scale, ...importedStyle.scale.rightScale },
        { input: scale, ...importedStyle.scale.leftScale }
      );
    }
  } else {
    //Card is a Spell/Trap
    if (options.icon == "normal") {
      const type = `${assetsDir}/standard/${
        importedStyle.styleName
      }/icons/${options.attribute?.toLocaleLowerCase()}-normal.png`;
      OverlayOptions.unshift({
        input: type,
        ...importedStyle.spellIcon.text,
      });
    } else {
      const [type, icon] = [
        `${assetsDir}/standard/${importedStyle.styleName}/icons/${options.attribute?.toLocaleLowerCase()}-icon.png`,
        `${assetsDir}/standard/${importedStyle.styleName}/icons/${options.icon?.toLocaleLowerCase()}.png`,
      ];
      OverlayOptions.unshift(
        { input: type, ...importedStyle.spellIcon.text },
        { input: icon, ...importedStyle.spellIcon.icon }
      );
    }
    const [art, cardText] = [
      sharp(artBuffer).resize(importedStyle.art.width, importedStyle.art.height).toBuffer(),
      textGenerate(options.cardText, importedStyle.textSpell),
      textGenerate(options.name, importedStyle.name),
    ];
    OverlayOptions.unshift(
      { input: art, ...importedStyle.art, blend: "dest-over" },
      { input: cardText, ...importedStyle.textSpell }
    );
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
  const imgBuffer = await card.webp({ quality: 1 }).toBuffer();
  return imgBuffer;
};

export { cardGenerate };

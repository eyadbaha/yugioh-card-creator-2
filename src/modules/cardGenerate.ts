import { textGenerate } from "./textGenerate.js";
import sharp from "sharp";
import type { APIBody, linkArrows, settings } from "./types";
import sizeOf from "image-size";

interface OverlayOptionsPromises extends Omit<sharp.OverlayOptions, "input"> {
  input: Promise<Buffer>;
}

const cardGenerate = async (options: APIBody, importedStyle: settings) => {
  const assetsDir = process.env.ASSETS_DIR || `./assets`;
  const artBuffer = Buffer.from(options.art, "base64");
  const artMetaData = sizeOf(artBuffer);
  const OverlayOptions: OverlayOptionsPromises[] = [];
  let nameColor = importedStyle.name.color;
  ["link", "xyz", "spell", "trap"].forEach((e) => {
    options.template.includes(e) ? (nameColor = "white") : null;
  });
  const [card, attribute, name] = [
    sharp(`${assetsDir}/standard/${importedStyle.styleName}/template/${options.template}.png`),
    sharp(`${assetsDir}/standard/${importedStyle.styleName}/icons/${options.attribute?.toLocaleLowerCase()}.png`)
      .resize(importedStyle.attribute.width, importedStyle.attribute.height)
      .toBuffer(),
    textGenerate(options.name, { ...importedStyle.name, color: nameColor }),
  ];
  OverlayOptions.unshift(
    { input: name, top: importedStyle.name.y, left: importedStyle.name.x },
    { input: attribute, top: importedStyle.attribute.y, left: importedStyle.attribute.x }
  );
  if (options.template != "spell" && options.template != "trap" && options.monsterType) {
    //Card is a Monster
    if (options.template == "xyz") {
      //Card is an Xyz Monster
      const lv = sharp(`${assetsDir}/standard/${importedStyle.styleName}/icons/r.png`)
        .resize(importedStyle.level.width, importedStyle.level.height)
        .toBuffer();
      for (let n: number = 0; n < (options.level as number); n++) {
        OverlayOptions.push({
          input: lv,
          left:
            (importedStyle.rank.x as number) +
            (importedStyle.level.width + (importedStyle.level.spacing as number)) * n,
          top: importedStyle.level.y,
        });
      }
      const def = textGenerate(options.def as string, importedStyle.stat);
      OverlayOptions.push({ input: def, top: importedStyle.stat.def.y, left: importedStyle.stat.def.x });
    } else if (options.template == "link") {
      //Card is a Link Monster
      const linkRating = textGenerate(options.level?.toString() || "0", importedStyle.linkRating);
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
        return sharp(`${assetsDir}/standard/${importedStyle.styleName}/icons/${value.toLocaleLowerCase()}.png`)
          .resize({
            width: importedStyle.linkArrows[value].width,
            height: importedStyle.linkArrows[value].height,
            fit: "fill",
          })
          .toBuffer();
      });
      options.linkArrows?.forEach((value) => {
        for (let i = 0; i < linkArrowPositions.length; i++) {
          if (value == linkArrowPositions[i]) {
            OverlayOptions.unshift({
              input: linkArrows[i],
              top: importedStyle.linkArrows[linkArrowPositions[i]].y,
              left: importedStyle.linkArrows[linkArrowPositions[i]].x,
            });
            break;
          }
        }
      });
      OverlayOptions.unshift({ input: linkRating, top: importedStyle.linkRating.y, left: importedStyle.linkRating.x });
    } else {
      const [lv, def] = [
        sharp(`${assetsDir}/standard/${importedStyle.styleName}/icons/lv.png`)
          .resize(importedStyle.level.width, importedStyle.level.height)
          .toBuffer(),
        textGenerate(options.def as string, importedStyle.stat),
      ];
      for (let n: number = 0; n < (options.level as number); n++) {
        OverlayOptions.push({
          input: lv,
          left:
            (importedStyle.level.x as number) -
            (importedStyle.level.width + (importedStyle.level.spacing as number)) * n,
          top: importedStyle.level.y,
        });
      }
      OverlayOptions.push({ input: def, top: importedStyle.stat.def.y, left: importedStyle.stat.def.x });
    }
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
      { input: monsterType, top: importedStyle.type.y, left: importedStyle.type.x },
      { input: cardText, top: importedStyle.text.y, left: importedStyle.text.x },
      { input: atk, top: importedStyle.stat.atk.y, left: importedStyle.stat.atk.x }
    );
    if (options.pendulum == false || options.template == "link") {
      //Card is not a Pendulum
      const art = sharp(artBuffer).resize(importedStyle.art.width, importedStyle.art.height).toBuffer();
      OverlayOptions.unshift({ input: art, top: importedStyle.art.y, left: importedStyle.art.x, blend: "dest-over" });
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
      const [pendulum, pendulumTemplate, scale, art, artMask, pednulumText] = [
        sharp(`${assetsDir}/standard/${importedStyle.styleName}/template/pendulum.png`).toBuffer(),
        sharp(`${assetsDir}/standard/${importedStyle.styleName}/template/pendulum-${options.template}.png`).toBuffer(),
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
        { input: artMask, top: importedStyle.pendulumArt.y, left: importedStyle.pendulumArt.x },
        { input: art, top: importedStyle.pendulumArt.y, left: importedStyle.pendulumArt.x },
        { input: pendulumTemplate },
        { input: pendulum },
        { input: pednulumText, top: importedStyle.pendulumText.y, left: importedStyle.pendulumText.x },
        { input: scale, top: importedStyle.scale.right.y, left: importedStyle.scale.right.x },
        { input: scale, top: importedStyle.scale.left.y, left: importedStyle.scale.left.x }
      );
    }
  } else {
    //Card is a Spell/Trap
    if (options.icon == "normal") {
      const type = sharp(
        `${assetsDir}/standard/${importedStyle.styleName}/icons/${options.attribute?.toLocaleLowerCase()}-normal.png`
      ).toBuffer();
      OverlayOptions.unshift({
        input: type,
        top: importedStyle.spellIcon.text.y,
        left: importedStyle.spellIcon.text.x,
      });
    } else {
      const [type, icon] = [
        sharp(
          `${assetsDir}/standard/${importedStyle.styleName}/icons/${options.attribute?.toLocaleLowerCase()}-icon.png`
        ).toBuffer(),
        sharp(`${assetsDir}/standard/${importedStyle.styleName}/icons/${options.icon?.toLocaleLowerCase()}.png`)
          .resize(importedStyle.spellIcon.icon.width, importedStyle.spellIcon.icon.height)
          .toBuffer(),
      ];
      OverlayOptions.unshift(
        { input: type, top: importedStyle.spellIcon.text.y, left: importedStyle.spellIcon.text.x },
        { input: icon, top: importedStyle.spellIcon.icon.y, left: importedStyle.spellIcon.icon.x }
      );
    }
    const [art, cardText] = [
      sharp(artBuffer).resize(importedStyle.art.width, importedStyle.art.height).toBuffer(),
      textGenerate(options.cardText, importedStyle.textSpell),
      textGenerate(options.name, importedStyle.name),
    ];
    OverlayOptions.unshift(
      { input: art, top: importedStyle.art.y, left: importedStyle.art.x, blend: "dest-over" },
      { input: cardText, top: importedStyle.textSpell.y, left: importedStyle.textSpell.x }
    );
  }
  const ResolvedOverlayOptionsinput: Buffer[] = await Promise.all(
    OverlayOptions.map((option) => {
      return option.input;
    })
  );
  const ResolvedOverlayOptions: sharp.OverlayOptions[] = OverlayOptions.map((element, index) => {
    return { ...element, input: ResolvedOverlayOptionsinput[index] };
  });
  card.composite(ResolvedOverlayOptions);
  const imgBuffer = await sharp(await card.toBuffer())
    .webp()
    .resize(360, 523)
    .toBuffer();
  return imgBuffer;
};

export { cardGenerate };

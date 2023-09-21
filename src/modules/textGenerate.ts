import sharp from "sharp";
import { calculateMaxFont, getTxtWidth } from "./textSizeCalculate.js";
import type { generateOptions } from "./types";
const createTextLineBuffer = (text: string, options: generateOptions): Buffer => {
  const defaultOptions = {
    color: "black",
    width: 100,
    scaleX: 1,
    scaleY: 1,
    size: 10,
    x: 0,
    y: 10,
    fontFamily: "MatrixRegularSmallCaps",
    letterSpacing: 0,
    opacity: 1,
    stroke: 0,
  };
  options = { ...defaultOptions, ...options };
  const position =
    options.align == "center"
      ? `x="50%" y="${Math.ceil(options.size as number)}" dominant-baseline="middle" text-anchor="middle"`
      : `x="0" y="${Math.ceil(options.size as number)}"`;
  const background = options.background ? `<rect width="100%" height="100%" fill="${options.background}" />` : "";
  const outline = options.outline
    ? `${background}
       <text ${position} fill="${options.outline.color}" letter-spacing="${options.letterSpacing}" opacity="${
        options.opacity
      }" font-weight="${options.weight}" stroke-width="${options.outline.width + (options.stroke || 0)}" stroke="${
        options.outline.color
      }" transform="scale(${options.scaleX}, ${options.scaleY})" font-family="${options.fontFamily}" font-size="${
        options.size
      }px">${text}</text>`
    : "";
  var svgString = `
    <svg width="${Math.ceil(options.width as number)}" height="${Math.ceil(options.height as number) + 20}">    
    <g>
       ${outline}<text ${position} fill="${options.color}" letter-spacing="${options.letterSpacing}" opacity="${
    options.opacity
  }" font-weight="${options.weight}" stroke-width="${options.stroke}" stroke="${options.color}" transform="scale(${
    options.scaleX
  }, ${options.scaleY})" font-family="${options.fontFamily}" font-size="${options.size}px">${text}</text>
       
        </g>
    </svg>`;
  return Buffer.from(svgString);
};
const escape = (s: string | number): string | number => {
  if (typeof s === "string") {
    const lookup = {
      "&": "&amp;",
      '"': "&quot;",
      "'": "&apos;",
      "<": "&lt;",
      ">": "&gt;",
    };
    return s.replace(/[&"'<>]/g, (c) => lookup[c as keyof object] as string);
  }
  return s;
};
const textGenerate = async (text: string, inputOptions: generateOptions): Promise<Buffer> => {
  if (inputOptions.allCaps) text = text.toUpperCase();
  text = `${escape(text)}`;
  let scaleX = inputOptions.scaleX || 1,
    scaleY = inputOptions.scaleY,
    width = Math.ceil(getTxtWidth(text, inputOptions));
  if (inputOptions.fit === "container") {
    if (width > inputOptions.width) {
      scaleX = 1;
      width = Math.ceil(getTxtWidth(text, { ...inputOptions, scaleX: 1 }));
    } else {
      width = width / scaleX;
    }
    const buffer = createTextLineBuffer(text, { ...inputOptions, width: width, scaleX: 1, scaleY: scaleY as number });
    const output = await sharp(
      await sharp(buffer)
        .resize({ width: Math.ceil(Math.min(width * scaleX, inputOptions.width)), fit: "fill", position: "left" })
        .toBuffer()
    )
      .resize({
        width: inputOptions.width,
        height: inputOptions.height + 20,
        fit: "contain",
        position: inputOptions.align || "left",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .toBuffer();
    return output;
  }
  let textBuffer = "";
  let dy = "0";
  const options = { ...inputOptions, size: calculateMaxFont(text, inputOptions) };
  text.split(/\n/).map((line) => {
    let lineString = "";
    line.split(" ").forEach((word) => {
      if (getTxtWidth(lineString + `${word} `, options) > options.width) {
        textBuffer += `<tspan x="0" dy="${dy}">${lineString}</tspan>`;
        dy = "1em";
        lineString = "";
      }
      lineString += `${word} `;
    });
    if (lineString) {
      textBuffer += `<tspan x="0" dy="${dy}">${lineString}</tspan>`;
    }
    dy = "1em";
  });
  const buffer = createTextLineBuffer(textBuffer, options);
  const output = await sharp(buffer).webp().toBuffer();
  return output;
};
export { textGenerate };

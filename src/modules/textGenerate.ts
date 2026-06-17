import sharp from "sharp";
import type { RenderContext } from "./renderContext.js";
import { calculateMaxFont, getTxtWidth, wrapLines } from "./textSizeCalculate.js";
import type { generateOptions } from "./types.js";

type TextLineOptions = generateOptions & {
  offsetX?: number;
  textBoxWidth?: number;
};

type TextOverflowPadding = {
  right: number;
  bottom: number;
};

const escape = (value: string | number): string | number => {
  if (typeof value !== "string") return value;

  const lookup = {
    "&": "&amp;",
    '"': "&quot;",
    "'": "&apos;",
    "<": "&lt;",
    ">": "&gt;",
  };
  return value.replace(/[&"'<>]/g, (char) => lookup[char as keyof typeof lookup]);
};

const smallCapsConvert = (inputText: string, options: generateOptions, strokeDelta = 0) =>
  inputText.replace(/(?<!&[^;]*)[a-z\u00e0-\u00ff]/g, (match) => {
    const strokeWidth = (options.stroke || 0) + strokeDelta;
    return `<tspan font-size="${options.size * 0.8}" stroke-width="${strokeWidth}" letter-spacing="${
      options.letterSpacing || 0
    }">${match.toUpperCase()}</tspan>`;
  });

const bracketGlyphAttributes = (options: generateOptions) => {
  const bracketOptions = options.brackets;
  if (!bracketOptions) return "";

  const attributes: string[] = [];
  if (bracketOptions.fontFamily) attributes.push(`font-family="${escape(bracketOptions.fontFamily)}"`);
  if (bracketOptions.size !== undefined) attributes.push(`font-size="${bracketOptions.size}px"`);

  return attributes.length > 0 ? ` ${attributes.join(" ")}` : "";
};

const styleBracketGlyphs = (text: string, options: generateOptions) => {
  const attributes = bracketGlyphAttributes(options);
  if (!attributes) return text;

  return text.replace(/[\[\]]/g, (bracket) => `<tspan${attributes}>${bracket}</tspan>`);
};

const getMaxPaintStrokeWidth = (options: generateOptions) =>
  Math.max(
    options.stroke || 0,
    options.outline ? options.outline.width + (options.stroke || 0) : 0,
    options.overrush && options.smallCaps ? (options.stroke || 0) + 2 : 0
  );

const getTextOverflowPadding = (options: generateOptions): TextOverflowPadding => {
  const strokeWidth = getMaxPaintStrokeWidth(options);

  return {
    right: Math.ceil(Math.max(4, strokeWidth + options.size * 0.1)),
    bottom: Math.ceil(Math.max(4, strokeWidth + options.size * options.scaleY * 0.45)),
  };
};

const createDefs = (options: generateOptions, context: RenderContext, svgWidth: number, svgHeight: number) => {
  if (!options.overrush) return "";

  const shadowFilter = options.smallCaps
    ? `<filter id="shadowFilter">
        <feOffset dx="1" dy="2"/>
        <feGaussianBlur stdDeviation="1"/>
        <feMerge>
          <feMergeNode/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>`
    : "";

  return `<defs>
      <pattern id="bgimg" x="0" y="0" width="${svgWidth}" height="${svgHeight}" patternUnits="userSpaceOnUse">
        <image x="0" y="0" width="${svgWidth}" height="${svgHeight}" preserveAspectRatio="xMidYMid slice" href="${context.generalAssets.overRushCoverDataUri}" />
      </pattern>
      ${shadowFilter}
    </defs>`;
};

const createTextLineBuffer = (text: string, inputOptions: TextLineOptions, context: RenderContext): Buffer => {
  const defaultOptions = {
    color: "black",
    width: 100,
    scaleX: 1,
    scaleY: 1,
    size: 10,
    fontFamily: "MatrixRegularSmallCaps",
    letterSpacing: 0,
    opacity: 1,
    stroke: 0,
    offsetX: 0,
  };
  const options = { ...defaultOptions, ...inputOptions };
  const textBoxWidth = options.textBoxWidth ?? options.width;
  const y = Math.ceil(options.size as number);
  const padding = getTextOverflowPadding(options);
  const baseSvgWidth = Math.ceil(options.width as number);
  const baseSvgHeight = Math.ceil(options.height as number) + 20;
  const svgWidth = baseSvgWidth + padding.right;
  const svgHeight = Math.max(baseSvgHeight, Math.ceil(y + padding.bottom));
  const position =
    options.align === "center"
      ? `x="${Math.ceil(textBoxWidth / 2)}" y="${y}" dominant-baseline="middle" text-anchor="middle"`
      : `x="0" y="${y}"`;
  const background = options.background
    ? `<rect width="${baseSvgWidth}" height="${baseSvgHeight}" fill="${options.background}" />`
    : "";
  let textWithStroke = "";

  if (options.smallCaps) {
    textWithStroke = `<text ${position} fill="#43161E" letter-spacing="${options.letterSpacing}" opacity="${
      options.opacity
    }" font-weight="${options.weight}" stroke-width="${(options.stroke || 0) + 2}" stroke="#43161E" font-family="${
      options.fontFamily
    }" font-size="${options.size}px" filter="url(#shadowFilter)">${styleBracketGlyphs(
      smallCapsConvert(text, options, 2),
      options
    )}</text>`;
    text = smallCapsConvert(text, options);
  }

  const outline = options.outline
    ? `${background}
       <text ${position} fill="${options.outline.color}" letter-spacing="${options.letterSpacing}" opacity="${
        options.opacity
      }" font-weight="${options.weight}" stroke-width="${options.outline.width + (options.stroke || 0)}" stroke="${
        options.outline.color
      }" font-family="${options.fontFamily}" font-size="${options.size}px">${styleBracketGlyphs(
        text,
        options
      )}</text>`
    : "";

  const visibleText = styleBracketGlyphs(text, options);
  const svgString = `
    <svg width="${svgWidth}" height="${svgHeight}">
      ${createDefs(options, context, svgWidth, svgHeight)}
      <g transform="translate(${options.offsetX}, 0)">
        <g transform="scale(${options.scaleX}, ${options.scaleY})">
          ${outline}
          ${options.overrush && textWithStroke ? textWithStroke : ""}
          <text ${position} fill="${options.overrush ? "url(#bgimg)" : options.color}" letter-spacing="${
    options.letterSpacing
  }" opacity="${options.opacity}" font-weight="${options.weight}" stroke-width="${options.stroke}" stroke="${
    options.color
  }" font-family="${options.fontFamily}" font-size="${options.size}px">${visibleText}</text>
        </g>
      </g>
    </svg>`;

  return Buffer.from(svgString);
};

const normalizeText = (text: string, inputOptions: generateOptions) => {
  const normalized = text.replace(/([^ ])(\/)([^ ])/g, "$1 / $3").replace(/^(\[[^\]]+\])([^\s])/gm, "$1 $2");
  return inputOptions.allCaps ? normalized.toUpperCase() : normalized;
};

const getContainerOffset = (align: string | undefined, containerWidth: number, contentWidth: number) => {
  if (align === "right") return containerWidth - contentWidth;
  if (align === "center") return (containerWidth - contentWidth) / 2;
  return 0;
};

const textGenerate = async (
  inputText: string,
  inputOptions: generateOptions,
  context: RenderContext
): Promise<Buffer> => {
  const text = `${normalizeText(inputText, inputOptions)}`;
  const scaleX = inputOptions.scaleX || 1;
  const scaleY = inputOptions.scaleY || 1;

  if (inputOptions.fit === "container") {
    const rawWidth = Math.ceil(getTxtWidth(text, { ...inputOptions, scaleX: 1 }, context));
    const textBoxWidth = rawWidth + (inputOptions.outline?.width || 0);
    const contentWidth = Math.ceil(Math.min(textBoxWidth * scaleX, inputOptions.width));
    const fittedScaleX = textBoxWidth > 0 ? contentWidth / textBoxWidth : scaleX;

    return sharp(
      createTextLineBuffer(
        `${escape(text)}`,
        {
          ...inputOptions,
          width: inputOptions.width,
          height: inputOptions.height,
          scaleX: fittedScaleX,
          scaleY,
          offsetX: getContainerOffset(inputOptions.align, inputOptions.width, contentWidth),
          textBoxWidth,
        },
        context
      )
    )
      .png()
      .toBuffer();
  }

  const options = { ...inputOptions, size: calculateMaxFont(text, inputOptions, context) };
  const textBuffer = wrapLines(text, options, context)
    .map((line, index) => `<tspan x="0" dy="${index === 0 ? "0" : "1em"}">${escape(line)}</tspan>`)
    .join("");

  return createTextLineBuffer(textBuffer, options, context);
};

export { textGenerate };

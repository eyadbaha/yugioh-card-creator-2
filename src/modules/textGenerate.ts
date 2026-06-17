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

const DEFAULT_SMALL_CAPS_SCALE = 0.8;

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

const shouldApplySmallCaps = (options: generateOptions) =>
  Boolean(options.smallCaps || (options.allCaps && options.smallCapsScale !== undefined));

const getSmallCapsScale = (options: generateOptions) => options.smallCapsScale ?? DEFAULT_SMALL_CAPS_SCALE;

const getSmallCapsStroke = (options: generateOptions) => options.smallCapsStroke ?? 0;

const getWordSpacing = (options: generateOptions) => options.wordSpacing ?? 0;

const isSmallCapsCharacter = (value: string) => /^[a-z\u00e0-\u00ff]$/.test(value);

const createSmallCapsRun = (text: string, options: generateOptions, strokeDelta: number) => {
  const strokeWidth = (options.stroke || 0) + getSmallCapsStroke(options) + strokeDelta;
  return `<tspan font-size="${options.size * getSmallCapsScale(
    options
  )}" stroke-width="${strokeWidth}" stroke-linejoin="round" letter-spacing="${
    options.letterSpacing || 0
  }">${text.toUpperCase()}</tspan>`;
};

const styleWordSpacing = (inputText: string, options: generateOptions) => {
  const wordSpacing = getWordSpacing(options);
  if (wordSpacing === 0) return inputText;

  let output = "";
  let pendingDx = 0;

  for (let index = 0; index < inputText.length; index += 1) {
    const char = inputText[index];

    if (char === "<") {
      const tagEnd = inputText.indexOf(">", index);
      if (tagEnd === -1) {
        output += char;
        continue;
      }

      const tag = inputText.slice(index, tagEnd + 1);
      if (pendingDx !== 0 && /^<tspan(?:\s|>)/.test(tag)) {
        output += tag.replace(/^<tspan/, `<tspan dx="${pendingDx}"`);
        pendingDx = 0;
      } else {
        output += tag;
      }
      index = tagEnd;
      continue;
    }

    if (char === "&") {
      const entityEnd = inputText.indexOf(";", index);
      if (entityEnd === -1) {
        output += char;
        continue;
      }

      const entity = inputText.slice(index, entityEnd + 1);
      output += pendingDx !== 0 ? `<tspan dx="${pendingDx}">${entity}</tspan>` : entity;
      pendingDx = 0;
      index = entityEnd;
      continue;
    }

    if (char === " ") {
      output += char;
      pendingDx += wordSpacing;
      continue;
    }

    if (pendingDx !== 0) {
      output += `<tspan dx="${pendingDx}">${char}</tspan>`;
      pendingDx = 0;
      continue;
    }

    output += char;
  }

  return output;
};

const smallCapsConvert = (inputText: string, options: generateOptions, strokeDelta = 0) => {
  let output = "";
  let run = "";
  let inEntity = false;
  let inTag = false;

  const flushRun = () => {
    if (!run) return;
    output += createSmallCapsRun(run, options, strokeDelta);
    run = "";
  };

  for (const char of inputText) {
    if (char === "<") {
      flushRun();
      inTag = true;
      output += char;
      continue;
    }

    if (inTag) {
      output += char;
      if (char === ">") inTag = false;
      continue;
    }

    if (char === "&") {
      flushRun();
      inEntity = true;
      output += char;
      continue;
    }

    if (inEntity) {
      output += char;
      if (char === ";") inEntity = false;
      continue;
    }

    if (isSmallCapsCharacter(char)) {
      run += char;
    } else {
      flushRun();
      output += char;
    }
  }

  flushRun();
  return output;
};

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
    shouldApplySmallCaps(options) ? (options.stroke || 0) + getSmallCapsStroke(options) : 0,
    options.outline ? options.outline.width + (options.stroke || 0) : 0,
    options.overrush && shouldApplySmallCaps(options) ? (options.stroke || 0) + 2 : 0
  );

const getTextOverflowPadding = (options: generateOptions): TextOverflowPadding => {
  const strokeWidth = getMaxPaintStrokeWidth(options);

  return {
    right: Math.ceil(Math.max(4, strokeWidth + options.size * 0.1)),
    bottom: Math.ceil(Math.max(4, strokeWidth + options.size * options.scaleY * 0.45)),
  };
};

const getThinAmount = (options: generateOptions) => {
  const thin = options.thin ?? 0;
  return Number.isFinite(thin) ? Math.max(0, Math.min(thin, 1)) : 0;
};

const createDefs = (options: generateOptions, context: RenderContext, svgWidth: number, svgHeight: number) => {
  const defs: string[] = [];

  if (options.overrush) {
    defs.push(`<pattern id="bgimg" x="0" y="0" width="${svgWidth}" height="${svgHeight}" patternUnits="userSpaceOnUse">
        <image x="0" y="0" width="${svgWidth}" height="${svgHeight}" preserveAspectRatio="xMidYMid slice" href="${context.generalAssets.overRushCoverDataUri}" />
      </pattern>`);

    if (shouldApplySmallCaps(options)) {
      defs.push(`<filter id="shadowFilter">
        <feOffset dx="1" dy="2"/>
        <feGaussianBlur stdDeviation="1"/>
        <feMerge>
          <feMergeNode/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>`);
    }
  }

  const thinAmount = getThinAmount(options);
  if (thinAmount > 0) {
    defs.push(`<filter id="thinFilter">
        <feMorphology in="SourceGraphic" operator="erode" radius="1" result="eroded" />
        <feComposite in="SourceGraphic" in2="eroded" operator="arithmetic" k1="0" k2="${
          1 - thinAmount
        }" k3="${thinAmount}" k4="0" />
      </filter>`);
  }

  return defs.length > 0 ? `<defs>${defs.join("\n")}</defs>` : "";
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
    wordSpacing: 0,
    offsetX: 0,
  };
  const options = { ...defaultOptions, ...inputOptions };
  const textBoxWidth = options.textBoxWidth ?? options.width;
  const y = Math.ceil(options.size as number);
  const padding = getTextOverflowPadding(options);
  const baseSvgWidth = Math.ceil(options.width as number);
  const textBoxHeight = Math.ceil(options.height as number);
  const baseSvgHeight = textBoxHeight + 20;
  const svgWidth = baseSvgWidth + padding.right;
  const svgHeight = Math.max(baseSvgHeight, Math.ceil(y + padding.bottom));
  const position =
    options.align === "center"
      ? `x="${Math.ceil(textBoxWidth / 2)}" y="${y}" dominant-baseline="middle" text-anchor="middle"`
      : `x="0" y="${y}"`;
  const background = options.background
    ? `<rect width="${baseSvgWidth}" height="${textBoxHeight}" fill="${options.background}" />`
    : "";
  let textWithStroke = "";

  if (shouldApplySmallCaps(options)) {
    textWithStroke = `<text ${position} fill="#43161E" letter-spacing="${options.letterSpacing}" opacity="${
      options.opacity
    }" font-weight="${options.weight}" stroke-width="${
      (options.stroke || 0) + 2
    }" stroke="#43161E" font-family="${options.fontFamily}" font-size="${
      options.size
    }px" filter="url(#shadowFilter)">${styleWordSpacing(
      styleBracketGlyphs(smallCapsConvert(text, options, 2), options),
      options
    )}</text>`;
    text = smallCapsConvert(text, options);
  }

  const outline = options.outline
    ? `<text ${position} fill="${options.outline.color}" letter-spacing="${options.letterSpacing}" opacity="${
        options.opacity
      }" font-weight="${options.weight}" stroke-width="${
        options.outline.width + (options.stroke || 0)
      }" stroke="${options.outline.color}" font-family="${options.fontFamily}" font-size="${
        options.size
      }px">${styleWordSpacing(
        styleBracketGlyphs(text, options),
        options
      )}</text>`
    : "";

  const visibleText = styleWordSpacing(styleBracketGlyphs(text, options), options);
  const thinFilter = getThinAmount(options) > 0 ? ` filter="url(#thinFilter)"` : "";
  const svgString = `
    <svg width="${svgWidth}" height="${svgHeight}">
      ${createDefs(options, context, svgWidth, svgHeight)}
      ${background}
      <g transform="translate(${options.offsetX}, 0)">
        <g transform="scale(${options.scaleX}, ${options.scaleY})">
          ${outline}
          ${options.overrush && textWithStroke ? textWithStroke : ""}
          <text ${position} fill="${options.overrush ? "url(#bgimg)" : options.color}" letter-spacing="${
    options.letterSpacing
  }" opacity="${options.opacity}" font-weight="${options.weight}" stroke-width="${options.stroke}" stroke="${
    options.color
  }" font-family="${options.fontFamily}" font-size="${options.size}px"${thinFilter}>${visibleText}</text>
        </g>
      </g>
    </svg>`;

  return Buffer.from(svgString);
};

const normalizeText = (text: string, inputOptions: generateOptions) => {
  const normalized = text.replace(/([^ ])(\/)([^ ])/g, "$1 / $3").replace(/^(\[[^\]]+\])([^\s])/gm, "$1 $2");
  return inputOptions.allCaps && !shouldApplySmallCaps(inputOptions) ? normalized.toUpperCase() : normalized;
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

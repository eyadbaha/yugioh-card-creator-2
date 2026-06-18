import sharp from "sharp";
import { requireFont, type RenderContext } from "./renderContext.js";
import { calculateMaxFont, getFittedTextBlockLayout, getTxtWidth } from "./textSizeCalculate.js";
import type { generateOptions } from "./types.js";

type TextLineOptions = generateOptions & {
  offsetX?: number;
  textBoxWidth?: number;
  baselineY?: number;
};

type TextOverflowPadding = {
  right: number;
  bottom: number;
};

type TextPaint = {
  fill: string;
  stroke: string;
  strokeWidth: number;
  filter?: string;
};

type TextRun = {
  text: string;
  measureText: string;
  fontFamily: string;
  fontSize: number;
  letterSpacing: number;
  wordSpacing: number;
  scaleX: number;
  attributes?: Record<string, string | number | boolean>;
};

type LineEndingSettings = {
  trimLineEndings: boolean;
  justifyLineEndings: boolean;
  justifyLastLine: boolean;
  maxLineWordSpacing?: number;
  minLineFillRatio: number;
};

type TextBlockLine = {
  text: string;
  wordSpacing: number;
  letterSpacing: number;
};

const DEFAULT_SMALL_CAPS_SCALE = { scaleX: 0.8, scaleY: 0.8 };
const BRACKET_SEMANTIC_KEYS = new Set(["size", "fontFamily", "scaleX", "scaleY"]);
const SVG_ATTRIBUTE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_.:-]*$/;
const SVG_ATTRIBUTE_ALIASES: Record<string, string> = {
  baselineShift: "baseline-shift",
  dominantBaseline: "dominant-baseline",
  fillOpacity: "fill-opacity",
  fontFamily: "font-family",
  fontSize: "font-size",
  letterSpacing: "letter-spacing",
  strokeLinecap: "stroke-linecap",
  strokeLinejoin: "stroke-linejoin",
  strokeOpacity: "stroke-opacity",
  strokeWidth: "stroke-width",
  textLength: "textLength",
  lengthAdjust: "lengthAdjust",
  wordSpacing: "word-spacing",
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

const shouldApplySmallCaps = (options: generateOptions) =>
  Boolean(options.smallCaps || (options.allCaps && options.smallCapsScale !== undefined));

const getSmallCapsScale = (options: generateOptions) => {
  const scale = options.smallCapsScale as { scaleX?: number; scaleY?: number } | number | undefined;
  if (typeof scale === "number") return { scaleX: scale, scaleY: scale };
  return {
    scaleX: scale?.scaleX ?? DEFAULT_SMALL_CAPS_SCALE.scaleX,
    scaleY: scale?.scaleY ?? DEFAULT_SMALL_CAPS_SCALE.scaleY,
  };
};

const getSmallCapsStroke = (options: generateOptions) => options.smallCapsStroke ?? 0;

const getWordSpacing = (options: generateOptions) => options.wordSpacing ?? 0;

const isSmallCapsCharacter = (value: string) => /^[a-z\u00e0-\u00ff]$/.test(value);

const escapeAttributeValue = (value: unknown) => `${escape(String(value))}`;

const getSvgAttributeName = (key: string) => SVG_ATTRIBUTE_ALIASES[key] ?? key;

const isRenderableBracketAttributeValue = (value: unknown) =>
  typeof value === "string" || typeof value === "number" || typeof value === "boolean";

const getBracketCustomAttributes = (bracketOptions: NonNullable<generateOptions["brackets"]>) => {
  const attributes: Record<string, string | number | boolean> = {};

  for (const [key, value] of Object.entries(bracketOptions)) {
    if (BRACKET_SEMANTIC_KEYS.has(key) || !isRenderableBracketAttributeValue(value)) continue;

    const attributeName = getSvgAttributeName(key);
    if (SVG_ATTRIBUTE_NAME_PATTERN.test(attributeName)) attributes[attributeName] = value;
  }

  return attributes;
};

const getPositiveNumberOption = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;

const getBracketScale = (options: generateOptions) => ({
  scaleX: getPositiveNumberOption(options.brackets?.scaleX, 1),
  scaleY: getPositiveNumberOption(options.brackets?.scaleY, 1),
});

const getBracketFontSize = (options: generateOptions) => {
  const bracketOptions = options.brackets;
  const baseSize = getPositiveNumberOption(bracketOptions?.size, options.size);
  return baseSize * getBracketScale(options).scaleY;
};

const getBracketRunScaleX = (options: generateOptions) => {
  const scale = getBracketScale(options);
  return scale.scaleY === 0 ? 1 : scale.scaleX / scale.scaleY;
};

const decodeXmlEntity = (entity: string) => {
  const lookup: Record<string, string> = {
    "&amp;": "&",
    "&apos;": "'",
    "&gt;": ">",
    "&lt;": "<",
    "&quot;": '"',
  };
  return lookup[entity] ?? entity;
};

const countLetterSpacingSlots = (text: string, wordSpacing: number) => {
  if (wordSpacing !== 0) {
    let slots = 0;

    for (let index = 1; index < text.length; index += 1) {
      if (text[index - 1] !== " " && text[index] !== " ") slots += 1;
    }

    return slots;
  }

  return Math.max(0, text.length - 1);
};

const countWordSpacingSlots = (text: string) => text.split(" ").length - 1;

const getTextWidth = (
  text: string,
  fontFamily: string,
  fontSize: number,
  letterSpacing: number,
  wordSpacing: number,
  context: RenderContext
): number => {
  const fontInstance = requireFont(context, fontFamily);
  const glyph = fontInstance.layout(text);
  return (
    (glyph.advanceWidth / fontInstance.unitsPerEm) * fontSize +
    countLetterSpacingSlots(text, wordSpacing) * letterSpacing +
    countWordSpacingSlots(text) * wordSpacing
  );
};

const isBracketCharacter = (value: string) => value === "[" || value === "]";

const haveSameAttributes = (
  left: Record<string, string | number | boolean> | undefined,
  right: Record<string, string | number | boolean> | undefined
) => {
  const leftEntries = Object.entries(left ?? {});
  const rightRecord = right ?? {};

  return (
    leftEntries.length === Object.keys(rightRecord).length &&
    leftEntries.every(([key, value]) => rightRecord[key] === value)
  );
};

const pushTextRun = (runs: TextRun[], run: TextRun) => {
  const previous = runs[runs.length - 1];
  const crossesSpaceBoundary = Boolean(
    previous && (previous.measureText.endsWith(" ") || run.measureText.startsWith(" "))
  );
  if (
    previous &&
    !crossesSpaceBoundary &&
    previous.fontFamily === run.fontFamily &&
    previous.fontSize === run.fontSize &&
    previous.letterSpacing === run.letterSpacing &&
    previous.wordSpacing === run.wordSpacing &&
    previous.scaleX === run.scaleX &&
    haveSameAttributes(previous.attributes, run.attributes)
  ) {
    previous.text += run.text;
    previous.measureText += run.measureText;
  } else {
    runs.push(run);
  }
};

const getSmallCapsTextRuns = (inputText: string, options: generateOptions): TextRun[] => {
  const scale = getSmallCapsScale(options);
  const baseLetterSpacing = options.letterSpacing || 0;
  const baseWordSpacing = getWordSpacing(options);
  const runs: TextRun[] = [];

  for (let index = 0; index < inputText.length; index += 1) {
    const char = inputText[index];

    if (char === "&") {
      const entityEnd = inputText.indexOf(";", index);
      if (entityEnd !== -1) {
        const entity = inputText.slice(index, entityEnd + 1);
        pushTextRun(runs, {
          text: entity,
          measureText: decodeXmlEntity(entity),
          fontFamily: options.fontFamily,
          fontSize: options.size,
          letterSpacing: baseLetterSpacing,
          wordSpacing: baseWordSpacing,
          scaleX: 1,
        });
        index = entityEnd;
        continue;
      }
    }

    if (isSmallCapsCharacter(char)) {
      const runScaleX = scale.scaleY === 0 ? 1 : scale.scaleX / scale.scaleY;
      pushTextRun(runs, {
        text: char.toUpperCase(),
        measureText: char.toUpperCase(),
        fontFamily: options.fontFamily,
        fontSize: options.size * scale.scaleY,
        letterSpacing: runScaleX === 0 ? baseLetterSpacing : baseLetterSpacing / runScaleX,
        wordSpacing: 0,
        scaleX: runScaleX,
      });
      continue;
    }

    const bracketOptions = options.brackets && isBracketCharacter(char) ? options.brackets : undefined;
    pushTextRun(runs, {
      text: char,
      measureText: char,
      fontFamily: bracketOptions?.fontFamily ?? options.fontFamily,
      fontSize: bracketOptions ? getBracketFontSize(options) : options.size,
      letterSpacing: baseLetterSpacing,
      wordSpacing: baseWordSpacing,
      scaleX: bracketOptions ? getBracketRunScaleX(options) : 1,
      attributes: bracketOptions ? getBracketCustomAttributes(bracketOptions) : undefined,
    });
  }

  return runs;
};

const getAlignedTextStartX = (align: string | undefined, textBoxWidth: number, contentWidth: number) => {
  if (align === "right") return textBoxWidth - contentWidth;
  if (align === "center") return (textBoxWidth - contentWidth) / 2;
  return 0;
};

const shouldUsePositionedSmallCaps = (text: string, options: generateOptions) =>
  shouldApplySmallCaps(options) && !/<\/?tspan(?:\s|>)/i.test(text);

const getPositionedSmallCapsTextWidth = (inputText: string, options: generateOptions, context: RenderContext) =>
  getSmallCapsTextRuns(inputText, options).reduce(
    (width, run) =>
      width +
      getTextWidth(run.measureText, run.fontFamily, run.fontSize, run.letterSpacing, run.wordSpacing, context) *
        run.scaleX,
    0
  );

const renderPositionedSmallCapsText = (
  inputText: string,
  options: generateOptions,
  context: RenderContext,
  textBoxWidth: number,
  y: number,
  paint: TextPaint
) => {
  const runs = getSmallCapsTextRuns(inputText, options);
  const widths = runs.map((run) =>
    getTextWidth(run.measureText, run.fontFamily, run.fontSize, run.letterSpacing, run.wordSpacing, context) *
    run.scaleX
  );
  let x = getAlignedTextStartX(
    options.align,
    textBoxWidth,
    widths.reduce((sum, width) => sum + width, 0)
  );

  return runs
    .map((run, index) => {
      const commonAttributes = createPositionedTextAttributes(run, options, paint);
      const element =
        Math.abs(run.scaleX - 1) < 1e-9
          ? `<text x="${x}" y="${y}" ${commonAttributes}>${run.text}</text>`
          : `<g transform="translate(${x}, 0) scale(${run.scaleX}, 1)"><text x="0" y="${y}" ${commonAttributes} vector-effect="non-scaling-stroke">${run.text}</text></g>`;
      x += widths[index];
      return element;
    })
    .join("");
};

const createPositionedTextAttributes = (run: TextRun, options: generateOptions, paint: TextPaint) => {
  const customAttributes = run.attributes ?? {};
  const attributes: string[] = [];
  const usedAttributeNames = new Set<string>();
  const pushAttribute = (name: string, value: string | number | boolean | undefined) => {
    if (value === undefined || usedAttributeNames.has(name)) return;
    const nextValue = Object.prototype.hasOwnProperty.call(customAttributes, name) ? customAttributes[name] : value;
    usedAttributeNames.add(name);
    attributes.push(`${name}="${escapeAttributeValue(nextValue)}"`);
  };

  pushAttribute("fill", paint.fill);
  pushAttribute("letter-spacing", run.letterSpacing);
  pushAttribute("word-spacing", run.wordSpacing);
  pushAttribute("opacity", options.opacity);
  pushAttribute("font-weight", options.weight);
  pushAttribute("stroke-width", paint.strokeWidth);
  pushAttribute("stroke", paint.stroke);
  pushAttribute("stroke-linejoin", "round");
  pushAttribute("font-family", run.fontFamily);
  pushAttribute("font-size", `${run.fontSize}px`);
  pushAttribute("filter", paint.filter);

  for (const [name, value] of Object.entries(customAttributes)) {
    pushAttribute(name, value);
  }

  return attributes.join(" ");
};

const createSmallCapsRun = (text: string, options: generateOptions, context: RenderContext, strokeDelta: number) => {
  const scale = getSmallCapsScale(options);
  const convertedText = text.toUpperCase();
  const strokeWidth = (options.stroke || 0) + getSmallCapsStroke(options) + strokeDelta;
  return `<tspan font-size="${options.size * scale.scaleY}" stroke-width="${strokeWidth}" stroke-linejoin="round" letter-spacing="${
    options.letterSpacing || 0
  }">${convertedText}</tspan>`;
};

const styleTextSpacing = (inputText: string, wordSpacing: number, letterSpacing: number) => {
  if (wordSpacing === 0 && letterSpacing === 0) return inputText;

  let output = "";
  let pendingDx = 0;
  let previousToken = "";

  const appendTextToken = (textToken: string, measureToken: string) => {
    if (letterSpacing !== 0 && previousToken && previousToken !== " " && measureToken !== " ") {
      pendingDx += letterSpacing;
    }

    output += pendingDx !== 0 ? `<tspan dx="${pendingDx}">${textToken}</tspan>` : textToken;
    pendingDx = 0;

    if (measureToken === " ") pendingDx += wordSpacing;
    previousToken = measureToken;
  };

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
        appendTextToken(char, char);
        continue;
      }

      const entity = inputText.slice(index, entityEnd + 1);
      appendTextToken(entity, decodeXmlEntity(entity));
      index = entityEnd;
      continue;
    }

    appendTextToken(char, char);
  }

  return output;
};

const styleWordSpacing = (inputText: string, options: generateOptions) =>
  styleTextSpacing(inputText, getWordSpacing(options), 0);

const smallCapsConvert = (inputText: string, options: generateOptions, context: RenderContext, strokeDelta = 0) => {
  let output = "";
  let run = "";
  let inEntity = false;
  let inTag = false;

  const flushRun = () => {
    if (!run) return;
    output += createSmallCapsRun(run, options, context, strokeDelta);
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

const bracketGlyphAttributes = (bracket: string, options: generateOptions, context: RenderContext) => {
  const bracketOptions = options.brackets;
  if (!bracketOptions) return "";

  const attributes: string[] = [];
  const usedAttributeNames = new Set<string>();
  const pushAttribute = (name: string, value: string | number | boolean) => {
    if (usedAttributeNames.has(name)) return;
    usedAttributeNames.add(name);
    attributes.push(`${name}="${escapeAttributeValue(value)}"`);
  };

  const fontFamily = bracketOptions.fontFamily ?? options.fontFamily;
  const fontSize = getBracketFontSize(options);
  const runScaleX = getBracketRunScaleX(options);

  if (bracketOptions.fontFamily) pushAttribute("font-family", bracketOptions.fontFamily);
  if (bracketOptions.size !== undefined || bracketOptions.scaleY !== undefined) {
    pushAttribute("font-size", `${fontSize}px`);
  }
  if (Math.abs(runScaleX - 1) > 1e-9) {
    pushAttribute("textLength", getTextWidth(bracket, fontFamily, fontSize, 0, 0, context) * runScaleX);
    pushAttribute("lengthAdjust", "spacingAndGlyphs");
  }

  for (const [attributeName, value] of Object.entries(getBracketCustomAttributes(bracketOptions))) {
    pushAttribute(attributeName, value);
  }

  return attributes.length > 0 ? ` ${attributes.join(" ")}` : "";
};

const styleBracketGlyphs = (text: string, options: generateOptions, context: RenderContext) => {
  if (!options.brackets) return text;

  return text.replace(/[\[\]]/g, (bracket) => {
    const attributes = bracketGlyphAttributes(bracket, options, context);
    return attributes ? `<tspan${attributes}>${bracket}</tspan>` : bracket;
  });
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
  const y = options.baselineY ?? Math.ceil(options.size as number);
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
  const thinFilter = getThinAmount(options) > 0 ? "url(#thinFilter)" : undefined;
  const usesPositionedSmallCaps = shouldUsePositionedSmallCaps(text, options);
  let textWithStroke = "";
  let outline = "";
  let visibleTextElement = "";

  if (usesPositionedSmallCaps) {
    if (options.overrush) {
      textWithStroke = renderPositionedSmallCapsText(text, options, context, textBoxWidth, y, {
        fill: "#43161E",
        stroke: "#43161E",
        strokeWidth: (options.stroke || 0) + 2,
        filter: "url(#shadowFilter)",
      });
    }
    if (options.outline) {
      outline = renderPositionedSmallCapsText(text, options, context, textBoxWidth, y, {
        fill: options.outline.color,
        stroke: options.outline.color,
        strokeWidth: options.outline.width + (options.stroke || 0),
      });
    }
    visibleTextElement = renderPositionedSmallCapsText(text, options, context, textBoxWidth, y, {
      fill: options.overrush ? "url(#bgimg)" : options.color,
      stroke: options.color,
      strokeWidth: options.stroke || 0,
      filter: thinFilter,
    });
  } else {
    if (shouldApplySmallCaps(options)) {
      textWithStroke = `<text ${position} fill="#43161E" letter-spacing="${options.letterSpacing}" opacity="${
        options.opacity
      }" font-weight="${options.weight}" stroke-width="${
        (options.stroke || 0) + 2
      }" stroke="#43161E" font-family="${options.fontFamily}" font-size="${
        options.size
      }px" filter="url(#shadowFilter)">${styleWordSpacing(
        styleBracketGlyphs(smallCapsConvert(text, options, context, 2), options, context),
        options
      )}</text>`;
      text = smallCapsConvert(text, options, context);
    }

    outline = options.outline
      ? `<text ${position} fill="${options.outline.color}" letter-spacing="${options.letterSpacing}" opacity="${
          options.opacity
        }" font-weight="${options.weight}" stroke-width="${
          options.outline.width + (options.stroke || 0)
        }" stroke="${options.outline.color}" font-family="${options.fontFamily}" font-size="${
          options.size
        }px">${styleWordSpacing(
          styleBracketGlyphs(text, options, context),
          options
        )}</text>`
      : "";

    const visibleText = styleWordSpacing(styleBracketGlyphs(text, options, context), options);
    visibleTextElement = `<text ${position} fill="${options.overrush ? "url(#bgimg)" : options.color}" letter-spacing="${
      options.letterSpacing
    }" opacity="${options.opacity}" font-weight="${options.weight}" stroke-width="${options.stroke}" stroke="${
      options.color
    }" font-family="${options.fontFamily}" font-size="${options.size}px"${
      thinFilter ? ` filter="${thinFilter}"` : ""
    }>${visibleText}</text>`;
  }
  const svgString = `
    <svg width="${svgWidth}" height="${svgHeight}">
      ${createDefs(options, context, svgWidth, svgHeight)}
      ${background}
      <g transform="translate(${options.offsetX}, 0)">
        <g transform="scale(${options.scaleX}, ${options.scaleY})">
          ${outline}
          ${options.overrush && textWithStroke ? textWithStroke : ""}
          ${visibleTextElement}
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

const getFiniteNumberOption = (value: unknown, fallback?: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const getLineEndingSettings = (options: generateOptions): LineEndingSettings => {
  const fitOptions = options.sizeScaleYFit;
  const minLineFillRatio = getFiniteNumberOption(options.minLineFillRatio ?? fitOptions?.minLineFillRatio, 0) as number;

  return {
    trimLineEndings: Boolean(options.trimLineEndings ?? fitOptions?.trimLineEndings),
    justifyLineEndings: Boolean(options.justifyLineEndings ?? fitOptions?.justifyLineEndings),
    justifyLastLine: Boolean(options.justifyLastLine ?? fitOptions?.justifyLastLine),
    maxLineWordSpacing: getFiniteNumberOption(options.maxLineWordSpacing ?? fitOptions?.maxLineWordSpacing),
    minLineFillRatio: Math.max(0, Math.min(minLineFillRatio, 1)),
  };
};

const getUnscaledTextBoxWidth = (options: generateOptions) => {
  const scaleX = Math.abs(options.scaleX || 1);
  return scaleX > 0 ? options.width / scaleX : options.width;
};

const countJustifiableWordSpaces = (line: string) => {
  const trimmed = line.trim();
  return trimmed ? trimmed.split(" ").length - 1 : 0;
};

const countJustifiableLetterSpaces = (line: string) => {
  let slots = 0;

  for (let index = 1; index < line.length; index += 1) {
    if (line[index - 1] !== " " && line[index] !== " ") slots += 1;
  }

  return slots;
};

const getJustifiedLine = (
  line: string,
  lineIndex: number,
  lineCount: number,
  options: generateOptions,
  settings: LineEndingSettings,
  context: RenderContext
): TextBlockLine => {
  const baseWordSpacing = getWordSpacing(options);
  const isLastLine = lineIndex === lineCount - 1;
  const unjustifiedLine = { text: line, wordSpacing: baseWordSpacing, letterSpacing: 0 };
  if (!settings.justifyLineEndings || (isLastLine && !settings.justifyLastLine)) return unjustifiedLine;

  const targetWidth = getUnscaledTextBoxWidth(options);
  const lineWidth = getTxtWidth(line, { ...options, scaleX: 1 }, context);
  if (targetWidth <= 0 || lineWidth <= 0 || lineWidth / targetWidth < settings.minLineFillRatio) {
    return unjustifiedLine;
  }

  const availableSpacing = targetWidth - lineWidth;
  if (availableSpacing <= 0) return unjustifiedLine;

  const wordSpaceCount = countJustifiableWordSpaces(line);
  const addedWordSpacing =
    wordSpaceCount > 0
      ? Math.min(availableSpacing / wordSpaceCount, settings.maxLineWordSpacing ?? availableSpacing)
      : 0;
  const remainingSpacing = availableSpacing - addedWordSpacing * wordSpaceCount;
  const letterSpaceCount = countJustifiableLetterSpaces(line);
  const addedLetterSpacing = letterSpaceCount > 0 ? Math.max(0, remainingSpacing) / letterSpaceCount : 0;

  return {
    text: line,
    wordSpacing: baseWordSpacing + addedWordSpacing,
    letterSpacing: addedLetterSpacing,
  };
};

const getTextBlockLines = (
  lines: string[],
  options: generateOptions,
  context: RenderContext
): { lines: TextBlockLine[]; manualWordSpacing: boolean } => {
  const settings = getLineEndingSettings(options);
  const normalizedLines = settings.trimLineEndings ? lines.map((line) => line.trimEnd()) : lines;
  const manualWordSpacing = settings.justifyLineEndings;

  return {
    manualWordSpacing,
    lines: normalizedLines.map((line, index) => ({
      ...(manualWordSpacing
        ? getJustifiedLine(line, index, normalizedLines.length, options, settings, context)
        : { text: line, wordSpacing: getWordSpacing(options), letterSpacing: 0 }),
    })),
  };
};

const renderTextBlockLine = (
  line: TextBlockLine,
  index: number,
  lineHeight: number,
  options: generateOptions,
  manualWordSpacing: boolean
) => {
  const escapedLine = `${escape(line.text)}`;
  const lineText = manualWordSpacing
    ? styleTextSpacing(escapedLine, line.wordSpacing, line.letterSpacing)
    : escapedLine;

  return `<tspan x="0" dy="${index === 0 ? "0" : `${lineHeight}em`}">${lineText}</tspan>`;
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
    const escapedText = `${escape(text)}`;
    const unscaledOptions = { ...inputOptions, scaleX: 1 };
    const rawWidth = Math.ceil(
      shouldUsePositionedSmallCaps(escapedText, inputOptions)
        ? getPositionedSmallCapsTextWidth(escapedText, unscaledOptions, context)
        : getTxtWidth(text, unscaledOptions, context)
    );
    const textBoxWidth = rawWidth + (inputOptions.outline?.width || 0);
    const contentWidth = Math.ceil(Math.min(textBoxWidth * scaleX, inputOptions.width));
    const fittedScaleX = textBoxWidth > 0 ? contentWidth / textBoxWidth : scaleX;

    return sharp(
      createTextLineBuffer(
        escapedText,
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

  const fontSize = calculateMaxFont(text, inputOptions, context);
  const wasResized = fontSize < inputOptions.size;
  const options = { ...inputOptions, size: fontSize };
  const layout = getFittedTextBlockLayout(text, options, context, { expandLineHeight: wasResized });
  const textBlock = getTextBlockLines(layout.lines, options, context);
  const textBuffer = textBlock.lines
    .map((line, index) => renderTextBlockLine(line, index, layout.lineHeight, options, textBlock.manualWordSpacing))
    .join("");

  return createTextLineBuffer(
    textBuffer,
    {
      ...options,
      baselineY: layout.baselineY,
      lineHeight: layout.lineHeight,
      wordSpacing: textBlock.manualWordSpacing ? 0 : options.wordSpacing,
    },
    context
  );
};

export { textGenerate };

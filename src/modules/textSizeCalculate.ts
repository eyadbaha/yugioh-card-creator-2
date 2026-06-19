import { requireFont, type RenderContext } from "./renderContext.js";
import type { generateOptions } from "./types.js";

type TextOptions = Partial<generateOptions>;

type TextLineBounds = {
  top: number;
  bottom: number;
};

type TextBlockLayout = {
  lines: TextBlockLayoutLine[];
  lineHeight: number;
  baselineY: number;
  height: number;
};

type TextBlockLayoutLine = {
  text: string;
  isParagraphEnd: boolean;
};

type TextBlockLayoutOptions = {
  expandLineHeight?: boolean;
};

const defaultTextOptions = {
  fontFamily: "MatrixBold",
  size: 20,
  width: 550,
  lineHeight: 1,
  height: 118,
  scaleX: 1,
  scaleY: 1,
  letterSpacing: 0,
  wordSpacing: 0,
};

const DEFAULT_SMALL_CAPS_SCALE = { scaleX: 0.8, scaleY: 0.8 };
const FONT_FIT_PRECISION = 0.1;

const normalizeOptions = (inputOptions: TextOptions = {}) => ({
  ...defaultTextOptions,
  ...inputOptions,
});

const shouldApplySmallCaps = (options: TextOptions) =>
  Boolean(options.smallCaps || (options.allCaps && options.smallCapsScale !== undefined));

const getSmallCapsScale = (options: TextOptions) => {
  const scale = options.smallCapsScale as { scaleX?: number; scaleY?: number } | number | undefined;
  if (typeof scale === "number") return { scaleX: scale, scaleY: scale };
  return {
    scaleX: scale?.scaleX ?? DEFAULT_SMALL_CAPS_SCALE.scaleX,
    scaleY: scale?.scaleY ?? DEFAULT_SMALL_CAPS_SCALE.scaleY,
  };
};

const getPositiveNumberOption = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;

const getBracketScale = (options: TextOptions) => ({
  scaleX: getPositiveNumberOption(options.brackets?.scaleX, 1),
  scaleY: getPositiveNumberOption(options.brackets?.scaleY, 1),
});

const isSmallCapsCharacter = (value: string) => /^[a-z\u00e0-\u00ff]$/.test(value);

const countWordSpacingSlots = (text: string) => text.split(" ").length - 1;

const countLetterSpacingSlots = (text: string, options: TextOptions) => {
  if ((options.wordSpacing ?? defaultTextOptions.wordSpacing) !== 0) {
    let slots = 0;

    for (let index = 1; index < text.length; index += 1) {
      if (text[index - 1] !== " " && text[index] !== " ") slots += 1;
    }

    return slots;
  }

  return Math.max(0, text.length - 1);
};

const calcWidthWithLetterSpacing = (
  text: string,
  inputOptions: TextOptions,
  context: RenderContext,
  letterSpacingSlots?: number
): number => {
  const options = normalizeOptions(inputOptions);
  const fontInstance = requireFont(context, options.fontFamily);
  const glyph = fontInstance.layout(text);
  const spacingSlots = letterSpacingSlots ?? countLetterSpacingSlots(text, options);

  return (
    ((glyph.advanceWidth / fontInstance.unitsPerEm) * options.size +
      spacingSlots * options.letterSpacing +
      countWordSpacingSlots(text) * options.wordSpacing) *
    1.005 *
    options.scaleX
  );
};

const calcWidth = (text: string, inputOptions: TextOptions, context: RenderContext): number =>
  calcWidthWithLetterSpacing(text, inputOptions, context);

const mergeBounds = (bounds: TextLineBounds[]): TextLineBounds => {
  const populated = bounds.filter((bound) => Number.isFinite(bound.top) && Number.isFinite(bound.bottom));
  if (populated.length === 0) return { top: 0, bottom: 0 };

  return {
    top: Math.min(...populated.map((bound) => bound.top)),
    bottom: Math.max(...populated.map((bound) => bound.bottom)),
  };
};

const getFontFallbackBounds = (options: TextOptions, context: RenderContext): TextLineBounds => {
  const normalized = normalizeOptions(options);
  const fontInstance = requireFont(context, normalized.fontFamily);
  const scale = normalized.size / fontInstance.unitsPerEm;

  return {
    top: -fontInstance.ascent * scale,
    bottom: Math.abs(fontInstance.descent) * scale,
  };
};

const getLineBoundsForOptions = (text: string, inputOptions: TextOptions, context: RenderContext): TextLineBounds => {
  if (!text) return getFontFallbackBounds(inputOptions, context);

  const options = normalizeOptions(inputOptions);
  const fontInstance = requireFont(context, options.fontFamily);
  const glyphRun = fontInstance.layout(text) as { bbox?: { minY: number; maxY: number } };
  const bbox = glyphRun.bbox;

  if (!bbox) return getFontFallbackBounds(options, context);

  const scale = options.size / fontInstance.unitsPerEm;
  return {
    top: -bbox.maxY * scale,
    bottom: -bbox.minY * scale,
  };
};

const hasBracketStyles = (textOptions: TextOptions) =>
  Boolean(
    textOptions.brackets?.fontFamily ||
      textOptions.brackets?.size !== undefined ||
      textOptions.brackets?.scaleX !== undefined ||
      textOptions.brackets?.scaleY !== undefined
  );

const bracketTextOptions = (textOptions: TextOptions): TextOptions => {
  const bracketOptions = textOptions.brackets;
  const options: TextOptions = { ...textOptions, brackets: undefined };
  const bracketScale = getBracketScale(textOptions);
  const bracketScaleX = bracketScale.scaleY === 0 ? 1 : bracketScale.scaleX / bracketScale.scaleY;

  if (bracketOptions?.fontFamily !== undefined) options.fontFamily = bracketOptions.fontFamily;
  options.size = getPositiveNumberOption(
    bracketOptions?.size,
    options.size ?? defaultTextOptions.size
  ) * bracketScale.scaleY;
  options.scaleX = (textOptions.scaleX ?? defaultTextOptions.scaleX) * bracketScaleX;

  return options;
};

const getTxtWidthWithoutBracketStyles = (
  text: string,
  textOptions: TextOptions,
  context: RenderContext
): number => {
  if (shouldApplySmallCaps(textOptions)) {
    const smallCapsScale = getSmallCapsScale(textOptions);
    const smallCapsSize = (textOptions.size ?? defaultTextOptions.size) * smallCapsScale.scaleX;
    const runs: { text: string; smallCaps: boolean }[] = [];

    for (const char of text) {
      const smallCaps = isSmallCapsCharacter(char);
      const previousRun = runs[runs.length - 1];
      if (previousRun?.smallCaps === smallCaps) {
        previousRun.text += char;
      } else {
        runs.push({ text: char, smallCaps });
      }
    }

    return runs.reduce((width, run) => {
      const options = run.smallCaps ? { ...textOptions, size: smallCapsSize } : textOptions;
      return (
        width +
        calcWidthWithLetterSpacing(
          run.smallCaps ? run.text.toUpperCase() : run.text,
          options,
          context,
          countLetterSpacingSlots(run.text, options)
        )
      );
    }, 0);
  }

  return calcWidth(text, textOptions, context);
};

const getLineBoundsWithoutBracketStyles = (
  text: string,
  textOptions: TextOptions,
  context: RenderContext
): TextLineBounds => {
  if (shouldApplySmallCaps(textOptions)) {
    const smallCapsScale = getSmallCapsScale(textOptions);
    const smallCapsSize = (textOptions.size ?? defaultTextOptions.size) * smallCapsScale.scaleY;
    const runs: { text: string; smallCaps: boolean }[] = [];

    for (const char of text) {
      const smallCaps = isSmallCapsCharacter(char);
      const previousRun = runs[runs.length - 1];
      if (previousRun?.smallCaps === smallCaps) {
        previousRun.text += char;
      } else {
        runs.push({ text: char, smallCaps });
      }
    }

    return mergeBounds(
      runs.map((run) =>
        getLineBoundsForOptions(
          run.smallCaps ? run.text.toUpperCase() : run.text,
          run.smallCaps ? { ...textOptions, size: smallCapsSize } : textOptions,
          context
        )
      )
    );
  }

  return getLineBoundsForOptions(text, textOptions, context);
};

const getTxtWidth = (text: string, inputOptions: TextOptions | undefined, context: RenderContext): number => {
  const textOptions = inputOptions ?? {};

  if (hasBracketStyles(textOptions) && /[\[\]]/.test(text)) {
    let width = 0;
    let textRun = "";

    for (const char of text) {
      if (char === "[" || char === "]") {
        width += getTxtWidthWithoutBracketStyles(textRun, textOptions, context);
        width += calcWidth(char, bracketTextOptions(textOptions), context);
        textRun = "";
      } else {
        textRun += char;
      }
    }

    return width + getTxtWidthWithoutBracketStyles(textRun, textOptions, context);
  }

  return getTxtWidthWithoutBracketStyles(text, textOptions, context);
};

const getLineBounds = (text: string, inputOptions: TextOptions | undefined, context: RenderContext): TextLineBounds => {
  const textOptions = inputOptions ?? {};

  if (hasBracketStyles(textOptions) && /[\[\]]/.test(text)) {
    const bounds: TextLineBounds[] = [];
    let textRun = "";

    for (const char of text) {
      if (char === "[" || char === "]") {
        if (textRun) bounds.push(getLineBoundsWithoutBracketStyles(textRun, textOptions, context));
        bounds.push(getLineBoundsForOptions(char, bracketTextOptions(textOptions), context));
        textRun = "";
      } else {
        textRun += char;
      }
    }

    if (textRun) bounds.push(getLineBoundsWithoutBracketStyles(textRun, textOptions, context));
    return mergeBounds(bounds);
  }

  return getLineBoundsWithoutBracketStyles(text, textOptions, context);
};

const wrapTextBlockLines = (
  text: string,
  inputOptions: TextOptions | undefined,
  context: RenderContext
): TextBlockLayoutLine[] => {
  const options = normalizeOptions(inputOptions);
  const wrappedLines: TextBlockLayoutLine[] = [];

  for (const sourceLine of text.split(/\n/)) {
    let line = "";

    for (const word of sourceLine.split(" ")) {
      const nextLine = `${line}${word} `;
      if (line && getTxtWidth(nextLine, options, context) > options.width) {
        wrappedLines.push({ text: line, isParagraphEnd: false });
        line = "";
      }

      line += `${word} `;
    }

    wrappedLines.push({ text: line, isParagraphEnd: true });
  }

  return wrappedLines;
};

const wrapLines = (text: string, inputOptions: TextOptions | undefined, context: RenderContext): string[] =>
  wrapTextBlockLines(text, inputOptions, context).map((line) => line.text);

const getTextBlockLineText = (line: string | TextBlockLayoutLine): string =>
  typeof line === "string" ? line : line.text;

const getRenderedScaleY = (options: TextOptions) => Math.abs(options.scaleY || defaultTextOptions.scaleY);

const getTextBlockBounds = (
  lines: Array<string | TextBlockLayoutLine>,
  inputOptions: TextOptions | undefined,
  context: RenderContext,
  lineHeightOverride?: number
): TextLineBounds => {
  const options = normalizeOptions(inputOptions);
  const lineHeight = lineHeightOverride ?? options.lineHeight;
  const lineAdvance = options.size * lineHeight;

  return lines.reduce<TextLineBounds>(
    (bounds, line, index) => {
      const lineBounds = getLineBounds(getTextBlockLineText(line), options, context);
      const baseline = index * lineAdvance;

      return {
        top: Math.min(bounds.top, baseline + lineBounds.top),
        bottom: Math.max(bounds.bottom, baseline + lineBounds.bottom),
      };
    },
    { top: Number.POSITIVE_INFINITY, bottom: Number.NEGATIVE_INFINITY }
  );
};

const getTextBlockHeight = (
  text: string,
  inputOptions: TextOptions | undefined,
  context: RenderContext,
  lineHeightOverride?: number
) => {
  const options = normalizeOptions(inputOptions);
  const lines = wrapTextBlockLines(text, options, context);
  const bounds = getTextBlockBounds(lines, options, context, lineHeightOverride);
  return (bounds.bottom - bounds.top) * getRenderedScaleY(options);
};

const getTxtHeight = (text: string, inputOptions: TextOptions | undefined, context: RenderContext) => {
  return getTextBlockHeight(text, inputOptions, context);
};

const calculateMaxFont = (text: string, inputOptions: TextOptions | undefined, context: RenderContext): number => {
  const options = normalizeOptions(inputOptions);
  if (getTxtHeight(text, options, context) <= options.height) return options.size;

  const floorSize = Math.min(6, options.size);
  let bestSize = floorSize;

  let low = floorSize;
  let high = options.size;
  for (let index = 0; index < 24; index += 1) {
    const size = (low + high) / 2;
    const fits = getTxtHeight(text, { ...options, size }, context) <= options.height;

    if (fits) {
      bestSize = size;
      low = size;
    } else {
      high = size;
    }
  }

  return Number((Math.floor((bestSize + 1e-6) / FONT_FIT_PRECISION) * FONT_FIT_PRECISION).toFixed(3));
};

const getFittedTextBlockLayout = (
  text: string,
  inputOptions: TextOptions | undefined,
  context: RenderContext,
  layoutOptions: TextBlockLayoutOptions = {}
): TextBlockLayout => {
  const options = normalizeOptions(inputOptions);
  const lines = wrapTextBlockLines(text, options, context);
  let lineHeight = options.lineHeight;
  let bounds = getTextBlockBounds(lines, options, context, lineHeight);
  const targetHeight = options.height / getRenderedScaleY(options);

  if (
    (layoutOptions.expandLineHeight ?? true) &&
    inputOptions?.lineHeight === undefined &&
    lines.length > 1 &&
    bounds.bottom - bounds.top > 0
  ) {
    let low = 0.1;
    let high = Math.max(lineHeight, targetHeight / options.size + 1);

    for (let index = 0; index < 24; index += 1) {
      const nextLineHeight = (low + high) / 2;
      const nextBounds = getTextBlockBounds(lines, options, context, nextLineHeight);
      const nextHeight = nextBounds.bottom - nextBounds.top;

      if (nextHeight <= targetHeight) {
        lineHeight = nextLineHeight;
        bounds = nextBounds;
        low = nextLineHeight;
      } else {
        high = nextLineHeight;
      }
    }
  }

  return {
    lines,
    lineHeight,
    baselineY: -bounds.top,
    height: (bounds.bottom - bounds.top) * getRenderedScaleY(options),
  };
};

const calculateMaxScale = (
  text: string,
  inputOptions: TextOptions | undefined,
  context: RenderContext
): { scaleX: number; scaleY: number } => {
  const options = normalizeOptions(inputOptions);
  const width = getTxtWidth(text, options, context);
  if (width * options.scaleX > options.width) return { scaleX: options.width / width, scaleY: options.scaleY };
  return { scaleX: options.scaleX, scaleY: options.scaleY };
};

export { calculateMaxFont, calculateMaxScale, getFittedTextBlockLayout, getTxtWidth, wrapLines };

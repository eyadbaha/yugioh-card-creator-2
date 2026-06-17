import { requireFont, type RenderContext } from "./renderContext.js";
import type { generateOptions } from "./types.js";

type TextOptions = Partial<generateOptions>;

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

const DEFAULT_SMALL_CAPS_SCALE = 0.8;

const normalizeOptions = (inputOptions: TextOptions = {}) => ({
  ...defaultTextOptions,
  ...inputOptions,
});

const shouldApplySmallCaps = (options: TextOptions) =>
  Boolean(options.smallCaps || (options.allCaps && options.smallCapsScale !== undefined));

const getSmallCapsScale = (options: TextOptions) => options.smallCapsScale ?? DEFAULT_SMALL_CAPS_SCALE;

const isSmallCapsCharacter = (value: string) => /^[a-z\u00e0-\u00ff]$/.test(value);

const countWordSpacingSlots = (text: string) => text.split(" ").length - 1;

const calcWidthWithLetterSpacing = (
  text: string,
  inputOptions: TextOptions,
  context: RenderContext,
  letterSpacingSlots = text.length
): number => {
  const options = normalizeOptions(inputOptions);
  const fontInstance = requireFont(context, options.fontFamily);
  const glyph = fontInstance.layout(text);

  return (
    ((glyph.advanceWidth / fontInstance.unitsPerEm) * options.size +
      letterSpacingSlots * options.letterSpacing +
      countWordSpacingSlots(text) * options.wordSpacing) *
    1.005 *
    options.scaleX
  );
};

const calcWidth = (text: string, inputOptions: TextOptions, context: RenderContext): number =>
  calcWidthWithLetterSpacing(text, inputOptions, context);

const hasBracketStyles = (textOptions: TextOptions) =>
  Boolean(textOptions.brackets?.fontFamily || textOptions.brackets?.size !== undefined);

const bracketTextOptions = (textOptions: TextOptions): TextOptions => {
  const bracketOptions = textOptions.brackets;
  const options: TextOptions = { ...textOptions, brackets: undefined };

  if (bracketOptions?.fontFamily !== undefined) options.fontFamily = bracketOptions.fontFamily;
  if (bracketOptions?.size !== undefined) options.size = bracketOptions.size;

  return options;
};

const getTxtWidthWithoutBracketStyles = (
  text: string,
  textOptions: TextOptions,
  context: RenderContext
): number => {
  if (shouldApplySmallCaps(textOptions)) {
    const smallCapsSize = (textOptions.size ?? defaultTextOptions.size) * getSmallCapsScale(textOptions);
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
          Math.max(0, run.text.length - 1)
        )
      );
    }, 0);
  }

  return calcWidth(text, textOptions, context);
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

const wrapLines = (text: string, inputOptions: TextOptions | undefined, context: RenderContext): string[] => {
  const options = normalizeOptions(inputOptions);
  const wrappedLines: string[] = [];

  for (const sourceLine of text.split(/\n/)) {
    let line = "";

    for (const word of sourceLine.split(" ")) {
      const nextLine = `${line}${word} `;
      if (line && getTxtWidth(nextLine, options, context) > options.width) {
        wrappedLines.push(line);
        line = "";
      }

      line += `${word} `;
    }

    wrappedLines.push(line);
  }

  return wrappedLines;
};

const getTxtHeight = (text: string, inputOptions: TextOptions | undefined, context: RenderContext) => {
  const options = normalizeOptions(inputOptions);
  return wrapLines(text, options, context).length * options.size * options.lineHeight;
};

const calculateMaxFont = (text: string, inputOptions: TextOptions | undefined, context: RenderContext): number => {
  const options = normalizeOptions(inputOptions);
  const floorSize = Math.min(6, options.size);
  const maxSteps = Math.max(0, Math.ceil((options.size - floorSize) / 0.5));
  let bestStep = maxSteps;

  let low = 0;
  let high = maxSteps;
  while (low <= high) {
    const step = Math.floor((low + high) / 2);
    const size = options.size - step * 0.5;
    const fits = getTxtHeight(text, { ...options, size }, context) <= options.height;

    if (fits) {
      bestStep = step;
      high = step - 1;
    } else {
      low = step + 1;
    }
  }

  return options.size - bestStep * 0.5;
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

export { calculateMaxFont, calculateMaxScale, getTxtWidth, wrapLines };

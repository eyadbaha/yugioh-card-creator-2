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
};

const smallCapsPattern = /[a-z\u00e0-\u00ff]/g;

const normalizeOptions = (inputOptions: TextOptions = {}) => ({
  ...defaultTextOptions,
  ...inputOptions,
});

const calcWidth = (text: string, inputOptions: TextOptions, context: RenderContext): number => {
  const options = normalizeOptions(inputOptions);
  const fontInstance = requireFont(context, options.fontFamily);
  const glyph = fontInstance.layout(text);

  return (
    ((glyph.advanceWidth / fontInstance.unitsPerEm) * options.size + text.length * options.letterSpacing) *
    1.005 *
    options.scaleX
  );
};

const getTxtWidth = (text: string, inputOptions: TextOptions | undefined, context: RenderContext): number => {
  const textOptions = inputOptions ?? {};
  if (textOptions.smallCaps) {
    const smallCapsSize = (textOptions.size ?? defaultTextOptions.size) * 0.8;
    const smallCaps = text.match(smallCapsPattern)?.join("")?.toUpperCase() || "";
    const nonSmallCaps = text.replace(smallCapsPattern, "") || "";

    return (
      calcWidth(smallCaps, { ...textOptions, size: smallCapsSize }, context) +
      calcWidth(nonSmallCaps, textOptions, context)
    );
  }

  return calcWidth(text, textOptions, context);
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
  const width = getTxtWidth(text, options, context) + text.length * options.letterSpacing;
  if (width * options.scaleX > options.width) return { scaleX: options.width / width, scaleY: options.scaleY };
  return { scaleX: options.scaleX, scaleY: options.scaleY };
};

export { calculateMaxFont, calculateMaxScale, getTxtWidth, wrapLines };

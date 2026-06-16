import sharp from "sharp";
import type { RenderContext } from "./renderContext.js";
import { textGenerate } from "./textGenerate.js";
import { getTxtWidth } from "./textSizeCalculate.js";
import type { generateOptions } from "./types.js";

type ImageFormat = "jpeg" | "png";
type ImageResizeOptions = sharp.ResizeOptions;
type ImageDimensions = { width: number; height: number };

type RenderSource =
  | Buffer
  | string
  | {
      kind: "text";
      text: string;
      options: generateOptions;
    }
  | {
      kind: "resizedImage";
      input: Buffer;
      resize: ImageResizeOptions;
    }
  | {
      kind: "imageSizedTo";
      input: Buffer;
      dimensions: ImageDimensions;
      format?: ImageFormat;
      resize?: ImageResizeOptions;
    }
  | {
      kind: "solidImage";
      width: number;
      height: number;
      channels: 3 | 4;
      background: sharp.Color;
      format?: ImageFormat;
    };

type RenderPosition =
  | number
  | {
      kind: "textWidthOffset";
      text: string;
      options: generateOptions;
      offset: number;
    }
  | {
      kind: "afterMeasuredTextIcon";
      text: string;
      options: generateOptions;
      typeLeft: number;
      iconWidth: number;
      typeSize: number;
    };

interface RenderOverlay extends Omit<sharp.OverlayOptions, "input" | "left" | "top"> {
  input: RenderSource;
  left?: RenderPosition;
  top?: RenderPosition;
}

type StyledCardRender = {
  base: RenderSource;
  overlays: RenderOverlay[];
};

const textInput = (text: string, options: generateOptions): RenderSource => ({
  kind: "text",
  text,
  options,
});

const resizedImageInput = (input: Buffer, resize: ImageResizeOptions): RenderSource => ({
  kind: "resizedImage",
  input,
  resize,
});

const imageSizedToInput = (
  input: Buffer,
  dimensions: ImageDimensions,
  format?: ImageFormat,
  resize?: ImageResizeOptions
): RenderSource => ({
  kind: "imageSizedTo",
  input,
  dimensions,
  format,
  resize,
});

const solidImageInput = (
  width: number,
  height: number,
  channels: 3 | 4,
  background: sharp.Color,
  format?: ImageFormat
): RenderSource => ({
  kind: "solidImage",
  width,
  height,
  channels,
  background,
  format,
});

const textWidthOffset = (text: string, options: generateOptions, offset: number): RenderPosition => ({
  kind: "textWidthOffset",
  text,
  options,
  offset,
});

const afterMeasuredTextIcon = (
  text: string,
  options: generateOptions,
  typeLeft: number,
  iconWidth: number,
  typeSize: number
): RenderPosition => ({
  kind: "afterMeasuredTextIcon",
  text,
  options,
  typeLeft,
  iconWidth,
  typeSize,
});

const applyFormat = (image: sharp.Sharp, format?: ImageFormat) => {
  if (format === "jpeg") return image.jpeg();
  if (format === "png") return image.png();
  return image;
};

const resolveSource = async (source: RenderSource, context: RenderContext): Promise<Buffer | string> => {
  if (typeof source === "string" || Buffer.isBuffer(source)) return source;

  switch (source.kind) {
    case "text":
      return textGenerate(source.text, source.options, context);
    case "resizedImage":
      return sharp(source.input).resize(source.resize).toBuffer();
    case "imageSizedTo": {
      return applyFormat(
        sharp(source.input).resize({
          width: source.dimensions.width,
          height: source.dimensions.height,
          fit: "fill",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
          ...source.resize,
        }),
        source.format
      ).toBuffer();
    }
    case "solidImage":
      return applyFormat(
        sharp({
          create: {
            width: source.width,
            height: source.height,
            channels: source.channels,
            background: source.background,
          },
        }),
        source.format
      ).toBuffer();
  }
};

const resolvePosition = (position: RenderPosition | undefined, context: RenderContext): number | undefined => {
  if (position === undefined || typeof position === "number") return position;

  if (position.kind === "textWidthOffset") {
    return Math.ceil(position.offset + getTxtWidth(position.text, position.options, context));
  }

  const iconLeft = Math.ceil(
    position.typeLeft + getTxtWidth(position.text, position.options, context) + position.iconWidth / 2
  );
  return Math.ceil(iconLeft + position.iconWidth + position.typeSize * 0.1);
};

const resolveOverlay = async (overlay: RenderOverlay, context: RenderContext): Promise<sharp.OverlayOptions> => {
  const { input, left, top, ...options } = overlay;
  const resolvedOverlay: sharp.OverlayOptions = {
    ...options,
    input: await resolveSource(input, context),
  };
  const resolvedLeft = resolvePosition(left, context);
  const resolvedTop = resolvePosition(top, context);

  if (resolvedLeft !== undefined) resolvedOverlay.left = resolvedLeft;
  if (resolvedTop !== undefined) resolvedOverlay.top = resolvedTop;

  return resolvedOverlay;
};

const readEnvInt = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const readWebpOptions = (): sharp.WebpOptions => ({
  quality: readEnvInt(process.env.WEBP_QUALITY, 94),
  effort: readEnvInt(process.env.WEBP_EFFORT, 4),
});

const renderCardImage = async ({ base, overlays }: StyledCardRender, context: RenderContext) => {
  const [baseInput, resolvedOverlays] = await Promise.all([
    resolveSource(base, context),
    Promise.all(overlays.map((overlay) => resolveOverlay(overlay, context))),
  ]);

  return sharp(baseInput).composite(resolvedOverlays).webp(readWebpOptions()).toBuffer();
};

export {
  afterMeasuredTextIcon,
  imageSizedToInput,
  renderCardImage,
  resizedImageInput,
  solidImageInput,
  textInput,
  textWidthOffset,
  type RenderOverlay,
  type RenderPosition,
  type RenderSource,
  type ImageResizeOptions,
  type ImageDimensions,
  type StyledCardRender,
};

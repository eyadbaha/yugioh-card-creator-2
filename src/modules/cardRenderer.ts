import sharp from "sharp";
import { textGenerate } from "./textGenerate.js";
import { getTxtWidth } from "./textSizeCalculate.js";
import type { generateOptions } from "./types.js";

type ImageFormat = "jpeg" | "png";
type ImageResizeOptions = sharp.ResizeOptions;

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
      metadataSource: string;
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
  metadataSource: string,
  format?: ImageFormat,
  resize?: ImageResizeOptions
): RenderSource => ({
  kind: "imageSizedTo",
  input,
  metadataSource,
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

const resolveSource = async (source: RenderSource): Promise<Buffer | string> => {
  if (typeof source === "string" || Buffer.isBuffer(source)) return source;

  switch (source.kind) {
    case "text":
      return textGenerate(source.text, source.options);
    case "resizedImage":
      return sharp(source.input).resize(source.resize).toBuffer();
    case "imageSizedTo": {
      const metadata = await sharp(source.metadataSource).metadata();
      return applyFormat(
        sharp(source.input).resize({
          width: metadata.width as number,
          height: metadata.height as number,
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

const resolvePosition = (position?: RenderPosition): number | undefined => {
  if (position === undefined || typeof position === "number") return position;

  if (position.kind === "textWidthOffset") {
    return Math.ceil(position.offset + getTxtWidth(position.text, position.options));
  }

  const iconLeft = Math.ceil(
    position.typeLeft + getTxtWidth(position.text, position.options) + position.iconWidth / 2
  );
  return Math.ceil(iconLeft + position.iconWidth + position.typeSize * 0.1);
};

const resolveOverlay = async (overlay: RenderOverlay): Promise<sharp.OverlayOptions> => {
  const { input, left, top, ...options } = overlay;
  const resolvedOverlay: sharp.OverlayOptions = {
    ...options,
    input: await resolveSource(input),
  };
  const resolvedLeft = resolvePosition(left);
  const resolvedTop = resolvePosition(top);

  if (resolvedLeft !== undefined) resolvedOverlay.left = resolvedLeft;
  if (resolvedTop !== undefined) resolvedOverlay.top = resolvedTop;

  return resolvedOverlay;
};

const renderCardImage = async ({ base, overlays }: StyledCardRender) => {
  const [baseInput, resolvedOverlays] = await Promise.all([
    resolveSource(base),
    Promise.all(overlays.map(resolveOverlay)),
  ]);

  return sharp(baseInput).composite(resolvedOverlays).webp({ quality: 100 }).toBuffer();
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
  type StyledCardRender,
};

type textOptions = {
  fontFamily?: string;
  size?: number;
  width?: number;
  height?: number;
  lineHeight?: number;
  letterSpacing?: number;
  scaleX?: number;
  scaleY?: number;
  scale?: number;
};
import { getFontMetrics } from "./initiateFontsMetrics.js";

getFontMetrics();
const def = {
  fontFamily: "MatrixBold",
  size: 20,
  width: 550,
  lineHeight: 1,
  height: 118,
  scaleX: 1,
  scaleY: 1,
  letterSpacing: 0,
};

let getTxtWidth = (text: string, inputOptions: textOptions = {}): number => {
  const options = { ...def, ...inputOptions };
  const fontInstance = global.fontMetrics[options.fontFamily];
  const fontSize = options.size;
  const glyph = fontInstance.layout(text);
  const neoWidth =
    ((glyph.advanceWidth / fontInstance.unitsPerEm) * fontSize + text.length * options.letterSpacing) *
    1.005 *
    options.scaleX;
  return neoWidth;
};

let getTxtHeight = (txt: string, inputOptions: textOptions = {}) => {
  const options = { ...def, ...inputOptions };
  let lines = txt.split(/\n/);
  let n = lines.length;
  for (let i = 0; i < lines.length; ++i) {
    let words = lines[i].split(" ");
    let line = "";
    for (let x = 0; x < words.length; ++x) {
      let currentLineWidth = getTxtWidth(line + words[x] + " ", options);
      if (currentLineWidth < options.width) {
        line = line + words[x] + " ";
      } else {
        n++;
        line = "";
        x--;
      }
    }
  }
  return n * (options.size as number) * (options.lineHeight as number);
};
let calculateMaxFont = (txt: string, inputOptions: textOptions = {}): number => {
  const options = { ...def, ...inputOptions };
  while (getTxtHeight(txt, options) > options.height) options.size -= 0.5;
  return options.size;
};

let calculateMaxScale = (txt: string, inputOptions: textOptions = {}): { scaleX: number; scaleY: number } => {
  const options = { ...def, ...inputOptions };
  const width = getTxtWidth(txt, options) + txt.length * options.letterSpacing;
  if (width * options.scaleX > options.width) return { scaleX: options.width / width, scaleY: options.scaleY };
  return { scaleX: options.scaleX, scaleY: options.scaleY };
};

export { calculateMaxFont, calculateMaxScale, getTxtWidth };

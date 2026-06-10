import fs from "fs";
import path from "path";
import z from "zod";
import type { settings } from "./types.js";

const styleNameSchema = z.string().min(1).regex(/^[A-Za-z0-9_-]+$/);
const styleTypeSchema = z.enum(["standard", "rush"]);
const styleConfigEntrySchema = z.object({
  name: styleNameSchema,
  type: styleTypeSchema,
  directory: z.string().min(1).optional(),
});
const styleConfigSchema = z.object({
  styles: z.array(styleConfigEntrySchema).min(1),
});

type StyleType = z.infer<typeof styleTypeSchema>;

type LoadedStyle = {
  name: string;
  type: StyleType;
  directory: string;
  assets: Record<"icons" | "template", Set<string>>;
  settings: settings;
};

type StyleRegistry = {
  rootDir: string;
  getStyle: (type: StyleType, name: string) => LoadedStyle | undefined;
  listStyles: (type?: StyleType) => LoadedStyle[];
};

const getStylesRoot = () => path.resolve(process.env.STYLES_DIR || "./styles");

const defaultStyleDirectory = (type: StyleType, name: string) => path.join("assets", type, name);

const loadJson = (filePath: string) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Missing required style file: ${filePath}`);
    }
    throw new Error(`Invalid JSON in ${filePath}: ${(error as Error).message}`);
  }
};

const assertDirectory = (directory: string, label: string) => {
  let stats: fs.Stats;
  try {
    stats = fs.statSync(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Missing ${label}: ${directory}`);
    }
    throw error;
  }

  if (!stats.isDirectory()) {
    throw new Error(`${label} is not a directory: ${directory}`);
  }
};

const loadStyleSettings = (settingsPath: string, styleName: string): settings => {
  const parsedSettings = loadJson(settingsPath);

  if (!parsedSettings || typeof parsedSettings !== "object" || Array.isArray(parsedSettings)) {
    throw new Error(`Style settings must be a JSON object: ${settingsPath}`);
  }

  return { ...(parsedSettings as Record<string, unknown>), styleName } as settings;
};

const loadStyleAssetFiles = (directory: string, label: string) => {
  const files = fs.readdirSync(directory).filter((file) => file.endsWith(".png"));
  if (files.length === 0) {
    throw new Error(`${label} has no PNG assets: ${directory}`);
  }

  return new Set(files);
};

const loadStyleRegistry = (rootDir = getStylesRoot()): StyleRegistry => {
  const configPath = path.join(rootDir, "config.json");
  const parsedConfig = styleConfigSchema.safeParse(loadJson(configPath));

  if (!parsedConfig.success) {
    throw new Error(`Invalid style config ${configPath}: ${parsedConfig.error.message}`);
  }

  const styles = new Map<string, LoadedStyle>();

  for (const entry of parsedConfig.data.styles) {
    const type = entry.type;
    const key = `${type}:${entry.name}`;
    if (styles.has(key)) {
      throw new Error(`Duplicate style "${entry.name}" for type "${type}" in ${configPath}`);
    }

    const styleDirectory = path.resolve(rootDir, entry.directory || defaultStyleDirectory(entry.type, entry.name));
    assertDirectory(styleDirectory, `style "${entry.name}"`);
    const iconsDirectory = path.join(styleDirectory, "icons");
    const templateDirectory = path.join(styleDirectory, "template");
    assertDirectory(iconsDirectory, `icons directory for style "${entry.name}"`);
    assertDirectory(templateDirectory, `template directory for style "${entry.name}"`);

    styles.set(key, {
      name: entry.name,
      type,
      directory: styleDirectory,
      assets: {
        icons: loadStyleAssetFiles(iconsDirectory, `icons directory for style "${entry.name}"`),
        template: loadStyleAssetFiles(templateDirectory, `template directory for style "${entry.name}"`),
      },
      settings: loadStyleSettings(path.join(styleDirectory, "settings.json"), entry.name),
    });
  }

  const loadedStyles = Array.from(styles.values());
  console.log(
    `Loaded ${loadedStyles.length} style${loadedStyles.length === 1 ? "" : "s"} from ${rootDir}: ${loadedStyles
      .map((style) => `${style.type}/${style.name}`)
      .join(", ")}`
  );

  return {
    rootDir,
    getStyle: (type, name) => styles.get(`${type}:${name}`),
    listStyles: (type) => loadedStyles.filter((style) => !type || style.type === type),
  };
};

export { loadStyleRegistry, type LoadedStyle, type StyleRegistry, type StyleType };

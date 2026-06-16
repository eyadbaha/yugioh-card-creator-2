import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { imageSize as sizeOf } from "image-size";
import z from "zod";
import { collectFontFiles, loadFontMetrics } from "./initiateFontsMetrics.js";
import type { RenderContext } from "./renderContext.js";
import { rushStyleAssetRequirements } from "./rushStyleApplier.js";
import { standardStyleAssetRequirements } from "./standardStyleApplier.js";
import { settingsSchema, styleNameSchema, type settings } from "./types.js";

const styleTypeSchema = z.enum(["standard", "rush"]);
const styleManifestSchema = z
  .object({
    name: styleNameSchema,
    type: styleTypeSchema,
    fonts: z.array(z.string().min(1)).optional(),
  })
  .passthrough();
const styleConfigEntrySchema = z.object({
  name: styleNameSchema,
  type: styleTypeSchema,
  directory: z.string().min(1).optional(),
  enabled: z.boolean().default(true),
});
const styleConfigSchema = z.object({
  styles: z.array(styleConfigEntrySchema).default([]),
});

type StyleType = z.infer<typeof styleTypeSchema>;
type StyleManifest = z.infer<typeof styleManifestSchema>;
type StyleAssetArea = "icons" | "template";

type LoadedStyleAsset = {
  fileName: string;
  path: string;
  buffer: Buffer;
  dimensions: { width: number; height: number };
};

type LoadedStyle = {
  name: string;
  type: StyleType;
  directory: string;
  assets: Record<StyleAssetArea, Map<string, LoadedStyleAsset>>;
  settings: settings;
  renderContext: RenderContext;
};

type StyleRegistry = {
  rootDir: string;
  rootDirs: string[];
  getStyle: (type: StyleType, name: string) => LoadedStyle | undefined;
  listStyles: (type?: StyleType) => LoadedStyle[];
};

type StyleRegistryStore = {
  getStyleRegistry: () => StyleRegistry;
  close: () => void;
};

type StyleLoadEntry = {
  name: string;
  type: StyleType;
  rootDir: string;
  directory: string;
  manifest?: StyleManifest;
};

type AssetRequirements = {
  required: Record<StyleAssetArea, string[]>;
  optional?: Partial<Record<StyleAssetArea, string[]>>;
};

const getStylesRootDirs = () => {
  const roots = process.env.STYLES_DIRS
    ? process.env.STYLES_DIRS.split(path.delimiter)
    : [process.env.STYLES_DIR || "./styles"];

  return roots.filter(Boolean).map((rootDir) => path.resolve(rootDir));
};

const defaultStyleDirectory = (type: StyleType, name: string) => path.join("assets", type, name);

const exists = (filePath: string) => fs.existsSync(filePath);

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

const formatZodError = (error: z.ZodError) =>
  error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ");

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

const parseManifest = (manifestPath: string): StyleManifest => {
  const parsedManifest = styleManifestSchema.safeParse(loadJson(manifestPath));
  if (!parsedManifest.success) {
    throw new Error(`Invalid style manifest ${manifestPath}: ${formatZodError(parsedManifest.error)}`);
  }

  return parsedManifest.data;
};

const findStyleManifestPaths = (directory: string): string[] => {
  if (!exists(directory)) return [];

  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const manifestPaths: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      manifestPaths.push(...findStyleManifestPaths(entryPath));
    } else if (entry.isFile() && entry.name === "style.json") {
      manifestPaths.push(entryPath);
    }
  }

  return manifestPaths;
};

const loadConfigEntries = (rootDir: string): StyleLoadEntry[] | undefined => {
  const configPath = path.join(rootDir, "config.json");
  if (!exists(configPath)) return undefined;

  const parsedConfig = styleConfigSchema.safeParse(loadJson(configPath));
  if (!parsedConfig.success) {
    throw new Error(`Invalid style config ${configPath}: ${formatZodError(parsedConfig.error)}`);
  }

  console.warn(`Style config ${configPath} is deprecated; prefer per-pack style.json manifests.`);

  return parsedConfig.data.styles
    .filter((entry) => entry.enabled)
    .map((entry) => {
      const directory = path.resolve(rootDir, entry.directory || defaultStyleDirectory(entry.type, entry.name));
      const manifestPath = path.join(directory, "style.json");
      const manifest = exists(manifestPath) ? parseManifest(manifestPath) : undefined;

      if (manifest && (manifest.name !== entry.name || manifest.type !== entry.type)) {
        throw new Error(
          `Style config entry ${entry.type}/${entry.name} does not match manifest ${manifest.type}/${manifest.name} at ${manifestPath}`
        );
      }

      return {
        name: entry.name,
        type: entry.type,
        rootDir,
        directory,
        manifest,
      };
    });
};

const scanManifestEntries = (rootDir: string): StyleLoadEntry[] =>
  findStyleManifestPaths(rootDir).map((manifestPath) => {
    const manifest = parseManifest(manifestPath);
    return {
      name: manifest.name,
      type: manifest.type,
      rootDir,
      directory: path.dirname(manifestPath),
      manifest,
    };
  });

const collectStyleEntries = (rootDirs: string[]): StyleLoadEntry[] =>
  rootDirs.flatMap((rootDir) => loadConfigEntries(rootDir) ?? scanManifestEntries(rootDir));

const loadStyleSettings = (settingsPath: string, styleName: string): settings => {
  const parsedSettings = loadJson(settingsPath);

  if (!parsedSettings || typeof parsedSettings !== "object" || Array.isArray(parsedSettings)) {
    throw new Error(`Style settings must be a JSON object: ${settingsPath}`);
  }

  const settingsWithStyleName = { ...(parsedSettings as Record<string, unknown>), styleName };
  const validatedSettings = settingsSchema.safeParse(settingsWithStyleName);
  if (!validatedSettings.success) {
    throw new Error(
      `Invalid settings for style "${styleName}" at ${settingsPath}: ${formatZodError(validatedSettings.error)}`
    );
  }

  return validatedSettings.data;
};

const loadStyleAssetFiles = (directory: string, label: string): Map<string, LoadedStyleAsset> => {
  const files = fs.readdirSync(directory).filter((file) => file.endsWith(".png"));
  if (files.length === 0) {
    throw new Error(`${label} has no PNG assets: ${directory}`);
  }

  return new Map(
    files.map((fileName) => {
      const filePath = path.join(directory, fileName);
      const buffer = fs.readFileSync(filePath);
      const dimensions = sizeOf(buffer);

      return [
        fileName,
        {
          fileName,
          path: filePath,
          buffer,
          dimensions: { width: dimensions.width as number, height: dimensions.height as number },
        },
      ];
    })
  );
};

const getRequirements = (type: StyleType): AssetRequirements =>
  type === "standard" ? standardStyleAssetRequirements : rushStyleAssetRequirements;

const validateStyleAssets = (style: Pick<LoadedStyle, "name" | "type" | "assets">) => {
  const requirements = getRequirements(style.type);
  const missingRequired = (Object.entries(requirements.required) as [StyleAssetArea, string[]][])
    .flatMap(([area, files]) => files.filter((file) => !style.assets[area].has(file)).map((file) => `${area}/${file}`));

  if (missingRequired.length > 0) {
    throw new Error(`Style "${style.type}/${style.name}" is missing required assets: ${missingRequired.join(", ")}`);
  }

  const missingOptional = (Object.entries(requirements.optional ?? {}) as [StyleAssetArea, string[]][])
    .flatMap(([area, files]) => files.filter((file) => !style.assets[area].has(file)).map((file) => `${area}/${file}`));

  if (missingOptional.length > 0) {
    console.warn(`Style "${style.type}/${style.name}" is missing optional assets: ${missingOptional.join(", ")}`);
  }
};

const resolveFirstExisting = (paths: string[], label: string) => {
  const foundPath = paths.find(exists);
  if (!foundPath) {
    throw new Error(`Missing ${label}. Checked: ${paths.join(", ")}`);
  }

  return foundPath;
};

const loadGeneralRenderAssets = (rootDirs: string[]) => {
  const overRushCoverPath = resolveFirstExisting(
    rootDirs.map((rootDir) => path.join(rootDir, "general", "font-masks", "overrush-cover.png")),
    "overrush cover texture"
  );

  return {
    overRushCoverDataUri: `data:image/png;base64,${fs.readFileSync(overRushCoverPath).toString("base64")}`,
  };
};

const collectStyleFontSources = (entry: StyleLoadEntry) => {
  const manifestFontSources = entry.manifest?.fonts?.map((fontPath) => path.resolve(entry.directory, fontPath)) ?? [];
  const defaultPackFonts = path.join(entry.directory, "fonts");
  return [...manifestFontSources, defaultPackFonts].filter(exists);
};

const collectFontDirectories = (fontSources: string[]) => {
  const directories = new Set<string>();
  for (const source of fontSources) {
    if (!exists(source)) continue;
    const stats = fs.statSync(source);
    if (stats.isDirectory() && collectFontFiles(source).length > 0) directories.add(source);
    if (stats.isFile() && /\.(otf|ttf)$/i.test(source)) directories.add(path.dirname(source));
  }

  return Array.from(directories);
};

const escapeXml = (value: string) =>
  value.replace(/[<>&'"]/g, (char) => {
    const replacements: Record<string, string> = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      "'": "&apos;",
      '"': "&quot;",
    };
    return replacements[char];
  });

const configureFontconfig = (fontDirectories: string[]) => {
  if (fontDirectories.length === 0) return;

  const hash = crypto.createHash("sha1").update(fontDirectories.join("\0")).digest("hex").slice(0, 12);
  const configDirectory = path.join(os.tmpdir(), `ygo-card-creator-fontconfig-${hash}`);
  const cacheDirectory = path.join(configDirectory, "cache");
  const configPath = path.join(configDirectory, "fonts.conf");
  fs.mkdirSync(cacheDirectory, { recursive: true });
  fs.writeFileSync(
    configPath,
    `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
${fontDirectories.map((directory) => `  <dir>${escapeXml(directory)}</dir>`).join("\n")}
  <cachedir>${escapeXml(cacheDirectory)}</cachedir>
</fontconfig>
`,
    "utf8"
  );

  process.env.FONTCONFIG_PATH = configDirectory;
  process.env.FONTCONFIG_FILE = configPath;
};

const normalizeRootDirs = (rootDirs?: string | string[]) => {
  if (!rootDirs) return getStylesRootDirs();
  return (Array.isArray(rootDirs) ? rootDirs : [rootDirs]).map((rootDir) => path.resolve(rootDir));
};

const loadStyleRegistry = (inputRootDirs?: string | string[]): StyleRegistry => {
  const rootDirs = normalizeRootDirs(inputRootDirs);
  rootDirs.forEach((rootDir) => assertDirectory(rootDir, "styles root"));

  const entries = collectStyleEntries(rootDirs);
  if (entries.length === 0) {
    throw new Error(`No style manifests found in ${rootDirs.join(path.delimiter)}`);
  }

  const fontSources = [
    ...rootDirs.map((rootDir) => path.join(rootDir, "general", "fonts")),
    ...entries.flatMap(collectStyleFontSources),
  ].filter(exists);
  const fontDirectories = collectFontDirectories(fontSources);
  configureFontconfig(fontDirectories);

  const renderContext: RenderContext = {
    fontMetrics: loadFontMetrics(fontSources),
    generalAssets: loadGeneralRenderAssets(rootDirs),
  };

  const styles = new Map<string, LoadedStyle>();

  for (const entry of entries) {
    const key = `${entry.type}:${entry.name}`;
    if (styles.has(key)) {
      throw new Error(`Duplicate style "${entry.name}" for type "${entry.type}" in ${rootDirs.join(path.delimiter)}`);
    }

    assertDirectory(entry.directory, `style "${entry.name}"`);
    const iconsDirectory = path.join(entry.directory, "icons");
    const templateDirectory = path.join(entry.directory, "template");
    assertDirectory(iconsDirectory, `icons directory for style "${entry.name}"`);
    assertDirectory(templateDirectory, `template directory for style "${entry.name}"`);

    const loadedStyle: LoadedStyle = {
      name: entry.name,
      type: entry.type,
      directory: entry.directory,
      assets: {
        icons: loadStyleAssetFiles(iconsDirectory, `icons directory for style "${entry.name}"`),
        template: loadStyleAssetFiles(templateDirectory, `template directory for style "${entry.name}"`),
      },
      settings: loadStyleSettings(path.join(entry.directory, "settings.json"), entry.name),
      renderContext,
    };

    validateStyleAssets(loadedStyle);
    styles.set(key, loadedStyle);
  }

  const loadedStyles = Array.from(styles.values());
  console.log(
    `Loaded ${loadedStyles.length} style${loadedStyles.length === 1 ? "" : "s"} from ${rootDirs.join(
      path.delimiter
    )}: ${loadedStyles.map((style) => `${style.type}/${style.name}`).join(", ")}`
  );

  return {
    rootDir: rootDirs[0],
    rootDirs,
    getStyle: (type, name) => styles.get(`${type}:${name}`),
    listStyles: (type) => loadedStyles.filter((style) => !type || style.type === type),
  };
};

const watchDirectories = (rootDirs: string[], onChange: () => void) => {
  const directories = new Set<string>();
  const visit = (directory: string) => {
    if (!exists(directory) || !fs.statSync(directory).isDirectory()) return;
    directories.add(directory);
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) visit(path.join(directory, entry.name));
    }
  };

  rootDirs.forEach(visit);
  return Array.from(directories).map((directory) =>
    fs.watch(directory, { persistent: false }, (_eventType, fileName) => {
      if (!fileName || /\.(json|png|otf|ttf)$/i.test(fileName.toString())) onChange();
    })
  );
};

const createStyleRegistryStore = (inputRootDirs?: string | string[]): StyleRegistryStore => {
  const rootDirs = normalizeRootDirs(inputRootDirs);
  let registry = loadStyleRegistry(rootDirs);
  let watchers: fs.FSWatcher[] = [];
  let reloadTimer: NodeJS.Timeout | undefined;

  const resetWatchers = () => {
    watchers.forEach((watcher) => watcher.close());
    watchers = watchDirectories(rootDirs, scheduleReload);
  };

  const scheduleReload = () => {
    if (reloadTimer) clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
      try {
        registry = loadStyleRegistry(rootDirs);
        resetWatchers();
        console.log("Reloaded style registry after style file change.");
      } catch (error) {
        console.error("Failed to reload style registry:", error);
      }
    }, 150);
  };

  if (process.env.STYLES_WATCH === "1") {
    resetWatchers();
    console.log(`Watching styles for changes: ${rootDirs.join(path.delimiter)}`);
  }

  return {
    getStyleRegistry: () => registry,
    close: () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      watchers.forEach((watcher) => watcher.close());
    },
  };
};

export {
  createStyleRegistryStore,
  loadStyleRegistry,
  type LoadedStyle,
  type LoadedStyleAsset,
  type StyleRegistry,
  type StyleRegistryStore,
  type StyleType,
};

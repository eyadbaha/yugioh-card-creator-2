import express from "express";
import fs from "fs";
import { imageSize as sizeOf } from "image-size";
import path from "path";
import { fileURLToPath } from "url";
import z from "zod";
import { CardArtLoadError } from "../cardArt.js";
import { cardGenerate, rushCardGenerate } from "../cardGenerate.js";
import { rushStyleAssetRequirements } from "../rushStyleApplier.js";
import { standardStyleAssetRequirements } from "../standardStyleApplier.js";
import type { LoadedStyle, LoadedStyleAsset, StyleRegistry, StyleRegistryStore, StyleType } from "../styleRegistry.js";
import { APIBodySchema, settingsSchema, styleNameSchema } from "../types.js";
import { createZip, readZip, type ZipEntry } from "./zip.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const editorHtmlPath = path.resolve(here, "../../../public/editor.html");

const styleTypes = ["standard", "rush"] as const;
const assetAreas = ["icons", "template"] as const;
type AssetArea = (typeof assetAreas)[number];

const isStyleType = (value: unknown): value is StyleType =>
  typeof value === "string" && (styleTypes as readonly string[]).includes(value);
const isAssetArea = (value: unknown): value is AssetArea =>
  typeof value === "string" && (assetAreas as readonly string[]).includes(value);
const isValidName = (value: unknown): value is string =>
  typeof value === "string" && styleNameSchema.safeParse(value).success;

const formatZodError = (error: z.ZodError) =>
  error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ");

const readRawJson = (filePath: string): unknown =>
  JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^﻿/, ""));

type DecodedAssetOverride = {
  area: AssetArea;
  file: string;
  asset: LoadedStyleAsset;
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const decodePngAsset = (style: LoadedStyle, area: AssetArea, file: string, data: unknown): LoadedStyleAsset => {
  if (typeof data !== "string") {
    throw new Error(`Asset override ${area}/${file} must be a base64 PNG string`);
  }

  const buffer = Buffer.from(data.replace(/^data:image\/png;base64,/, ""), "base64");
  if (buffer.length < 8 || buffer[0] !== 0x89 || buffer[1] !== 0x50) {
    throw new Error(`Asset override ${area}/${file} is not a valid PNG`);
  }

  const dimensions = sizeOf(buffer);
  if (!dimensions.width || !dimensions.height) {
    throw new Error(`Asset override ${area}/${file} has unreadable dimensions`);
  }

  return {
    fileName: file,
    path: path.join(style.directory, area, file),
    buffer,
    dimensions: { width: dimensions.width, height: dimensions.height },
  };
};

const decodeAssetOverrides = (style: LoadedStyle, input: unknown): DecodedAssetOverride[] => {
  if (input == null) return [];
  if (!isObjectRecord(input)) {
    throw new Error("Asset overrides must be an object");
  }

  const overrides: DecodedAssetOverride[] = [];
  for (const area of assetAreas) {
    const areaInput = input[area];
    if (areaInput == null) continue;
    if (!isObjectRecord(areaInput)) {
      throw new Error(`Asset overrides for ${area} must be an object`);
    }

    for (const [file, data] of Object.entries(areaInput)) {
      if (!/^[A-Za-z0-9_-]+\.png$/.test(file)) {
        throw new Error(`Asset override file name must be a .png: ${area}/${file}`);
      }
      if (!style.assets[area].has(file)) {
        throw new Error(`Cannot replace unknown asset: ${area}/${file}`);
      }

      overrides.push({ area, file, asset: decodePngAsset(style, area, file, data) });
    }
  }

  return overrides;
};

const applyAssetOverrides = (style: LoadedStyle, overrides: DecodedAssetOverride[]): LoadedStyle => {
  if (overrides.length === 0) return style;

  const assets: LoadedStyle["assets"] = {
    icons: new Map(style.assets.icons),
    template: new Map(style.assets.template),
  };

  for (const { area, file, asset } of overrides) {
    assets[area].set(file, asset);
  }

  return { ...style, assets };
};

const writeAssetOverrides = (style: LoadedStyle, overrides: DecodedAssetOverride[]) => {
  for (const { area, file, asset } of overrides) {
    fs.writeFileSync(path.join(style.directory, area, file), asset.buffer);
  }
};

const updateStyleIdentity = (directory: string, section: string, type: StyleType, name: string) => {
  const manifestPath = path.join(directory, "style.json");
  const manifest = readRawJson(manifestPath);
  if (!isObjectRecord(manifest)) {
    throw new Error("style.json must be a JSON object");
  }
  fs.writeFileSync(manifestPath, JSON.stringify({ ...manifest, name, section, type }, null, 2), "utf8");

  const settingsPath = path.join(directory, "settings.json");
  try {
    const settings = readRawJson(settingsPath);
    if (isObjectRecord(settings)) {
      fs.writeFileSync(settingsPath, JSON.stringify({ ...settings, styleName: name }, null, 2), "utf8");
    }
  } catch {
    // Leave settings untouched if they cannot be read; registry reload will report any real validation issue.
  }
};

const walkDir = (dir: string, base: string, entries: ZipEntry[]) => {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, item.name);
    const relPath = path.posix.join(base, item.name);
    if (item.isDirectory()) walkDir(fullPath, relPath, entries);
    else if (item.isFile()) entries.push({ name: relPath, data: fs.readFileSync(fullPath) });
  }
};

const getSectionType = (registry: StyleRegistry, section: string): StyleType | undefined =>
  registry.listStyles().find((style) => style.section === section)?.type;

const createEditorRouter = (store: StyleRegistryStore): express.Router => {
  const router = express.Router();
  const jsonLarge = express.json({ limit: "80mb" });
  const registry = () => store.getStyleRegistry();

  // --- Editor page -----------------------------------------------------------
  router.get("/editor", (_req, res) => {
    res.sendFile(editorHtmlPath, (err) => {
      if (err) res.status(404).send("Editor UI not found. Expected at public/editor.html");
    });
  });

  // --- Style listing & detail ------------------------------------------------
  router.get("/api/editor/styles", (_req, res) => {
    const styles = registry()
      .listStyles()
      .map((style) => ({ type: style.type, section: style.section, name: style.name }));
    res.json({ styles });
  });

  router.get("/api/editor/styles/:section/:name", (req, res) => {
    const { section, name } = req.params;
    if (!isValidName(section) || !isValidName(name)) {
      res.status(400).send("Invalid style section or name");
      return;
    }
    const style = registry().getStyle(section, name);
    if (!style) {
      res.status(404).send("Style not found");
      return;
    }

    let settings: unknown;
    try {
      settings = readRawJson(path.join(style.directory, "settings.json"));
    } catch {
      settings = style.settings;
    }

    res.json({
      type: style.type,
      section: style.section,
      name: style.name,
      settings,
      fonts: Object.keys(style.renderContext.fontMetrics).sort(),
      assets: {
        icons: [...style.assets.icons.keys()].sort(),
        template: [...style.assets.template.keys()].sort(),
      },
    });
  });

  // --- Asset preview ---------------------------------------------------------
  router.get("/api/editor/styles/:section/:name/asset/:area/:file", (req, res) => {
    const { section, name, area, file } = req.params;
    if (!isValidName(section) || !isValidName(name) || !isAssetArea(area)) {
      res.status(400).send("Invalid request");
      return;
    }
    const style = registry().getStyle(section, name);
    const asset = style?.assets[area].get(file);
    if (!asset) {
      res.status(404).send("Asset not found");
      return;
    }
    res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store" });
    res.end(asset.buffer);
  });

  // --- Download style as ZIP -------------------------------------------------
  router.get("/api/editor/styles/:section/:name/zip", (req, res) => {
    const { section, name } = req.params;
    if (!isValidName(section) || !isValidName(name)) {
      res.status(400).send("Invalid style section or name");
      return;
    }
    const style = registry().getStyle(section, name);
    if (!style) {
      res.status(404).send("Style not found");
      return;
    }
    const entries: ZipEntry[] = [];
    walkDir(style.directory, name, entries);
    const zip = createZip(entries);
    res.writeHead(200, {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${name}.zip"`,
      "Content-Length": zip.length,
    });
    res.end(zip);
  });

  // --- Live render (settings overridden in-memory, never persisted) ----------
  router.post("/api/editor/render", jsonLarge, async (req, res) => {
    const { section, style: styleName } = req.body ?? {};
    if (!isValidName(section) || !isValidName(styleName)) {
      res.status(400).send("Invalid style section or name");
      return;
    }
    const basePack = registry().getStyle(section, styleName);
    if (!basePack) {
      res.status(400).send(`Unknown style "${section}/${styleName}"`);
      return;
    }

    const settingsResult = settingsSchema.safeParse({ ...(req.body?.settings ?? {}), styleName });
    if (!settingsResult.success) {
      res.status(400).send("Invalid settings: " + formatZodError(settingsResult.error));
      return;
    }
    let assetOverrides: DecodedAssetOverride[];
    try {
      assetOverrides = decodeAssetOverrides(basePack, req.body?.assets);
    } catch (error) {
      res.status(400).send("Invalid assets: " + (error as Error).message);
      return;
    }
    const cardResult = APIBodySchema.safeParse({ ...(req.body?.card ?? {}), section, style: styleName });
    if (!cardResult.success) {
      res.status(400).send("Invalid card: " + formatZodError(cardResult.error));
      return;
    }

    const previewPack = applyAssetOverrides({ ...basePack, settings: settingsResult.data }, assetOverrides);
    const generate = basePack.type === "rush" ? rushCardGenerate : cardGenerate;

    try {
      const buffer = await generate(cardResult.data, previewPack);
      res.writeHead(200, { "Content-Type": "image/webp", "Cache-Control": "no-store" });
      res.end(buffer);
    } catch (error) {
      if (error instanceof CardArtLoadError) {
        res.status(400).send("Art could not be loaded.");
        return;
      }
      console.error(error);
      res.status(500).send("Failed to render card: " + (error as Error).message);
    }
  });

  // --- Save settings/assets --------------------------------------------------
  router.post("/api/editor/styles/:section/:name", jsonLarge, (req, res) => {
    const { section, name } = req.params;
    if (!isValidName(section) || !isValidName(name)) {
      res.status(400).send("Invalid style section or name");
      return;
    }
    const style = registry().getStyle(section, name);
    if (!style) {
      res.status(404).send("Style not found");
      return;
    }

    const body = req.body ?? {};
    const structuredSave = isObjectRecord(body) && Object.prototype.hasOwnProperty.call(body, "settings");
    const rawSettings = structuredSave ? body.settings : body;
    if (!isObjectRecord(rawSettings)) {
      res.status(400).send("Invalid settings: expected an object");
      return;
    }

    let assetOverrides: DecodedAssetOverride[];
    try {
      assetOverrides = decodeAssetOverrides(style, structuredSave ? body.assets : undefined);
    } catch (error) {
      res.status(400).send("Invalid assets: " + (error as Error).message);
      return;
    }

    const incoming = { ...rawSettings, styleName: name };
    const result = settingsSchema.safeParse(incoming);
    if (!result.success) {
      res.status(400).send("Invalid settings: " + formatZodError(result.error));
      return;
    }

    fs.writeFileSync(path.join(style.directory, "settings.json"), JSON.stringify(incoming, null, 2), "utf8");
    writeAssetOverrides(style, assetOverrides);
    try {
      store.reload();
    } catch (error) {
      res.status(500).send("Saved, but reload failed: " + (error as Error).message);
      return;
    }
    res.json({ ok: true });
  });

  // --- Rename a style --------------------------------------------------------
  router.post("/api/editor/styles/:section/:name/rename", jsonLarge, (req, res) => {
    const { section, name } = req.params;
    const newName = req.body?.name;
    if (!isValidName(section) || !isValidName(name) || !isValidName(newName)) {
      res.status(400).send("Invalid style section or name");
      return;
    }
    if (newName === name) {
      const style = registry().getStyle(section, name);
      res.json({ type: style?.type, section, name });
      return;
    }

    const reg = registry();
    const style = reg.getStyle(section, name);
    if (!style) {
      res.status(404).send("Style not found");
      return;
    }
    if (reg.getStyle(section, newName)) {
      res.status(409).send(`Style "${section}/${newName}" already exists`);
      return;
    }

    const sourceDir = style.directory;
    const targetDir = path.join(path.dirname(sourceDir), newName);
    const moved = path.resolve(sourceDir) !== path.resolve(targetDir);
    if (moved && fs.existsSync(targetDir)) {
      res.status(409).send(`Directory already exists: ${targetDir}`);
      return;
    }

    try {
      if (moved) fs.renameSync(sourceDir, targetDir);
      updateStyleIdentity(targetDir, section, style.type, newName);
      store.reload();
    } catch (error) {
      try {
        if (moved && fs.existsSync(targetDir) && !fs.existsSync(sourceDir)) {
          fs.renameSync(targetDir, sourceDir);
        }
        updateStyleIdentity(sourceDir, section, style.type, name);
        store.reload();
      } catch {
        // Preserve the original error; rollback failures are best handled manually with the reported path.
      }
      res.status(500).send("Rename failed: " + (error as Error).message);
      return;
    }

    res.json({ type: style.type, section, name: newName });
  });

  // --- Create a new style (clone of an existing one) -------------------------
  router.post("/api/editor/styles", jsonLarge, (req, res) => {
    const body = req.body ?? {};
    const name = body.name;
    const section = typeof body.section === "string" ? body.section.trim() : "";
    const from = body.from ?? {};
    if (!isValidName(name)) {
      res.status(400).send("Invalid style name");
      return;
    }
    if (!isValidName(section)) {
      res.status(400).send("Section and series are required");
      return;
    }
    if (!isValidName(from.section) || !isValidName(from.name)) {
      res.status(400).send("Invalid base style");
      return;
    }

    const reg = registry();
    const source = reg.getStyle(from.section, from.name);
    if (!source) {
      res.status(400).send("Base style not found");
      return;
    }
    const type = source.type;
    const existingSectionType = getSectionType(reg, section);
    if (existingSectionType && existingSectionType !== type) {
      res.status(409).send(`Section "${section}" already uses "${existingSectionType}" styles`);
      return;
    }
    if (reg.getStyle(section, name)) {
      res.status(409).send(`Style "${section}/${name}" already exists`);
      return;
    }

    const targetDir = path.join(reg.rootDir, "assets", section, name);
    if (fs.existsSync(targetDir)) {
      res.status(409).send(`Directory already exists: ${targetDir}`);
      return;
    }

    fs.cpSync(source.directory, targetDir, { recursive: true });
    const manifest = {
      name,
      type,
      section,
    };
    fs.writeFileSync(path.join(targetDir, "style.json"), JSON.stringify(manifest, null, 2), "utf8");
    const settingsPath = path.join(targetDir, "settings.json");
    try {
      const settings = readRawJson(settingsPath) as Record<string, unknown>;
      settings.styleName = name;
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf8");
    } catch {
      // leave settings as cloned if it can't be parsed
    }

    try {
      store.reload();
    } catch (error) {
      fs.rmSync(targetDir, { recursive: true, force: true });
      res.status(500).send("Created style is invalid: " + (error as Error).message);
      return;
    }
    res.json({ type, section, name });
  });

  // --- Import a style from an uploaded ZIP (writes to THIS server's disk) -----
  router.post("/api/editor/import", jsonLarge, (req, res) => {
    const data = typeof req.body?.data === "string" ? req.body.data : "";
    const zipBuffer = Buffer.from(data.replace(/^data:[^,]*,/, ""), "base64");
    if (zipBuffer.length < 22) {
      res.status(400).send("Uploaded file is not a valid zip");
      return;
    }

    let files: ZipEntry[];
    try {
      files = readZip(zipBuffer);
    } catch (error) {
      res.status(400).send("Could not read zip: " + (error as Error).message);
      return;
    }

    // Locate the shallowest style.json to identify the style and its folder prefix.
    const manifestEntry = files
      .filter((file) => file.name === "style.json" || file.name.endsWith("/style.json"))
      .sort((a, b) => a.name.split("/").length - b.name.split("/").length)[0];
    if (!manifestEntry) {
      res.status(400).send("Zip must contain a style.json manifest");
      return;
    }

    let manifest: { name?: unknown; type?: unknown; section?: unknown };
    try {
      manifest = JSON.parse(manifestEntry.data.toString("utf8").replace(/^﻿/, ""));
    } catch {
      res.status(400).send("style.json is not valid JSON");
      return;
    }
    const { type, name, section } = manifest;
    if (!isStyleType(type) || !isValidName(name) || !isValidName(section)) {
      res.status(400).send("style.json must have a valid name, type, and section");
      return;
    }

    const prefix = manifestEntry.name.slice(0, manifestEntry.name.length - "style.json".length);
    const staged: { rel: string; data: Buffer }[] = [];
    for (const file of files) {
      if (prefix && !file.name.startsWith(prefix)) continue;
      const rel = prefix ? file.name.slice(prefix.length) : file.name;
      if (!rel) continue;
      if (rel.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) {
        res.status(400).send(`Zip contains an unsafe path: ${file.name}`);
        return;
      }
      staged.push({ rel, data: file.data });
    }

    // Validate structure before touching disk so a bad zip can't break the registry.
    const settingsEntry = staged.find((entry) => entry.rel === "settings.json");
    if (!settingsEntry) {
      res.status(400).send("Zip is missing settings.json");
      return;
    }
    let settingsObject: Record<string, unknown>;
    try {
      settingsObject = JSON.parse(settingsEntry.data.toString("utf8").replace(/^﻿/, ""));
    } catch {
      res.status(400).send("settings.json is not valid JSON");
      return;
    }
    const settingsCheck = settingsSchema.safeParse({ ...settingsObject, styleName: name });
    if (!settingsCheck.success) {
      res.status(400).send("Invalid settings.json: " + formatZodError(settingsCheck.error));
      return;
    }

    const requirements = type === "rush" ? rushStyleAssetRequirements : standardStyleAssetRequirements;
    const present = new Set(staged.map((entry) => entry.rel));
    const missing = (assetAreas as readonly AssetArea[]).flatMap((area) =>
      (requirements.required[area] ?? [])
        .filter((file) => !present.has(`${area}/${file}`))
        .map((file) => `${area}/${file}`)
    );
    if (missing.length > 0) {
      res.status(400).send("Zip is missing required assets: " + missing.join(", "));
      return;
    }

    const reg = registry();
    const existingSectionType = getSectionType(reg, section);
    if (existingSectionType && existingSectionType !== type) {
      res.status(409).send(`Section "${section}" already uses "${existingSectionType}" styles`);
      return;
    }
    const existing = reg.getStyle(section, name);
    const targetDir = existing ? existing.directory : path.join(reg.rootDir, "assets", section, name);

    fs.rmSync(targetDir, { recursive: true, force: true });
    for (const entry of staged) {
      const dest = path.join(targetDir, entry.rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, entry.data);
    }

    try {
      store.reload();
    } catch (error) {
      res.status(500).send("Imported, but reload failed: " + (error as Error).message);
      return;
    }
    res.json({ type, section, name, overrode: Boolean(existing) });
  });

  // --- Replace an asset (icon / template png) --------------------------------
  router.post("/api/editor/styles/:section/:name/asset/:area/:file", jsonLarge, (req, res) => {
    const { section, name, area, file } = req.params;
    if (!isValidName(section) || !isValidName(name) || !isAssetArea(area)) {
      res.status(400).send("Invalid request");
      return;
    }
    if (!/^[A-Za-z0-9_-]+\.png$/.test(file)) {
      res.status(400).send("Asset file name must be a .png");
      return;
    }
    const style = registry().getStyle(section, name);
    if (!style) {
      res.status(404).send("Style not found");
      return;
    }

    const data = typeof req.body?.data === "string" ? req.body.data : "";
    const buffer = Buffer.from(data.replace(/^data:image\/png;base64,/, ""), "base64");
    if (buffer.length < 8 || buffer[0] !== 0x89 || buffer[1] !== 0x50) {
      res.status(400).send("Uploaded file is not a valid PNG");
      return;
    }

    fs.writeFileSync(path.join(style.directory, area, file), buffer);
    try {
      store.reload();
    } catch (error) {
      res.status(500).send("Saved, but reload failed: " + (error as Error).message);
      return;
    }
    res.json({ ok: true });
  });

  return router;
};

export { createEditorRouter };

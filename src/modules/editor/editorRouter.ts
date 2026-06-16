import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import z from "zod";
import { CardArtLoadError } from "../cardArt.js";
import { cardGenerate, rushCardGenerate } from "../cardGenerate.js";
import { rushStyleAssetRequirements } from "../rushStyleApplier.js";
import { standardStyleAssetRequirements } from "../standardStyleApplier.js";
import type { LoadedStyle, StyleRegistryStore, StyleType } from "../styleRegistry.js";
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

const walkDir = (dir: string, base: string, entries: ZipEntry[]) => {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, item.name);
    const relPath = path.posix.join(base, item.name);
    if (item.isDirectory()) walkDir(fullPath, relPath, entries);
    else if (item.isFile()) entries.push({ name: relPath, data: fs.readFileSync(fullPath) });
  }
};

const createEditorRouter = (store: StyleRegistryStore): express.Router => {
  const router = express.Router();
  const jsonLarge = express.json({ limit: "30mb" });
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
      .map((style) => ({ type: style.type, name: style.name }));
    res.json({ styles });
  });

  router.get("/api/editor/styles/:type/:name", (req, res) => {
    const { type, name } = req.params;
    if (!isStyleType(type) || !isValidName(name)) {
      res.status(400).send("Invalid style type or name");
      return;
    }
    const style = registry().getStyle(type, name);
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
      name: style.name,
      settings,
      assets: {
        icons: [...style.assets.icons.keys()].sort(),
        template: [...style.assets.template.keys()].sort(),
      },
    });
  });

  // --- Asset preview ---------------------------------------------------------
  router.get("/api/editor/styles/:type/:name/asset/:area/:file", (req, res) => {
    const { type, name, area, file } = req.params;
    if (!isStyleType(type) || !isValidName(name) || !isAssetArea(area)) {
      res.status(400).send("Invalid request");
      return;
    }
    const style = registry().getStyle(type, name);
    const asset = style?.assets[area].get(file);
    if (!asset) {
      res.status(404).send("Asset not found");
      return;
    }
    res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store" });
    res.end(asset.buffer);
  });

  // --- Download style as ZIP -------------------------------------------------
  router.get("/api/editor/styles/:type/:name/zip", (req, res) => {
    const { type, name } = req.params;
    if (!isStyleType(type) || !isValidName(name)) {
      res.status(400).send("Invalid style type or name");
      return;
    }
    const style = registry().getStyle(type, name);
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
    const { type, style: styleName } = req.body ?? {};
    if (!isStyleType(type) || !isValidName(styleName)) {
      res.status(400).send("Invalid style type or name");
      return;
    }
    const basePack = registry().getStyle(type, styleName);
    if (!basePack) {
      res.status(400).send(`Unknown style "${styleName}"`);
      return;
    }

    const settingsResult = settingsSchema.safeParse({ ...(req.body?.settings ?? {}), styleName });
    if (!settingsResult.success) {
      res.status(400).send("Invalid settings: " + formatZodError(settingsResult.error));
      return;
    }
    const cardResult = APIBodySchema.safeParse({ ...(req.body?.card ?? {}), style: styleName });
    if (!cardResult.success) {
      res.status(400).send("Invalid card: " + formatZodError(cardResult.error));
      return;
    }

    const previewPack: LoadedStyle = { ...basePack, settings: settingsResult.data };
    const generate = type === "rush" ? rushCardGenerate : cardGenerate;

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

  // --- Save settings ---------------------------------------------------------
  router.post("/api/editor/styles/:type/:name", jsonLarge, (req, res) => {
    const { type, name } = req.params;
    if (!isStyleType(type) || !isValidName(name)) {
      res.status(400).send("Invalid style type or name");
      return;
    }
    const style = registry().getStyle(type, name);
    if (!style) {
      res.status(404).send("Style not found");
      return;
    }

    const incoming = { ...(req.body ?? {}), styleName: name };
    const result = settingsSchema.safeParse(incoming);
    if (!result.success) {
      res.status(400).send("Invalid settings: " + formatZodError(result.error));
      return;
    }

    fs.writeFileSync(path.join(style.directory, "settings.json"), JSON.stringify(incoming, null, 2), "utf8");
    try {
      store.reload();
    } catch (error) {
      res.status(500).send("Saved, but reload failed: " + (error as Error).message);
      return;
    }
    res.json({ ok: true });
  });

  // --- Create a new style (clone of an existing one) -------------------------
  router.post("/api/editor/styles", jsonLarge, (req, res) => {
    const body = req.body ?? {};
    const name = body.name;
    const from = body.from ?? {};
    if (!isValidName(name)) {
      res.status(400).send("Invalid style name. Use letters, numbers, hyphen and underscore only.");
      return;
    }
    if (!isStyleType(from.type) || !isValidName(from.name)) {
      res.status(400).send("Invalid base style");
      return;
    }

    const type = from.type;
    const reg = registry();
    if (reg.getStyle(type, name)) {
      res.status(409).send(`Style "${type}/${name}" already exists`);
      return;
    }
    const source = reg.getStyle(from.type, from.name);
    if (!source) {
      res.status(400).send("Base style not found");
      return;
    }

    const targetDir = path.join(reg.rootDir, "assets", type, name);
    if (fs.existsSync(targetDir)) {
      res.status(409).send(`Directory already exists: ${targetDir}`);
      return;
    }

    fs.cpSync(source.directory, targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, "style.json"), JSON.stringify({ name, type }, null, 2), "utf8");
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
    res.json({ type, name });
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

    let manifest: { name?: unknown; type?: unknown };
    try {
      manifest = JSON.parse(manifestEntry.data.toString("utf8").replace(/^﻿/, ""));
    } catch {
      res.status(400).send("style.json is not valid JSON");
      return;
    }
    const { type, name } = manifest;
    if (!isStyleType(type) || !isValidName(name)) {
      res.status(400).send("style.json has an invalid name or type");
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
    const existing = reg.getStyle(type, name);
    const targetDir = existing ? existing.directory : path.join(reg.rootDir, "assets", type, name);

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
    res.json({ type, name, overrode: Boolean(existing) });
  });

  // --- Replace an asset (icon / template png) --------------------------------
  router.post("/api/editor/styles/:type/:name/asset/:area/:file", jsonLarge, (req, res) => {
    const { type, name, area, file } = req.params;
    if (!isStyleType(type) || !isValidName(name) || !isAssetArea(area)) {
      res.status(400).send("Invalid request");
      return;
    }
    if (!/^[A-Za-z0-9_-]+\.png$/.test(file)) {
      res.status(400).send("Asset file name must be a .png");
      return;
    }
    const style = registry().getStyle(type, name);
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

import express from "express";
import { CardArtLoadError } from "./modules/cardArt.js";
import { cardGenerate, rushCardGenerate } from "./modules/cardGenerate.js";
import { createEditorRouter } from "./modules/editor/editorRouter.js";
import {
  createStyleRegistryStore,
  type LoadedStyle,
  type StyleRegistry,
  type StyleRegistryStore,
  type StyleType,
} from "./modules/styleRegistry.js";
import { APIBodySchema } from "./modules/types.js";
import type { APIBody } from "./modules/types.js";

type StyleRegistryGetter = () => StyleRegistry;
type StyleRegistrySource = StyleRegistry | StyleRegistryGetter;

const getStyleRegistryGetter = (source: StyleRegistrySource): StyleRegistryGetter =>
  typeof source === "function" ? source : () => source;

const cardRoute =
  (
    type: StyleType,
    getStyleRegistry: StyleRegistryGetter,
    generate: (options: APIBody, style: LoadedStyle) => Promise<Buffer>
  ): express.RequestHandler =>
  async (req, res) => {
    const parsedBody = APIBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).send("Error: Input Data Invalid.");
      return;
    }

    const styleRegistry = getStyleRegistry();
    const style = styleRegistry.getStyle(parsedBody.data.section, parsedBody.data.style);
    if (!style || style.type !== type) {
      res.status(400).send(`Error: Unknown Style "${parsedBody.data.section}/${parsedBody.data.style}".`);
      return;
    }

    try {
      const card = await generate(parsedBody.data, style);
      res.writeHead(200, {
        "Content-Type": "image/webp",
      });
      res.end(card);
    } catch (e) {
      if (e instanceof CardArtLoadError) {
        res.status(400).send("Error: art could not be loaded.");
        return;
      }

      console.error(e);
      res.status(500).send("Server Error: Failed to Generate Card.");
    }
  };

const createApp = (styleRegistrySource: StyleRegistrySource, editorStore?: StyleRegistryStore) => {
  const getStyleRegistry = getStyleRegistryGetter(styleRegistrySource);
  const app = express();
  // The editor router declares its own (larger) body parser per route, so it must be
  // mounted before the global parser to keep the public render limit unchanged.
  if (editorStore) {
    app.use("/", createEditorRouter(editorStore));
  }
  app.use(express.json({ limit: "5mb" }));
  app.get("/", (req, res) => {
    const port = process.env.PORT || 8080;
    res.send("Main Server:" + port);
  });

  app.post("/", cardRoute("standard", getStyleRegistry, cardGenerate));
  app.post("/rush", cardRoute("rush", getStyleRegistry, rushCardGenerate));

  return app;
};

const createDefaultApp = () => {
  const styleRegistryStore = createStyleRegistryStore();
  const app = createApp(styleRegistryStore.getStyleRegistry, styleRegistryStore);
  app.locals.styleRegistryStore = styleRegistryStore;
  return app;
};

export { createApp, createDefaultApp };

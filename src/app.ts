import express from "express";
import { cardGenerate } from "./modules/cardGenerate.js";
import { rushCardGenerate } from "./modules/rushCardGenerate.js";
import { loadStyleRegistry, type LoadedStyle, type StyleRegistry, type StyleType } from "./modules/styleRegistry.js";
import { APIBodySchema } from "./modules/types.js";
import type { APIBody } from "./modules/types.js";

const cardRoute =
  (
    type: StyleType,
    styleRegistry: StyleRegistry,
    generate: (options: APIBody, style: LoadedStyle) => Promise<Buffer>
  ): express.RequestHandler =>
  async (req, res) => {
    const parsedBody = APIBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).send("Error: Input Data Invalid.");
      return;
    }

    const style = styleRegistry.getStyle(type, parsedBody.data.style);
    if (!style) {
      res.status(400).send(`Error: Unknown Style "${parsedBody.data.style}".`);
      return;
    }

    try {
      const card = await generate(parsedBody.data, style);
      res.writeHead(200, {
        "Content-Type": "image/webp",
      });
      res.end(card);
    } catch (e) {
      console.error(e);
      res.status(500).send("Server Error: Failed to Generate Card.");
    }
  };

const createApp = (styleRegistry: StyleRegistry) => {
  const app = express();
  app.use(express.json({ limit: "5mb" }));
  app.get("/", (req, res) => {
    const port = process.env.PORT || 8080;
    res.send("Main Server:" + port);
  });

  app.post("/", cardRoute("standard", styleRegistry, cardGenerate));
  app.post("/rush", cardRoute("rush", styleRegistry, rushCardGenerate));

  return app;
};

const createDefaultApp = () => createApp(loadStyleRegistry());

export { createApp, createDefaultApp };

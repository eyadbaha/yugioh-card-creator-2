import express from "express";
import fs from "fs";
import { cardGenerate } from "./modules/cardGenerate.js";
import { rushCardGenerate } from "./modules/rushCardGenerate.js";
import type { CardKind } from "./modules/styleApplierCommon.js";
import { APIBodySchema } from "./modules/types.js";
import type { APIBody, settings } from "./modules/types.js";

const app = express();
app.use(express.json({ limit: "5mb" }));
app.get("/", (req, res) => {
  const port = process.env.PORT || 8080;
  res.send("Main Server:" + port);
});

const cardRoute =
  (kind: CardKind, generate: (options: APIBody, style: settings) => Promise<Buffer>): express.RequestHandler =>
  async (req, res) => {
    const assetsDir = process.env.ASSETS_DIR || `./assets`;
    const parsedBody = APIBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).send("Error: Input Data Invalid.");
      return;
    }
    let settingsFile: string;
    try {
      settingsFile = fs.readFileSync(`${assetsDir}/${kind}/${parsedBody.data.style}/settings.json`, "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") {
        res.status(400).send(`Error: Unknown Style "${parsedBody.data.style}".`);
        return;
      }
      console.error(e);
      res.status(500).send("Server Error: Failed to Generate Card.");
      return;
    }
    try {
      const settings = { ...JSON.parse(settingsFile), styleName: parsedBody.data.style };
      const card = await generate(parsedBody.data, settings);
      res.writeHead(200, {
        "Content-Type": "image/webp",
      });
      res.end(card);
    } catch (e) {
      console.error(e);
      res.status(500).send("Server Error: Failed to Generate Card.");
    }
  };

app.post("/", cardRoute("standard", cardGenerate));
app.post("/rush", cardRoute("rush", rushCardGenerate));
export { app };

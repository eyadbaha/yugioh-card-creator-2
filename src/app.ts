import express from "express";
import { cardGenerate } from "./modules/cardGenerate.js";
import { APIBodySchema } from "./modules/types.js";
import fs from "fs";
import { rushCardGenerate } from "./modules/rushCardGenerate.js";

const app = express();
app.use(express.json({ limit: "1mb" }));
const port = process.env.PORT || 8080;
app.get("/", (req, res) => {
  res.send("Main Server:" + port);
});
app.post("/", async (req, res) => {
  const assetsDir = process.env.ASSETS_DIR || `./assets`;
  if (APIBodySchema.safeParse(req.body).success) {
    try {
      const settingsFile = fs.readFileSync(`${assetsDir}/standard/${req.body.style}/settings.json`, "utf8");
      const settings = JSON.parse(settingsFile);
      const card = await cardGenerate(req.body, settings as any);
      res.writeHead(200, {
        "Content-Type": "image/webp",
      });
      res.end(card);
    } catch (e) {
      console.error(e);
      res.send("Server Error: Failed to Generate Card.");
    }
  } else {
    res.send("Error: Input Data Invalid.");
  }
});
app.post("/rush", async (req, res) => {
  const assetsDir = process.env.ASSETS_DIR || `./assets`;
  if (APIBodySchema.safeParse(req.body).success) {
    try {
      const settingsFile = fs.readFileSync(`${assetsDir}/rush/${req.body.style}/settings.json`, "utf8");
      const settings = JSON.parse(settingsFile) as any;
      const card = await rushCardGenerate(req.body, { ...settings, styleName: req.body.style });
      res.writeHead(200, {
        "Content-Type": "image/webp",
      });
      res.end(card);
    } catch (e) {
      console.error(e);
      res.send("Server Error: Failed to Generate Card.");
    }
  } else {
    res.send("Error: Input Data Invalid.");
  }
});
app.listen(port, () => {
  console.log("App started at http://localhost:" + port);
});

export { app };

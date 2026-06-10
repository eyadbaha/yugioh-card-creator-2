import { createDefaultApp } from "./app.js";

const port = process.env.PORT || 8080;
const app = createDefaultApp();

app.listen(port, () => {
  console.log("App started at http://localhost:" + port);
});

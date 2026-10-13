// Serves only the front-end files. Every API call made by the page is
// intercepted by the tests with page.route, so no API is running.
import { fileURLToPath } from "node:url";
import express from "express";

const PORT = Number(process.env.UI_TEST_PORT ?? 4173);
const app = express();
app.use(express.static(fileURLToPath(new URL("../../web", import.meta.url))));
app.listen(PORT, "127.0.0.1", () => console.log(`static front-end on http://127.0.0.1:${PORT}`));

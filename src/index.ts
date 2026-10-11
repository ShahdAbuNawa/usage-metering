import express from "express";
import { sql } from "drizzle-orm";

import { config } from "./config.js";
import { db } from "./db/index.js";

const app = express();
app.use(express.json());

app.get("/healthz", async (req, res) => {
  await db.execute(sql`select 1`);
  res.status(200).json({ status: "ok" });
});

app.listen(config.port, () => {
  console.log(`Server is running at http://localhost:${config.port}`);
});
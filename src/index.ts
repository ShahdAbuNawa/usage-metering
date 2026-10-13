import express from "express";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { requireApiKey } from "./middleware/apiKey.js";
import { meRouter } from "./routes/me.js";
import { config } from "./config.js";
import { db } from "./db/index.js";

import { seedPredefinedPlans } from "./db/seed.js";
import { usersRouter } from "./routes/users.js";
import { accountsRouter } from "./routes/accounts.js";
import { plansRouter } from "./routes/plans.js";
import { consumeRouter } from "./routes/consume.js";

await migrate(db, { migrationsFolder: "./src/db/migrations" });
await seedPredefinedPlans();
 
const app = express();
app.use(express.json());
app.use("/accounts", accountsRouter);
app.use("/me", requireApiKey, meRouter);
app.use("/users", requireApiKey, usersRouter);
app.use("/plans", requireApiKey, plansRouter);
app.use("/consume", requireApiKey, consumeRouter);
app.get("/healthz", async (req, res) => {
  await db.execute(sql`select 1`);
  res.status(200).json({ status: "ok" });
});

app.listen(config.port, () => {
  console.log(`Server is running at http://localhost:${config.port}`);
});
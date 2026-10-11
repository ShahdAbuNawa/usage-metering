import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema.js";
import { config } from "../config.js";

export const client = postgres(config.dbUrl);
export const db = drizzle(client, { schema });
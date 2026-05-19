import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Add it to .env.local from Supabase Dashboard → Project Settings → Database.",
  );
}

const client = postgres(connectionString, { prepare: false });

export const db = drizzle(client, { schema });
export { schema };

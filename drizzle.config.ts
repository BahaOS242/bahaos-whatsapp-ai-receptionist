import { defineConfig } from "drizzle-kit";

// Only used by `db:generate` (no DB connection needed) and `db:migrate`
// (needs a real DATABASE_URL). Not invoked by the app itself.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ?? "postgres://placeholder:placeholder@localhost:5432/placeholder",
  },
});

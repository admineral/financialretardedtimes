import "server-only";
import postgres from "postgres";

// One bounded connection pool per Node process; never exported to client components.
// Always the Supabase project's database: a generic DATABASE_URL may belong to
// another integration (e.g. Prisma Postgres) that lacks the archive tables.
let database: ReturnType<typeof postgres> | undefined;
export function archiveDatabase() {
  if (!database) {
    const project = new URL(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    ).hostname.split(".")[0];
    if (!process.env.SUPABASE_DB_PASSWORD)
      throw new Error("Archive database credentials are not configured.");
    database = postgres({
      max: 4,
      prepare: false,
      idle_timeout: 20,
      connect_timeout: 15,
      connection: { statement_timeout: 120_000 },
      host:
        process.env.SUPABASE_DB_HOST ?? "aws-1-eu-central-1.pooler.supabase.com",
      port: 5432,
      database: "postgres",
      username: `postgres.${project}`,
      password: process.env.SUPABASE_DB_PASSWORD,
      ssl: "require",
    });
  }
  return database;
}

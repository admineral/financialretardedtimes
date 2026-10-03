import "server-only";
import postgres from "postgres";

// One bounded connection pool per Node process; never exported to client components.
let database: ReturnType<typeof postgres> | undefined;
export function archiveDatabase() {
  const url = process.env.DATABASE_URL;
  const options = {
    max: 4,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 15,
    connection: { statement_timeout: 120_000 },
  };
  if (!database) {
    if (url?.startsWith("postgres")) database = postgres(url, options);
    else {
      // This project already provisions a Supabase password and regional pooler.
      const project = new URL(
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      ).hostname.split(".")[0];
      if (!process.env.SUPABASE_DB_PASSWORD)
        throw new Error("Archive database credentials are not configured.");
      database = postgres({
        ...options,
        host:
          process.env.SUPABASE_DB_HOST ??
          "aws-1-eu-central-1.pooler.supabase.com",
        port: 5432,
        database: "postgres",
        username: `postgres.${project}`,
        password: process.env.SUPABASE_DB_PASSWORD,
        ssl: "require",
      });
    }
  }
  return database;
}

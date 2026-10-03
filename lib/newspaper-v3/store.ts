import "server-only";
import { randomUUID } from "node:crypto";
import { archiveDatabase } from "@/lib/archive/database";
import { DAILY_LIMIT, MODEL, PROMPT_VERSION } from "./schema";
import type { ReplayPreview } from "./prepare";
export class RunLimitError extends Error {}
export async function claimRun(summary: ReplayPreview) {
  return archiveDatabase().begin(async (sql) => {
    await sql`SELECT pg_advisory_xact_lock(52935003)`;
    await sql`UPDATE newspaper_v3_runs SET status='failed', error='Generation timed out. Please start a new run.', completed_at=now() WHERE status='running' AND expires_at < now()`;
    const active =
      await sql`SELECT id FROM newspaper_v3_runs WHERE status='running' LIMIT 1`;
    if (active.length)
      throw new RunLimitError(
        "Eine Ausgabe wird bereits erstellt. Bitte später erneut versuchen.",
      );
    const [usage] =
      await sql`SELECT count(*)::int AS count FROM newspaper_v3_runs WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`;
    if (usage.count >= DAILY_LIMIT)
      throw new RunLimitError(
        "Das Tageslimit von drei Generierungen ist erreicht. Reset um 00:00 UTC.",
      );
    const id = randomUUID();
    await sql`INSERT INTO newspaper_v3_runs(id,status,expires_at,model,prompt_version,fingerprint,input_data) VALUES (${id},'running',now()+interval '5 minutes',${MODEL},${PROMPT_VERSION},${summary.fingerprint},${sql.json(JSON.parse(JSON.stringify(summary)))})`;
    return id;
  });
}
export async function getRun(id: string) {
  const [row] =
    await archiveDatabase()`SELECT * FROM newspaper_v3_runs WHERE id=${id}`;
  if (
    row?.status === "running" &&
    new Date(row.expires_at).getTime() < Date.now()
  )
    return {
      ...row,
      status: "failed",
      error: "Generation timed out. Please start a new run.",
    };
  return row ?? null;
}
export async function listRuns() {
  return archiveDatabase()`SELECT id, status, created_at, input_data, output_data->'issue'->>'headline' AS headline FROM newspaper_v3_runs ORDER BY created_at DESC LIMIT 12`;
}

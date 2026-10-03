import "server-only";
import { randomUUID } from "node:crypto";
import { archiveDatabase } from "@/lib/archive/database";
import { V4_CONFIG } from "./config";
import type { EditionPreview } from "./prepare";

export class EditionLimitError extends Error {}
export async function claimEdition(summary: EditionPreview) {
  return archiveDatabase().begin(async (sql) => {
    await sql`SELECT pg_advisory_xact_lock(52935004)`;
    await sql`UPDATE newspaper_v4_editions SET status='failed', error='Zeitüberschreitung. Bitte neu starten.', completed_at=now() WHERE status='running' AND expires_at < now()`;
    const active =
      await sql`SELECT id FROM newspaper_v4_editions WHERE status='running' LIMIT 1`;
    if (active.length)
      throw new EditionLimitError(
        "Eine Ausgabe ist bereits im Druck. Bitte kurz warten.",
      );
    const [usage] =
      await sql`SELECT count(*)::int AS count FROM newspaper_v4_editions WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`;
    if (usage.count >= V4_CONFIG.dailyLimit)
      throw new EditionLimitError(
        `Das Tageslimit von ${V4_CONFIG.dailyLimit} Ausgaben ist erreicht. Reset um 00:00 UTC.`,
      );
    const id = randomUUID();
    await sql`INSERT INTO newspaper_v4_editions(id,status,expires_at,model,prompt_version,fingerprint,input_data) VALUES (${id},'running',now()+make_interval(mins => ${V4_CONFIG.runMinutes}),${V4_CONFIG.model},${V4_CONFIG.promptVersion},${summary.fingerprint},${sql.json(JSON.parse(JSON.stringify(summary)))})`;
    return id;
  });
}

export async function getEdition(id: string) {
  const [row] = await archiveDatabase()`
    SELECT e.*, (SELECT count(*)::int FROM newspaper_v4_editions p WHERE p.status='succeeded' AND p.created_at <= e.created_at) AS number
    FROM newspaper_v4_editions e WHERE id=${id}`;
  if (row?.status === "running" && new Date(row.expires_at).getTime() < Date.now())
    return { ...row, status: "failed", error: "Zeitüberschreitung. Bitte neu starten." };
  return row ?? null;
}

export async function latestEditionId(): Promise<string | null> {
  const [row] =
    await archiveDatabase()`SELECT id FROM newspaper_v4_editions WHERE status='succeeded' ORDER BY created_at DESC LIMIT 1`;
  return row?.id ?? null;
}

export async function listEditions() {
  return archiveDatabase()`SELECT id, status, created_at, input_data->'input'->>'horizon' AS horizon, input_data->>'start' AS start, input_data->>'end' AS "end", output_data->'issue'->>'headline' AS headline, (output_data->'issue'->'mood'->>'score')::int AS mood FROM newspaper_v4_editions ORDER BY created_at DESC LIMIT 24`;
}

import "server-only";
import { generateText, Output } from "ai";
import { openai } from "@ai-sdk/openai";
import { archiveDatabase } from "@/lib/archive/database";
import { V4_CONFIG } from "./config";
import { SYSTEM_PROMPT, marketStats, type MarketStats } from "./prompt";
import { issueSchema, type Issue } from "./schema";
import type { BtcCandle } from "@/lib/archive/types";
import { sanitizeIssue } from "./sanitize";
import type { prepareEdition } from "./prepare";

export async function generateEdition(
  id: string,
  prepared: Awaited<ReturnType<typeof prepareEdition>>,
) {
  const sql = archiveDatabase();
  try {
    const result = await generateText({
      model: openai(V4_CONFIG.model),
      instructions: SYSTEM_PROMPT,
      prompt: prepared.prompt,
      output: Output.object({ schema: issueSchema }),
      maxOutputTokens: V4_CONFIG.outputReserve,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout((V4_CONFIG.runMinutes * 60 - 20) * 1000),
    });
    const { summary, corpus, horizon } = prepared;
    const issue = sanitizeIssue(
      issueSchema.parse(result.output),
      corpus.messages,
      summary.start,
      summary.end,
    );
    const cited = new Set(issue.cast.flatMap((c) => c.sourceIds));
    const output = {
      issue,
      candles: horizon,
      stats: marketStats(horizon),
      evidence: corpus.messages
        .filter((m) => cited.has(m.id))
        .map(({ id, username, timestamp, date, originalText }) => ({
          id,
          username,
          timestamp: timestamp ?? date,
          text: originalText,
        })),
    };
    const saved =
      await sql`UPDATE newspaper_v4_editions SET status='succeeded',output_data=${sql.json(JSON.parse(JSON.stringify(output)))},usage=${sql.json(JSON.parse(JSON.stringify(result.usage)))},completed_at=now() WHERE id=${id} AND status='running' RETURNING id`;
    if (!saved.length)
      throw new Error("Edition expired before persistence completed.");
  } catch (error) {
    console.error(
      "[newspaper-v4]",
      error instanceof Error ? error.message : "Generation failed",
    );
    await sql`UPDATE newspaper_v4_editions SET status='failed',error='Die KI-Ausgabe konnte nicht erstellt werden. Frühere Ausgaben sind sicher.',completed_at=now() WHERE id=${id} AND status='running'`;
  }
}
export type EditionOutput = {
  issue: Issue;
  candles: BtcCandle[];
  stats: MarketStats;
  evidence: Array<{ id: string; username: string; timestamp: string | null; text: string }>;
};

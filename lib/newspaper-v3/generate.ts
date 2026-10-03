import "server-only";
import { generateText, Output } from "ai";
import { openai } from "@ai-sdk/openai";
import { archiveDatabase } from "@/lib/archive/database";
import { rangeBounds } from "@/lib/archive/filter";
import { issueSchema, MODEL, OUTPUT_RESERVE, type ReplayIssue } from "./schema";
import { SYSTEM_PROMPT } from "./prompt";
import type { prepareReplay } from "./prepare";
import type { ArchiveMessage } from "@/lib/archive/types";
export function validateEvidence(
  issue: ReplayIssue,
  messages: ArchiveMessage[],
  from: string,
  to: string,
) {
  const ids = new Set(messages.map((m) => m.id)),
    users = new Set(messages.map((m) => m.username));
  const { start, end } = rangeBounds(from, to);
  for (const block of [
    ...issue.articles,
    ...issue.chat,
    ...issue.participants,
  ]) {
    if (block.sourceIds.some((id) => !ids.has(id)))
      throw new Error("Model returned unknown archive references.");
    if ("username" in block && !users.has(block.username))
      throw new Error("Model returned an unknown participant.");
  }
  for (const message of issue.chat)
    if (
      Date.parse(message.timestamp) < +start ||
      Date.parse(message.timestamp) >= +end
    )
      throw new Error("Model returned a message outside the replay week.");
}
export async function generateReplay(
  id: string,
  prepared: Awaited<ReturnType<typeof prepareReplay>>,
) {
  const sql = archiveDatabase();
  try {
    const result = await generateText({
      model: openai(MODEL),
      instructions: SYSTEM_PROMPT,
      prompt: prepared.prompt,
      output: Output.object({ schema: issueSchema }),
      maxOutputTokens: OUTPUT_RESERVE,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(240_000),
    });
    const issue = issueSchema.parse(result.output);
    validateEvidence(
      issue,
      prepared.corpus.messages,
      prepared.replayFrom,
      prepared.replayTo,
    );
    issue.chat.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const references = new Set(
      [...issue.articles, ...issue.chat, ...issue.participants].flatMap(
        (x) => x.sourceIds,
      ),
    );
    const output = {
      issue,
      evidence: prepared.corpus.messages.filter((m) => references.has(m.id)),
      btc: prepared.btc,
    };
    const saved =
      await sql`UPDATE newspaper_v3_runs SET status='succeeded',output_data=${sql.json(JSON.parse(JSON.stringify(output)))},usage=${sql.json(JSON.parse(JSON.stringify(result.usage)))},completed_at=now() WHERE id=${id} AND status='running' RETURNING id`;
    if (!saved.length)
      throw new Error("Run expired before persistence completed.");
  } catch (error) {
    console.error(
      "[newspaper-v3]",
      error instanceof Error ? error.message : "Generation failed",
    );
    await sql`UPDATE newspaper_v3_runs SET status='failed',error='Generation or validation failed. Previous editions are safe.',completed_at=now() WHERE id=${id} AND status='running'`;
  }
}

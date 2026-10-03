import type { ArchiveMessage } from "@/lib/archive/types";
import type { Issue } from "./schema";

// The model occasionally drifts: unknown names or timestamps outside the
// edition. Drop those entries instead of throwing away a whole (paid) edition.
export function sanitizeIssue(
  issue: Issue,
  voice: ArchiveMessage[],
  start: string,
  end: string,
): Issue {
  const users = new Map(voice.map((m) => [m.username.toLowerCase(), m.username]));
  const ids = new Set(voice.map((m) => m.id));
  const known = (name: string) => users.get(name.replace(/^@/, "").toLowerCase());
  const from = Date.parse(start),
    until = Date.parse(end);
  const inside = (t: string) => {
    const time = Date.parse(t);
    return time >= from && time <= until;
  };
  const named = <T extends { username: string }>(items: T[]) =>
    items.flatMap((item) => {
      const username = known(item.username);
      return username ? [{ ...item, username }] : [];
    });
  const chat = named(issue.chat)
    .filter((m) => inside(m.timestamp))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  if (chat.length < 6)
    throw new Error("Model returned too few valid chat messages.");
  const quoteName = known(issue.lead.pullQuote.username);
  return {
    ...issue,
    lead: {
      ...issue.lead,
      pullQuote: { ...issue.lead.pullQuote, username: quoteName ?? "Redaktion" },
    },
    chat,
    moments: issue.moments
      .filter((m) => inside(m.timestamp))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    cast: named(issue.cast).map((c) => ({
      ...c,
      sourceIds: c.sourceIds.filter((id) => ids.has(id)),
    })),
    predictions: named(issue.predictions).map((p) => ({
      ...p,
      target: p.target && p.target > 0 ? p.target : null,
    })),
  };
}

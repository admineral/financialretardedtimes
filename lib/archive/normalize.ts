import { createHash } from "node:crypto";
import { load } from "cheerio";
import { getNewspaperDateKey } from "@/app/newspaper/lib/timezone";
import type { ArchiveCorpus, ArchiveCoverage, ArchiveMessage } from "./types";

export function normalizeTimestamp(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const numeric = Number(raw);
  const value =
    Number.isFinite(numeric) && numeric > 1e9
      ? numeric * (numeric < 1e12 ? 1000 : 1)
      : String(raw);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function readableText(raw: string): string {
  if (!/<\/?[a-z][\s\S]*>/i.test(raw)) return raw;
  const $ = load(raw);
  $("br").replaceWith("\n");
  $("script,style").remove();
  return $.root().text();
}

export function summarize(
  messages: ArchiveMessage[],
  duplicateCount = 0,
  conflictCount = 0,
): ArchiveCoverage {
  const days = new Map<string, number>();
  const people = new Map<string, number>();
  let undatedCount = 0;
  for (const message of messages) {
    if (message.date) days.set(message.date, (days.get(message.date) ?? 0) + 1);
    if (!message.timestamp) undatedCount++;
    people.set(message.username, (people.get(message.username) ?? 0) + 1);
  }
  const orderedDays = [...days]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));
  return {
    messageCount: messages.length,
    participantCount: people.size,
    firstDate: orderedDays[0]?.date ?? null,
    lastDate: orderedDays.at(-1)?.date ?? null,
    undatedCount,
    duplicateCount,
    conflictCount,
    days: orderedDays,
    participants: [...people]
      .map(([username, count]) => ({ username, count }))
      .sort(
        (a, b) => b.count - a.count || a.username.localeCompare(b.username),
      ),
    notes: [
      "Counts describe saved message bodies. Days without saved messages have unknown coverage; they are not proof of an empty chat.",
      ...(undatedCount
        ? [
            `${undatedCount} messages have no exact timestamp; original values are retained.`,
          ]
        : []),
      ...(conflictCount
        ? [
            `${conflictCount} conflicting source records are retained separately.`,
          ]
        : []),
    ],
  };
}

export class ArchiveAccumulator {
  private messages = new Map<string, ArchiveMessage>();
  private signatures = new Map<string, string>();
  private duplicateCount = 0;
  private conflictCount = 0;

  add(
    room: string,
    username: string,
    raw: Record<string, unknown>,
    table: ArchiveMessage["sources"][number]["table"],
    key: string,
    day?: string,
  ) {
    if (typeof raw.text !== "string")
      throw new Error(
        "Archive contains a message without a text field; export stopped.",
      );
    const timestamp = normalizeTimestamp(raw.time);
    const sourceId = raw.id == null || raw.id === "" ? null : String(raw.id);
    const signature = JSON.stringify([
      room,
      username,
      timestamp ? timestamp.slice(0, 19) : String(raw.time ?? ""),
      raw.text,
    ]);
    const digest = createHash("sha256")
      .update(signature)
      .digest("hex")
      .slice(0, 20);
    const base = `${room}:${sourceId ?? `source-${createHash("sha256").update(key).digest("hex").slice(0, 20)}`}`;
    const id = `${base}:${digest}`;
    const source = { table, key, rawTime: String(raw.time ?? "") };
    const existing = this.messages.get(id);
    if (existing) {
      if (
        !existing.sources.some(
          (item) => item.table === table && item.key === key,
        )
      )
        existing.sources.push(source);
      if (timestamp && !timestamp.endsWith(".000Z")) {
        existing.timestamp = timestamp;
        existing.rawTime = String(raw.time ?? "");
      }
      this.duplicateCount++;
      return;
    }
    if (this.signatures.has(base) && this.signatures.get(base) !== signature)
      this.conflictCount++;
    this.signatures.set(base, signature);
    this.messages.set(id, {
      id,
      sourceId,
      room,
      username,
      timestamp,
      date: timestamp
        ? getNewspaperDateKey(new Date(timestamp))
        : (day ?? null),
      rawTime: String(raw.time ?? ""),
      originalText: raw.text,
      text: readableText(raw.text),
      sources: [source],
    });
  }

  finish(
    include: (message: ArchiveMessage) => boolean = () => true,
  ): ArchiveCorpus {
    const messages = [...this.messages.values()]
      .filter(include)
      .sort(
        (a, b) =>
          (a.date ?? "9999").localeCompare(b.date ?? "9999") ||
          (a.timestamp ?? "z").localeCompare(b.timestamp ?? "z") ||
          a.id.localeCompare(b.id),
      );
    return {
      messages,
      coverage: summarize(messages, this.duplicateCount, this.conflictCount),
      fingerprint: createHash("sha256")
        .update(messages.map((message) => message.id).join("\n"))
        .digest("hex"),
      readAt: new Date().toISOString(),
    };
  }
}

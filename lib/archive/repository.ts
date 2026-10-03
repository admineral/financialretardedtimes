import "server-only";
import { after } from "next/server";
import { archiveDatabase } from "./database";
import { ArchiveAccumulator } from "./normalize";
import { matchesFilter, rangeBounds } from "./filter";
import { BoundedCache } from "./cache";
import type { ArchiveCorpus, ArchiveCoverage, ArchiveFilter } from "./types";
import { addDaysToDateKey } from "@/app/newspaper/lib/timezone";

// Raw histories are never serialized into Next's component cache. Only a bounded
// working set lives in memory; the small inventory survives cold starts in SQL.
const corpora = new BoundedCache<ArchiveCorpus>(192 * 1024 * 1024, (value) =>
  value.messages.reduce(
    (bytes, m) => bytes + 700 + m.originalText.length * 4,
    0,
  ),
);
const inventories = new BoundedCache<Inventory>(
  2 * 1024 * 1024,
  (value) => JSON.stringify(value).length * 2,
);
interface Inventory {
  coverage: ArchiveCoverage;
  fingerprint: string;
  readAt: string;
}
const INVENTORY_VERSION = "archive.v2.seconds";

export async function storedRooms(): Promise<string[]> {
  const rows =
    await archiveDatabase()`SELECT room_id FROM tv_chat_messages UNION SELECT room_id FROM tv_user_activity_messages ORDER BY room_id`;
  return rows.map((row) => String(row.room_id));
}

async function loadArchive(filter: ArchiveFilter): Promise<ArchiveCorpus> {
  return archiveDatabase().begin(
    "isolation level repeatable read read only",
    async (sql) => {
      const accumulator = new ArchiveAccumulator();
      const from = filter.from
        ? rangeBounds(filter.from, filter.from).start.toISOString()
        : null;
      const until = filter.to
        ? rangeBounds(filter.to, filter.to).end.toISOString()
        : null;
      for await (const rows of sql`
      SELECT id, username, time::text, text FROM tv_chat_messages
      WHERE room_id = ${filter.room}
      ${filter.username ? sql`AND username = ${filter.username}` : sql``}
      ${from ? sql`AND time >= ${from}::timestamptz` : sql``}
      ${until ? sql`AND time < ${until}::timestamptz` : sql``}
      ORDER BY time, id`.cursor(5000)) {
        for (const row of rows)
          accumulator.add(
            filter.room,
            row.username,
            row,
            "tv_chat_messages",
            `${filter.room}/${row.id}`,
          );
      }
      // Profile days are scrape buckets. Include neighboring days, then filter on
      // normalized message timestamps, to handle UTC/Berlin boundary differences.
      for await (const rows of sql`
      SELECT username, date::text, messages FROM tv_user_activity_messages
      WHERE room_id = ${filter.room}
      ${filter.username ? sql`AND username = ${filter.username}` : sql``}
      ${filter.from ? sql`AND date >= ${addDaysToDateKey(filter.from, -1)}::date` : sql``}
      ${filter.to ? sql`AND date <= ${addDaysToDateKey(filter.to, 1)}::date` : sql``}
      ORDER BY username, date`.cursor(5000)) {
        for (const row of rows) {
          if (!Array.isArray(row.messages))
            throw new Error("Invalid profile archive record; export stopped.");
          row.messages.forEach(
            (message: Record<string, unknown>, index: number) => {
              accumulator.add(
                filter.room,
                row.username,
                message,
                "tv_user_activity_messages",
                `${filter.room}/${row.username}/${row.date}/${index}`,
                row.date,
              );
            },
          );
        }
      }
      return accumulator.finish((message) => matchesFilter(message, filter));
    },
  );
}

export function readArchive(filter: ArchiveFilter): Promise<ArchiveCorpus> {
  const key = JSON.stringify([
    filter.room,
    filter.username ?? "",
    filter.from ?? "",
    filter.to ?? "",
  ]);
  return corpora.get(key, () => loadArchive(filter), 5 * 60_000);
}

async function refreshInventory(room: string): Promise<Inventory> {
  const corpus = await readArchive({ room });
  const result = {
    coverage: corpus.coverage,
    fingerprint: corpus.fingerprint,
    readAt: corpus.readAt,
  };
  await archiveDatabase()`INSERT INTO archive_inventory_cache(room_id,format_version,payload,updated_at) VALUES (${room},${INVENTORY_VERSION},${JSON.stringify(result)}::jsonb,now()) ON CONFLICT(room_id) DO UPDATE SET format_version=excluded.format_version,payload=excluded.payload,updated_at=excluded.updated_at`;
  return result;
}

export async function readInventory(room: string): Promise<Inventory> {
  return inventories.get(
    room,
    async () => {
      const [cached] =
        await archiveDatabase()`SELECT payload, updated_at FROM archive_inventory_cache WHERE room_id=${room} AND format_version=${INVENTORY_VERSION}`;
      if (cached) {
        if (Date.now() - new Date(cached.updated_at).getTime() > 5 * 60_000)
          after(() => refreshInventory(room).then(() => undefined));
        return cached.payload as Inventory;
      }
      return refreshInventory(room);
    },
    60_000,
  );
}

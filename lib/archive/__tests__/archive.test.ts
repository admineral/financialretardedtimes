import { describe, expect, it } from "vitest";
import { ArchiveAccumulator } from "../normalize";
import { matchesFilter, parseArchiveFilter, rangeBounds } from "../filter";
import { jsonExport, markdownExport, textStream } from "../serialize";
import { fetchBtcHistory, priceReference } from "../prices";
import type { BtcCandle } from "../types";
function corpus() {
  const a = new ArchiveAccumulator();
  a.add(
    "bitcoin_de_DE",
    "alice",
    {
      id: "1",
      time: "2026-08-01T10:00:00Z",
      text: "First\n<script>bad()</script><b>bold</b>",
    },
    "tv_chat_messages",
    "room/1",
  );
  a.add(
    "bitcoin_de_DE",
    "alice",
    {
      id: "1",
      time: 1785578400,
      text: "First\n<script>bad()</script><b>bold</b>",
    },
    "tv_user_activity_messages",
    "profile/1",
    "2026-08-01",
  );
  a.add(
    "bitcoin_de_DE",
    "alice",
    { id: "1", time: "2026-08-01T10:00:00Z", text: "Conflicting original" },
    "tv_user_activity_messages",
    "profile/2",
    "2026-08-01",
  );
  a.add(
    "bitcoin_de_DE",
    "bob",
    { id: "2", time: "2026-08-01T10:00:00Z", text: "Same timestamp, other ID" },
    "tv_user_activity_messages",
    "profile/3",
    "2026-08-01",
  );
  a.add(
    "bitcoin_de_DE",
    "bob",
    { id: "3", time: "invalid", text: "Missing time" },
    "tv_user_activity_messages",
    "profile/4",
    "2026-08-02",
  );
  return a.finish();
}
describe("canonical archive", () => {
  it("merges cross-source IDs across timestamp representations and retains conflicts and ties", () => {
    const c = corpus();
    expect(c.messages).toHaveLength(4);
    expect(c.coverage.duplicateCount).toBe(1);
    expect(c.coverage.conflictCount).toBe(1);
    expect(
      c.messages.find((m) => m.originalText.startsWith("First"))?.sources,
    ).toHaveLength(2);
    expect(
      c.messages.find((m) => m.originalText.startsWith("First"))?.text,
    ).not.toContain("bad()");
    expect(
      c.messages.find((m) => m.originalText.startsWith("First"))?.originalText,
    ).toContain("<script>");
    expect(c.coverage.undatedCount).toBe(1);
    expect(c.coverage.participantCount).toBe(2);
  });
  it("filters saved dates without dropping profile-only messages", () => {
    expect(
      corpus().messages.filter((m) =>
        matchesFilter(m, {
          room: "bitcoin_de_DE",
          from: "2026-08-02",
          to: "2026-08-02",
        }),
      ),
    ).toHaveLength(1);
  });
  it("fails rather than silently skipping malformed records", () => {
    expect(() =>
      new ArchiveAccumulator().add(
        "room",
        "u",
        { id: "x" },
        "tv_chat_messages",
        "x",
      ),
    ).toThrow();
  });
  it("rejects impossible dates and reversed ranges", () => {
    expect(() =>
      parseArchiveFilter(new URLSearchParams("from=2026-02-30")),
    ).toThrow();
    expect(() =>
      parseArchiveFilter(new URLSearchParams("from=2026-08-02&to=2026-08-01")),
    ).toThrow();
  });
  it("uses Berlin day bounds across daylight-saving transitions", () => {
    const spring = rangeBounds("2026-03-29", "2026-03-29"),
      fall = rangeBounds("2026-10-25", "2026-10-25");
    expect(+spring.end - +spring.start).toBe(23 * 3600000);
    expect(+fall.end - +fall.start).toBe(25 * 3600000);
  });
  it("exports complete parseable JSON and Markdown with identical IDs", async () => {
    const c = corpus(),
      filter = { room: "bitcoin_de_DE" },
      json = JSON.parse(
        await new Response(textStream(jsonExport(c, filter, null))).text(),
      ),
      markdown = [...markdownExport(c, filter, null)].join("");
    expect(json.schemaVersion).toBe("frt.archive.v1");
    expect(json.messages).toHaveLength(c.messages.length);
    for (const message of c.messages) {
      expect(markdown).toContain(message.id);
      expect(
        json.messages.find((m: { id: string }) => m.id === message.id)
          .originalText,
      ).toBe(message.originalText);
    }
  });
});
describe("BTC alignment and pagination", () => {
  const candle: BtcCandle = {
    id: "c",
    openTime: "2026-08-01T10:00:00Z",
    closeTime: "2026-08-01T10:59:59.999Z",
    open: 100,
    high: 110,
    low: 90,
    close: 105,
    volume: 1,
  };
  it("never uses an unfinished or stale candle", () => {
    expect(priceReference([candle], "2026-08-01T10:30:00Z")).toBeNull();
    expect(priceReference([candle], "2026-08-01T11:15:00Z")?.price).toBe(105);
    expect(priceReference([candle], "2026-08-01T12:15:00Z")).toBeNull();
    expect(priceReference([candle], null)).toBeNull();
  });
  it("paginates beyond 1000 candles without duplicates", async () => {
    const start = Date.parse("2025-01-01T00:00:00Z"),
      end = start + 1100 * 3600000,
      cursors: number[] = [];
    const mock = async (url: RequestInfo | URL) => {
      const p = new URL(String(url)).searchParams,
        cursor = Number(p.get("startTime"));
      cursors.push(cursor);
      const rows = [];
      for (let t = cursor; t < end && rows.length < 1000; t += 3600000)
        rows.push([t, "1", "2", "0.5", "1.5", "10", t + 3599999]);
      return Response.json(rows);
    };
    const data = await fetchBtcHistory(
      new Date(start),
      new Date(end),
      mock as typeof fetch,
    );
    expect(cursors).toHaveLength(2);
    expect(data.candles).toHaveLength(1101);
    expect(new Set(data.candles.map((c) => c.id)).size).toBe(1101);
    expect(data.missingHours).toBe(0);
  });
  it("reports provider failure as missing coverage", async () => {
    const history = await fetchBtcHistory(
      new Date("2025-01-01"),
      new Date("2025-01-02"),
      (async () => new Response("", { status: 503 })) as typeof fetch,
    );
    expect(history.missingHours).toBeGreaterThan(0);
    expect(history.candles).toEqual([]);
  });
});

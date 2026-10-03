import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { ArchiveAccumulator } from "@/lib/archive/normalize";
import { matchesFilter } from "@/lib/archive/filter";
import { buildReplayPrompt } from "../prompt";
import { CONFIRMATION, defaultReplay, replaySchema } from "../schema";
import { POST } from "@/app/api/newspaper-v3/runs/route";
const btc = {
  source: "Binance",
  symbol: "BTCUSDT",
  quoteCurrency: "USDT",
  interval: "1h",
  candles: [],
  missingHours: 0,
  notes: [],
} as const;
it("requires the exact confirmation before preparing data or calling a model", async () => {
  const response = await POST(
    new Request("http://localhost/api/newspaper-v3/runs", {
      method: "POST",
      body: JSON.stringify({
        confirmation: "yes",
        fingerprint: "a".repeat(64),
        input: {
          room: "bitcoin_de_DE",
          trainingFrom: "2026-07-01",
          cutoff: "2026-08-01",
        },
      }),
    }),
  );
  expect(response.status).toBe(400);
  expect(CONFIRMATION).toBe("yes generate new");
});
describe("replay boundaries", () => {
  it("defaults to 30 training days and seven completed replay days", () => {
    expect(defaultReplay(new Date("2026-09-05T12:00:00Z"))).toEqual({
      room: "bitcoin_de_DE",
      trainingFrom: "2026-07-30",
      cutoff: "2026-08-28",
    });
  });
  it("keeps original raw text and excludes withheld messages", () => {
    const a = new ArchiveAccumulator();
    a.add(
      "bitcoin_de_DE",
      "u",
      { id: "1", time: "2026-08-01T12:00:00Z", text: "ORIGINAL\n<quoted>" },
      "tv_chat_messages",
      "1",
    );
    a.add(
      "bitcoin_de_DE",
      "u",
      { id: "2", time: "2026-08-02T12:00:00Z", text: "WITHHELD SECRET" },
      "tv_chat_messages",
      "2",
    );
    const c = a.finish();
    c.messages = c.messages.filter((m) =>
      matchesFilter(m, {
        room: "bitcoin_de_DE",
        from: "2026-07-01",
        to: "2026-08-01",
      }),
    );
    const p = buildReplayPrompt(
      {
        room: "bitcoin_de_DE",
        trainingFrom: "2026-07-01",
        cutoff: "2026-08-01",
      },
      c,
      { ...btc, candles: [], notes: [] },
    );
    expect(p.prompt).toContain("ORIGINAL\\n<quoted>");
    expect(p.prompt).not.toContain("WITHHELD SECRET");
    expect(p.inputTokens).toBeGreaterThan(4096);
    expect(p.fits).toBe(true);
  });
  it("rejects replay periods that include the future", () => {
    expect(() =>
      replaySchema.parse({
        room: "bitcoin_de_DE",
        trainingFrom: "2099-01-01",
        cutoff: "2099-01-30",
      }),
    ).toThrow();
  });
});

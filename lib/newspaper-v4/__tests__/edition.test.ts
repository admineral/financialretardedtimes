import { describe, expect, it } from "vitest";
import { sanitizeIssue } from "../sanitize";
import { editionWindow } from "../window";
import { editionInputSchema, type Issue } from "../schema";
import type { ArchiveMessage } from "@/lib/archive/types";

const voice = [
  { id: "a1", username: "HodlHans" },
  { id: "b1", username: "BearBernd" },
] as ArchiveMessage[];
const msg = (username: string, timestamp: string) => ({
  username,
  timestamp,
  text: "x",
  stance: "bull" as const,
});
const issue = {
  kicker: "",
  headline: "H",
  deck: "",
  mood: { score: 0, label: "", explanation: "" },
  lead: { title: "", body: "", pullQuote: { username: "Ghost", text: "" } },
  articles: [],
  moments: [
    { timestamp: "2026-10-02T12:00:00Z", title: "", caption: "" },
    { timestamp: "2026-09-01T12:00:00Z", title: "", caption: "" },
  ],
  chat: [
    ...Array.from({ length: 6 }, (_, i) => msg("hodlhans", `2026-10-02T1${i}:00:00Z`)),
    msg("Ghost", "2026-10-02T12:00:00Z"),
    msg("BearBernd", "2026-10-09T12:00:00Z"),
  ],
  cast: [{ username: "BearBernd", role: "", bio: "", stance: "bear", sourceIds: ["b1", "zz"] }],
  predictions: [{ username: "HodlHans", call: "", target: -5 }],
  briefs: [],
  ticker: [],
} as Issue;

describe("sanitizeIssue", () => {
  const clean = sanitizeIssue(issue, voice, "2026-10-01T00:00:00Z", "2026-10-03T00:00:00Z");
  it("drops unknown users and out-of-range messages, normalizes names", () => {
    expect(clean.chat).toHaveLength(6);
    expect(clean.chat.every((m) => m.username === "HodlHans")).toBe(true);
    expect(clean.moments).toHaveLength(1);
    expect(clean.lead.pullQuote.username).toBe("Redaktion");
    expect(clean.cast[0].sourceIds).toEqual(["b1"]);
    expect(clean.predictions[0].target).toBeNull();
  });
  it("rejects editions with too little valid chat", () => {
    expect(() =>
      sanitizeIssue({ ...issue, chat: issue.chat.slice(6) }, voice, "2026-10-01T00:00:00Z", "2026-10-03T00:00:00Z"),
    ).toThrow();
  });
});

describe("editionWindow", () => {
  const now = new Date("2026-10-03T18:40:00Z");
  it("blind mode ends the voice window before the edition starts", () => {
    const w = editionWindow(editionInputSchema.parse({ horizon: "7d" }), "2026-10-03", now);
    expect(w.end).toBe("2026-10-03T18:00:00.000Z");
    expect(w.start).toBe("2026-09-26T18:00:00.000Z");
    expect(w.voiceTo).toBe("2026-09-25");
    expect(w.voiceFrom).toBe("2026-09-19");
  });
  it("today starts at Berlin midnight and can use all chat when not blind", () => {
    const w = editionWindow(editionInputSchema.parse({ horizon: "today", blind: false, voiceDays: 3 }), "2026-10-03", now);
    expect(w.start).toBe("2026-10-02T22:00:00.000Z");
    expect(w.voiceTo).toBe("2026-10-03");
    expect(w.voiceFrom).toBe("2026-10-01");
  });
  it("uses the last chat day once the chat has stopped", () => {
    const w = editionWindow(editionInputSchema.parse({ horizon: "3d" }), "2026-09-10", now);
    expect(w.voiceTo).toBe("2026-09-10");
  });
});

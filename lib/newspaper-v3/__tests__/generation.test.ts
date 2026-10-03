import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  sql: Object.assign(vi.fn(), { json: (value: unknown) => value }),
}));
vi.mock("ai", () => ({
  generateText: mocks.generate,
  Output: { object: vi.fn() },
}));
vi.mock("@/lib/archive/database", () => ({ archiveDatabase: () => mocks.sql }));
import { generateReplay, validateEvidence } from "../generate";
import type { prepareReplay } from "../prepare";
import type { ReplayIssue } from "../schema";
import type { ArchiveMessage } from "@/lib/archive/types";
const message: ArchiveMessage = {
  id: "source",
  sourceId: "1",
  room: "bitcoin_de_DE",
  username: "alice",
  timestamp: "2026-08-01T10:00:00Z",
  date: "2026-08-01",
  rawTime: "",
  originalText: "hello",
  text: "hello",
  sources: [],
};
const issue: ReplayIssue = {
  headline: "Fiction",
  deck: "Replay",
  articles: [{ title: "Article", body: "Fiction", sourceIds: ["source"] }],
  chat: [
    {
      username: "alice",
      timestamp: "2026-08-02T12:00:00Z",
      text: "Imagined",
      sourceIds: ["source"],
    },
  ],
  participants: [
    { username: "alice", reason: "Historical activity", sourceIds: ["source"] },
  ],
};
const prepared = {
  prompt: "raw text",
  corpus: { messages: [message] },
  replayFrom: "2026-08-02",
  replayTo: "2026-08-08",
  btc: {},
} as Awaited<ReturnType<typeof prepareReplay>>;
beforeEach(() => {
  mocks.generate.mockReset();
  mocks.sql.mockReset();
  mocks.sql.mockResolvedValue([{ id: "run" }]);
});
describe("generation boundaries", () => {
  it("rejects unknown evidence, usernames and dates", () => {
    expect(() =>
      validateEvidence(
        { ...issue, chat: [{ ...issue.chat[0], sourceIds: ["invented"] }] },
        [message],
        "2026-08-02",
        "2026-08-08",
      ),
    ).toThrow();
    expect(() =>
      validateEvidence(
        { ...issue, chat: [{ ...issue.chat[0], username: "invented" }] },
        [message],
        "2026-08-02",
        "2026-08-08",
      ),
    ).toThrow();
    expect(() =>
      validateEvidence(
        {
          ...issue,
          chat: [{ ...issue.chat[0], timestamp: "2026-08-01T12:00:00Z" }],
        },
        [message],
        "2026-08-02",
        "2026-08-08",
      ),
    ).toThrow();
  });
  it("persists only a validated issue in the separate result table", async () => {
    mocks.generate.mockResolvedValue({
      output: issue,
      usage: { inputTokens: 1 },
    });
    await generateReplay("run", prepared);
    expect(mocks.sql.mock.calls[0][0].join("")).toContain(
      "UPDATE newspaper_v3_runs",
    );
    expect(mocks.sql.mock.calls[0][0].join("")).not.toContain(
      "tv_chat_messages",
    );
  });
  it("records model failure without changing previous editions", async () => {
    mocks.generate.mockRejectedValue(Error("provider failed"));
    await generateReplay("run", prepared);
    expect(mocks.sql.mock.calls[0][0].join("")).toContain("status='failed'");
  });
  it("does not report success when database saving fails", async () => {
    mocks.generate.mockResolvedValue({ output: issue, usage: {} });
    mocks.sql
      .mockRejectedValueOnce(Error("save failed"))
      .mockResolvedValueOnce([]);
    await generateReplay("run", prepared);
    expect(mocks.sql.mock.calls[1][0].join("")).toContain("status='failed'");
  });
});

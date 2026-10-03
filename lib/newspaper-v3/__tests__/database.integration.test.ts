import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({
  sql: null as unknown as ReturnType<typeof postgres>,
}));
vi.mock("@/lib/archive/database", () => ({ archiveDatabase: () => state.sql }));
import { claimRun, RunLimitError } from "../store";
import type { ReplayPreview } from "../prepare";
const enabled = process.env.ARCHIVE_DB_TEST === "1";
describe.skipIf(!enabled)(
  "PostgreSQL atomicity (temporary tables only)",
  () => {
    beforeAll(async () => {
      const project = new URL(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
      ).hostname.split(".")[0];
      state.sql = postgres({
        host:
          process.env.SUPABASE_DB_HOST ??
          "aws-1-eu-central-1.pooler.supabase.com",
        port: 5432,
        username: `postgres.${project}`,
        password: process.env.SUPABASE_DB_PASSWORD,
        database: "postgres",
        ssl: "require",
        prepare: false,
        max: 1,
        onnotice: () => {},
      });
      await state.sql`CREATE TEMP TABLE newspaper_v3_runs (LIKE public.newspaper_v3_runs INCLUDING ALL)`;
      await state.sql`CREATE TEMP TABLE tv_user_activity_messages (room_id text,username text,date date,messages jsonb,PRIMARY KEY(room_id,username,date))`;
      await state.sql`CREATE TRIGGER test_preservation BEFORE UPDATE OR DELETE ON pg_temp.tv_user_activity_messages FOR EACH ROW EXECUTE FUNCTION public.protect_chat_archive()`;
      await state.sql`CREATE TEMP TABLE tv_user_activity_daily (message_count int)`;
      await state.sql`CREATE TRIGGER test_counts BEFORE UPDATE OR DELETE ON pg_temp.tv_user_activity_daily FOR EACH ROW EXECUTE FUNCTION public.protect_chat_archive()`;
    });
    afterAll(async () => {
      await state.sql?.end();
    });
    it("empty and partial refreshes retain every original message", async () => {
      await state.sql`INSERT INTO pg_temp.tv_user_activity_messages VALUES('test','test','2020-01-01','[{"id":"1","text":"old"}]')`;
      await state.sql`UPDATE pg_temp.tv_user_activity_messages SET messages='[]'::jsonb`;
      expect(
        (
          await state.sql`SELECT messages FROM pg_temp.tv_user_activity_messages`
        )[0].messages,
      ).toHaveLength(1);
      await state.sql`UPDATE pg_temp.tv_user_activity_messages SET messages='[{"id":"2","text":"new"}]'::jsonb`;
      expect(
        (
          await state.sql`SELECT messages FROM pg_temp.tv_user_activity_messages`
        )[0].messages,
      ).toEqual([
        { id: "1", text: "old" },
        { id: "2", text: "new" },
      ]);
      await expect(
        state.sql`DELETE FROM pg_temp.tv_user_activity_messages`,
      ).rejects.toThrow("cannot be deleted");
    });
    it("preserves activity counts across empty refreshes", async () => {
      await state.sql`INSERT INTO pg_temp.tv_user_activity_daily VALUES(7)`;
      await state.sql`UPDATE pg_temp.tv_user_activity_daily SET message_count=0`;
      expect(
        (
          await state.sql`SELECT message_count FROM pg_temp.tv_user_activity_daily`
        )[0].message_count,
      ).toBe(7);
    });
    it("admits one concurrent run and enforces the daily cap", async () => {
      const summary = { fingerprint: "a".repeat(64) } as ReplayPreview;
      const results = await Promise.allSettled([
        claimRun(summary),
        claimRun(summary),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
      await state.sql`UPDATE pg_temp.newspaper_v3_runs SET status='failed'`;
      await claimRun(summary);
      await state.sql`UPDATE pg_temp.newspaper_v3_runs SET status='failed'`;
      await claimRun(summary);
      await state.sql`UPDATE pg_temp.newspaper_v3_runs SET status='failed'`;
      await expect(claimRun(summary)).rejects.toBeInstanceOf(RunLimitError);
    });
  },
);

# Archive export and newspaper replay

## Entry points

- `/newspaper/export` (also `/export`): all saved German BTC history by default; room, participant and Berlin date filters; JSON/Markdown downloads.
- `/newspaper/v3`: 30 days of original chat followed by a seven-day historical replay. Six-month and custom windows are supported, subject to the measured context limit.
- `/newspaper/v3/[id]`: persistent experimental result, source evidence, and separately loaded real replay messages.

The source archive is never model output. The experiment uses `newspaper_v3_runs` exclusively. Existing newspaper/v2 caches and routes are unchanged.

## Backend boundaries

`repository.ts` reads both room rows and profile message arrays in one repeatable-read PostgreSQL transaction. Date and username predicates are pushed into SQL. Profile date predicates include adjacent days for UTC/Berlin differences; final filtering uses normalized timestamps. Database cursors avoid REST row limits. Confirmed duplicates share room, original ID, author, text and timestamp to the second; fractional source timestamps are retained in provenance. Conflicting originals remain separate.

A 192 MiB LRU working set shares in-flight reads and keeps raw selected histories for five minutes. Compact inventory statistics live in `archive_inventory_cache` and are refreshed in the background after five minutes; `snapshotReadAt` describes the actual read. Full datasets are not placed in the Next component cache or React browser state. Cold full-history reads remain more expensive than indexed date reads.

`prices.ts` fetches paginated hourly Binance BTCUSDT candles. Closed candle references expire after one hour; gaps return null. Files use UTC timestamps and explicitly identify USDT and the reference method. `serialize.ts` streams valid JSON or Markdown only after the entire database read succeeds. Copy uses a temporary browser string because the Clipboard API requires it; downloads stream directly to a file.

## JSON contract

`schemaVersion: "frt.archive.v1"` has export/snapshot metadata, filters, coverage notes, participants, `messages`, and `candles`.

Each message includes `id`, `sourceId`, `room`, `username`, `timestamp` (nullable), `date`, `rawTime`, `originalText`, readable `text`, source record references (including original time representations), and a nullable `btc` reference. Do not treat missing message bodies or prices as zeros. Original text is never truncated. A minimal local-model input can be assembled from `messages[*].originalText`, author and timestamp, plus `candles`; downloaded JSON needs no database service to read.

## Configuration and migrations

The server uses a valid `DATABASE_URL` when available. Otherwise it uses the existing `NEXT_PUBLIC_SUPABASE_URL` project ID and `SUPABASE_DB_PASSWORD` with `SUPABASE_DB_HOST` (default: this project's `aws-1-eu-central-1.pooler.supabase.com` session pooler, port 5432). No database credentials reach the client. Hosted generation reuses `OPENAI_API_KEY` and GPT-5.4 through the installed AI SDK.

Required additive migrations:

- `20260905000000_archive_protection_and_v3.sql`: immutable source bodies, atomic profile-array merge, non-decreasing activity counts, source deletion guards, separate restricted v3 table.
- `20260905000001_archive_inventory.sql`: compact inventory cache and source date indexes.

Both were applied to the connected database during implementation, with unchanged source counts verified. Neither migration removes existing records. New derived tables are unavailable to anonymous/authenticated direct SQL clients; the backend exposes specific read and generation APIs.

## Generation lifecycle

Preflight has no model call. It loads all selected messages, excludes the replay week's chat, loads actual prices, counts o200k tokens with a 4,096-token schema/framing allowance, and reserves 24,000 output tokens. Oversized inputs or incomplete replay prices cannot start a run. No automatic sampling, summarization or background paid schedule exists.

Starting a run requires `yes generate new` and the current preflight fingerprint. A PostgreSQL advisory transaction lock enforces one active run and three starts per UTC day across processes. The response returns a permanent result URL; Next `after()` consumes generation independently of browser navigation. The model has a 240-second abort deadline; a run expires after five minutes. Platform termination can still interrupt a run; expired runs render as failed. Failed attempts count toward the daily cap and require an explicit new confirmation to retry. Completed output is schema-validated and references are resolved against the training archive before saving.

## Verification

`pnpm test`, `pnpm exec tsc --noEmit --incremental false`, and `pnpm build` cover the normal checks. Tests mock model calls.

To run PostgreSQL protection and locking tests with the configured environment:

```sh
ARCHIVE_DB_TEST=1 node --env-file=.env --env-file=.env.local node_modules/vitest/vitest.mjs run lib/newspaper-v3/__tests__/database.integration.test.ts
```

These integration tests create connection-local temporary tables. They do not insert, update or delete production source or edition rows.

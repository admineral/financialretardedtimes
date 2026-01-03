# Financial Retarded Times

A Next.js application that archives TradingView chat messages and generates AI-powered financial news summaries.

---

## 📋 Table of Contents

1. [Cron Jobs](#-cron-jobs)
2. [Chat Sync System](#-chat-sync-system)
3. [Newspaper System](#-newspaper-system)
4. [Database Schema](#-database-schema)
5. [Environment Variables](#-environment-variables)

---

## ⏰ Cron Jobs

The application uses Vercel Cron to run scheduled tasks. All cron jobs are configured in `vercel.json`.

### Configuration

```
vercel.json
```

| Cron Job | Schedule | Description |
|----------|----------|-------------|
| `/api/cron/sync-chat` | Every 5 minutes | Syncs TradingView chat to database |
| `/api/cron/refresh-newspaper` | Every 4 hours | Pre-generates AI newspaper content |

### File Structure

```
app/
└── api/
    └── cron/
        ├── sync-chat/
        │   └── route.ts          # TradingView chat sync
        └── refresh-newspaper/
            └── route.ts          # AI newspaper generation
```

### Authentication

All cron endpoints require a `CRON_SECRET` for production:

```
Authorization: Bearer <CRON_SECRET>
```

Vercel automatically adds this header when calling cron endpoints.

---

## 💬 Chat Sync System

Syncs messages from TradingView's Bitcoin chat room to our Supabase database for archival.

### Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────┐
│  Vercel Cron    │────▶│  /api/cron/      │────▶│  Supabase   │
│  (every 5 min)  │     │  sync-chat       │     │  Database   │
└─────────────────┘     └──────────────────┘     └─────────────┘
                               │
                               ▼
                        ┌──────────────────┐
                        │  TradingView     │
                        │  Chat API        │
                        └──────────────────┘
```

### How It Works

#### 1. Initial Fetch (First Run)

When the database is empty, the system fetches ALL available messages:

```
TradingView API ──▶ Fetch page 1 (offset=0)   ──▶ 30 messages
                ──▶ Fetch page 2 (offset=30)  ──▶ 30 messages
                ──▶ Fetch page 3 (offset=60)  ──▶ 30 messages
                ──▶ ... continues until empty page
                ──▶ ~1000 messages / 7 days of history
```

#### 2. Smart Sync (Subsequent Runs)

After initial fetch, only syncs NEW messages:

```
Page 1: 10 new, 20 existing (67% overlap) ──▶ Continue
Page 2: 2 new, 28 existing (93% overlap)  ──▶ STOP (≥80% overlap)

Result: 12 new messages synced in 2 API calls
```

**Stop Conditions:**
- Page has 0 new messages (fully caught up)
- Page has ≥80% existing messages (mostly caught up)
- Empty page (end of TradingView history)
- Partial page (<30 messages)

### TradingView API Details

| Property | Value |
|----------|-------|
| Endpoint | `GET /conversation-status/?room_id=XXX&offset=N` |
| Origin | `https://de.tradingview.com` |
| Messages per page | 30 |
| Pagination | `offset=0` (newest), `offset=30` (older), etc. |
| History limit | ~1000 messages / ~7 days |

### Data Flow

```
TradingView API
      │
      ▼
┌─────────────────────────────────────────────────────────┐
│  sync-chat/route.ts                                     │
│                                                         │
│  1. fetchMessages(roomId, offset)                       │
│     └─▶ Calls TradingView API                          │
│                                                         │
│  2. smartFetchUntilExisting()                          │
│     └─▶ Fetches pages until overlap found              │
│                                                         │
│  3. extractLinks(text)                                 │
│     └─▶ Finds URLs (twitter, youtube, tradingview)     │
│                                                         │
│  4. extractQuotes(text)                                │
│     └─▶ Parses [quote="user"]text[/quote]              │
└─────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────┐
│  Supabase Database                                      │
│                                                         │
│  tv_chat_messages     ◀── Messages stored here          │
│  tv_chat_links        ◀── Extracted URLs                │
│  tv_chat_quotes       ◀── Extracted quotes              │
│  tv_chat_sync_status  ◀── Sync state tracking           │
│  tv_sync_history      ◀── Sync run logs                 │
└─────────────────────────────────────────────────────────┘
```

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/cron/sync-chat` | Run sync (cron) |
| GET | `/api/cron/sync-chat?hard=true` | Force fetch 500+ messages |
| GET | `/api/cron/sync-chat?rooms=bitcoin_de_DE` | Sync specific room |
| POST | `/api/cron/sync-chat` | Manual trigger |

### Key Files

| File | Purpose |
|------|---------|
| `app/api/cron/sync-chat/route.ts` | Main sync logic |
| `vercel.json` | Cron schedule (*/5 * * * *) |
| `lib/supabase/server.ts` | Database client |

### Data Preservation

**Messages are NEVER deleted from our database.**

- TradingView deletes old messages after ~7 days
- We keep them forever in our archive
- Uses `upsert` (insert or update, never delete)
- Deleted/moderated messages on TradingView remain in our DB

---

## 📰 Newspaper System

Generates AI-powered financial news summaries from chat activity.

### Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────┐
│  Vercel Cron    │────▶│  /api/cron/      │────▶│  Summarize  │
│  (every 4 hrs)  │     │  refresh-        │     │  API        │
└─────────────────┘     │  newspaper       │     └─────────────┘
                        └──────────────────┘            │
                                                        ▼
                                                 ┌─────────────┐
                                                 │  OpenAI     │
                                                 │  GPT-4      │
                                                 └─────────────┘
                                                        │
                                                        ▼
                                                 ┌─────────────┐
                                                 │  Supabase   │
                                                 │  Cache      │
                                                 └─────────────┘
```

### Key Files

| File | Purpose |
|------|---------|
| `app/api/cron/refresh-newspaper/route.ts` | Cron trigger |
| `app/newspaper/api/summarize/route.ts` | AI generation |
| `app/newspaper/page.tsx` | Frontend display |

---

## 🗄️ Database Schema

### Chat Tables

```sql
-- Main messages table
tv_chat_messages (
  id TEXT PRIMARY KEY,
  room_id TEXT,
  username TEXT,
  text TEXT,
  time TIMESTAMP,
  user_pic TEXT,
  badges JSONB,
  is_moderator BOOLEAN
)

-- Extracted links
tv_chat_links (
  id UUID PRIMARY KEY,
  message_id TEXT,
  url TEXT,
  domain TEXT,
  link_type TEXT  -- 'twitter', 'youtube', 'tradingview', 'other'
)

-- Extracted quotes
tv_chat_quotes (
  id UUID PRIMARY KEY,
  message_id TEXT,
  quoter_username TEXT,
  quoted_username TEXT,
  quoted_text TEXT
)

-- Sync status tracking
tv_chat_sync_status (
  room_id TEXT PRIMARY KEY,
  last_sync_at TIMESTAMP,
  newest_message_time TIMESTAMP,
  oldest_message_time TIMESTAMP,
  total_messages INTEGER,
  is_full_history BOOLEAN
)
```

### Migrations

Located in `supabase/migrations/`:

```
20241203000000_create_newspaper_cache.sql
20241211000000_create_chat_timeline_cache.sql
... (more migrations)
```

---

## 🔐 Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx

# Cron Authentication
CRON_SECRET=xxx

# AI (for newspaper)
OPENAI_API_KEY=xxx
```

---

## 🚀 Development

```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev

# Build for production
pnpm build

# Run cron locally (manual trigger)
curl http://localhost:3000/api/cron/sync-chat
```

---

## 📊 Monitoring

### Sync Logs

Check `tv_sync_history` table for sync run history:

```sql
SELECT * FROM tv_sync_history 
ORDER BY started_at DESC 
LIMIT 10;
```

### Message Stats

```sql
SELECT 
  COUNT(*) as total_messages,
  MIN(time) as oldest_message,
  MAX(time) as newest_message
FROM tv_chat_messages
WHERE room_id = 'bitcoin_de_DE';
```

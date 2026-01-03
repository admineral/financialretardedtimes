# Admin Dashboard

Admin interface for managing TradingView chat sync and cached data.

---

## 📁 Directory Structure

```
app/Test/admin/
├── README.md              # This file
├── page.tsx               # Main dashboard (hub)
├── cache/
│   └── page.tsx           # Detailed cache management
└── api/
    ├── cache-stats/
    │   └── route.ts       # Stats aggregation API
    ├── query/
    │   └── route.ts       # SQL query executor
    └── available-dates/
        └── route.ts       # Date statistics API
```

---

## 🔗 Pages

### `/Test/admin` - Dashboard Hub

The main entry point with:
- Quick stats overview (messages, users, profiles, last sync)
- Navigation to other admin sections
- Top chatters leaderboard
- Sync status by room
- Recent sync history
- Quick sync trigger

### `/Test/admin/cache` - Cache Management

Detailed cache management with tabs:
- **Sync History**: All cron runs with success/failure status
- **All Users**: Searchable user list with message counts
- **Messages**: Browse cached messages with search & CSV export
- **Cached Profiles**: TradingView profile data
- **Activity Data**: Daily activity aggregations
- **SQL Query**: Run read-only queries against the database

---

## 🔌 API Endpoints

### `GET /Test/admin/api/cache-stats`

Returns aggregated statistics for the dashboard.

**Query Params:**
- `messagesLimit` (number, default: 300) - Limit for messages returned. Use 0 for all.

**Response:**
```typescript
{
  totalMessages: number
  totalProfiles: number
  totalActivityRecords: number
  syncStatuses: SyncStatus[]
  recentMessages: ChatMessage[]
  profiles: UserProfile[]
  recentActivity: UserActivity[]
  users: UserSummary[]
  syncHistory: SyncHistoryRecord[]
}
```

### `POST /Test/admin/api/query`

Execute read-only SQL queries against the cache database.

**Body:**
```json
{ "query": "SELECT * FROM tv_chat_messages LIMIT 10" }
```

**Allowed Tables:**
- `tv_chat_messages`
- `tv_chat_sync_status`
- `tv_user_profiles`
- `tv_user_activity_daily`

**Blocked Operations:** DROP, DELETE, UPDATE, INSERT, ALTER, CREATE, etc.

### `GET /Test/admin/api/available-dates`

Returns all dates that have chat messages with statistics.

**Response:**
```typescript
{
  dates: Array<{ date: string, messageCount: number, uniqueUsers: number }>
  totalDays: number
  totalMessages: number
}
```

---

## 📦 Dependencies

### External Packages

| Package | Usage |
|---------|-------|
| `date-fns` | Date formatting (`formatDistanceToNow`, `format`) |
| `lucide-react` | Icons |
| `next` | Framework (Link, headers) |

### UI Components (`@/components/ui/`)

| Component | Used In |
|-----------|---------|
| `Card` | Both pages |
| `Button` | Both pages |
| `Badge` | Both pages |
| `Separator` | Both pages |
| `Tabs` | cache/page.tsx |
| `ScrollArea` | cache/page.tsx |
| `Avatar` | cache/page.tsx |
| `Input` | cache/page.tsx |
| `Textarea` | cache/page.tsx |

### Internal Dependencies

| File | Usage |
|------|-------|
| `@/lib/supabase/server` | Database client (createClient) |

---

## 🗄️ Database Tables Accessed

| Table | Description |
|-------|-------------|
| `tv_chat_messages` | Synced chat messages |
| `tv_chat_sync_status` | Per-room sync state |
| `tv_sync_history` | Cron run logs |
| `tv_user_profiles` | Cached TradingView profiles |
| `tv_user_activity_daily` | Daily activity aggregations |

---

## 🔗 External API Calls

| Endpoint | Purpose |
|----------|---------|
| `/api/cron/sync-chat` | Trigger manual sync |

---

## 🎨 UI Theme

Both pages use a dark gradient theme:
- Background: `from-slate-950 via-slate-900 to-slate-950`
- Cards: `bg-slate-900/50 border-slate-800`
- Text: White/slate-300/slate-400/slate-500

---

## 🚀 Usage

### Trigger Manual Sync

1. Go to `/Test/admin`
2. Click "Sync Now" button
3. Wait for completion
4. View results in sync history

### Query Database

1. Go to `/Test/admin/cache`
2. Click "SQL Query" tab
3. Use preset buttons or write custom query
4. Click "Run Query"

### Export Messages

1. Go to `/Test/admin/cache`
2. Click "Messages" tab
3. Optionally filter with search
4. Click "Export CSV"

---

## 🔒 Security

- SQL queries are validated (SELECT only)
- Blocked keywords prevent destructive operations
- Only whitelisted tables are accessible
- No authentication currently (add if needed)

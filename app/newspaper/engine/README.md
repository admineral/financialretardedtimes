# Newspaper Engine

The newspaper engine is the modular core behind the Financial Retarded Times
issue page. It is intentionally small and copyable: modules describe resources,
prompt sections, cache policy, output schema, and optional renderers; connectors
hide app-specific data sources.

## Create a Module

Create a file in `app/newspaper/modules` and export a definition:

```ts
import { z } from 'zod'
import { defineNewspaperModule } from '../engine/module'
import { chat, market } from '../engine/resources'

export const myModule = defineNewspaperModule({
  id: 'vendor.myModule',
  version: '1.0.0',
  title: 'My Module',
  description: 'What it adds to the issue.',
  resourceNeeds: [chat.rolling('24h'), market.btc()],
  outputSchema: z.object({ summary: z.string() }),
  prompt: () => ({
    id: 'my_module',
    resources: ['chat.rolling.24h', 'market.btc'],
    outputPath: 'modules.myModule',
    instructions: ['Use only declared resources.']
  }),
  cache: {
    ttlSeconds: 24 * 60 * 60,
    tags: ['newspaper:module:vendor.myModule']
  }
})
```

Register the module in `app/newspaper/modules/index.ts`.

## Create a Connector

Connectors fetch resources. Modules do not call Supabase, OpenAI, or external
APIs directly; they declare `resourceNeeds`, and the composer decides which
connectors to call.

```ts
import { defineConnector } from './module'

export const chatConnector = defineConnector({
  id: 'chat.supabase',
  kind: 'chat',
  async fetch(params) {
    return params
  }
})
```

## Standalone vs Composed

- Standalone mode generates one module with only its declared resources.
- Composed mode deduplicates resources across modules, builds one structured
  prompt, and writes one `NewspaperIssue`.

Existing standalone routes remain available for backwards compatibility, while
the `/newspaper` page reads from `NewspaperIssueProvider`.

## Add a UI Block

Prefer data-free view components:

```tsx
<TickerBannerView data={issue.modules.tickerBanner} />
```

If a block needs standalone behavior, wrap the view in a fetcher/provider. The
newspaper page should use the view with issue-provided data.

## Cache and Revalidation

- Composed issues are stored in `newspaper_cache.data`.
- Freshness is 24 hours by default.
- Module-level caches can still be written for standalone pages.
- Header refresh forces a new composed issue and revalidates:
  - `newspaper:issue:{date}:{dayRange}`
  - `newspaper:latest`
  - compatible module tags

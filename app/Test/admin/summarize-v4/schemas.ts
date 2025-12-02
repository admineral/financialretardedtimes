import { z } from 'zod'

// Group Meta Schema
const GroupMetaSchema = z.object({
  source: z.string().describe('Source of the data, e.g. "TV-Chat-Export (gekürzt & strukturiert)"'),
  language: z.string().describe('Language code, e.g. "de"'),
  approx_message_count: z.number().describe('Approximate number of messages analyzed'),
  moderation_notes: z.array(z.string()).describe('Brief notes about peculiarities (running gags, heated debates, etc.)')
})

const GroupSchema = z.object({
  id: z.string().describe('Short slug-like ID, e.g. "g-politikmedien-2025-11"'),
  title: z.string().describe('Catchy magazine-style title, e.g. "#politikmedien · Krypto-Chat-Langstrecke"'),
  date_range: z.string().describe('Date range in format "YYYY-MM-DD..YYYY-MM-DD"'),
  description: z.string().describe('1-3 sentences describing what this analysis contains'),
  meta: GroupMetaSchema
})

// Topic Schema
const TopicSchema = z.object({
  id: z.string().describe('Topic ID starting with "t-", e.g. "t-btc-marktstruktur"'),
  label: z.string().describe('Clear topic name in German'),
  category: z.enum(['analysis', 'opinion', 'culture']).describe('Topic category'),
  summary: z.string().describe('1 paragraph (2-4 sentences) summarizing the topic'),
  related_users: z.array(z.string()).describe('List of user IDs who were particularly active on this topic'),
  related_articles: z.array(z.string()).describe('IDs of articles covering this topic')
})

// User Stats Schema
const UserStatsSchema = z.object({
  approx_messages: z.number().describe('Approximate message count'),
  primary_topics: z.array(z.string()).describe('1-3 topic IDs where user was most present')
})

// User Schema
const UserSchema = z.object({
  id: z.string().describe('User ID starting with "u-", e.g. "u-royal-x"'),
  handle: z.string().describe('Original handle as it appears in chat'),
  display_name: z.string().describe('Display name (usually same as handle)'),
  roles: z.array(z.string()).describe('Short role terms like "Trader", "Meme-Poster", "Elliott-Wellen-Experte"'),
  activity_level: z.enum(['niedrig', 'niedrig_mittel', 'mittel', 'hoch']).describe('Activity level'),
  tags: z.array(z.string()).describe('2-5 keywords showing expertise/running gags'),
  bio_snippet: z.string().describe('1-2 sentences describing what makes this person stand out'),
  stats: UserStatsSchema
})

// Article Schema
const ArticleSchema = z.object({
  id: z.string().describe('Article ID starting with "a-", e.g. "a-btc-elliott"'),
  type: z.enum(['analysis', 'opinion', 'culture']).describe('Article type'),
  title: z.string().describe('Magazine-style title in German'),
  slug: z.string().describe('URL-friendly slug in kebab-case, no umlauts'),
  summary: z.string().describe('Teaser text (2-4 sentences) for the front page'),
  related_topics: z.array(z.string()).describe('1-3 matching topic IDs'),
  related_users: z.array(z.string()).describe('2-10 users who are central to this article'),
  created_at: z.string().describe('ISO-8601 timestamp'),
  tags: z.array(z.string()).describe('3-7 keywords (crypto terms, meta topics, meme words)')
})

// Complete V4 Schema
export const ChatAnalysisSchema = z.object({
  group: GroupSchema.describe('Group metadata for the entire analysis'),
  topics: z.array(TopicSchema).min(4).max(10).describe('4-10 main topics identified in the chat'),
  users: z.array(UserSchema).min(5).max(50).describe('User profiles for relevant participants'),
  articles: z.array(ArticleSchema).min(5).max(12).describe('5-12 article objects presenting the chat like a newspaper')
})

// Type exports
export type ChatAnalysis = z.infer<typeof ChatAnalysisSchema>
export type Group = z.infer<typeof GroupSchema>
export type Topic = z.infer<typeof TopicSchema>
export type User = z.infer<typeof UserSchema>
export type Article = z.infer<typeof ArticleSchema>


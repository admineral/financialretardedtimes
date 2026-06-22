import { defineConnector, defineNewspaperModule, renderModule } from './module'
import { createNewspaperIssue } from './issue'

export { defineConnector, defineNewspaperModule, renderModule } from './module'
export { createPromptProgram, PromptProgram } from './prompt'
export { avatar, cache, chat, market } from './resources'
export {
  getIssueExpiresAt,
  buildModuleResourceFingerprint,
  isIssueFresh,
  issueCacheTag,
  moduleCacheTag,
  readLatestNewspaperModuleCache,
  revalidateModuleCacheTags,
  writeNewspaperModuleCache,
  writeNewspaperIssueCache
} from './cache'
export { createNewspaperIssue, isNewspaperIssue } from './issue'
export type {
  Connector,
  ModuleCachePolicy,
  ModulePromptBuilder,
  NewspaperAIUsage,
  NewspaperIssue,
  NewspaperIssueActivityBucket,
  NewspaperIssueActivityStats,
  NewspaperIssueModuleKey,
  NewspaperIssueTickerEvent,
  NewspaperIssueTimelineEvent,
  NewspaperModuleDefinition,
  PromptSectionDefinition,
  ResourceNeed
} from './types'

export function createNewspaperEngine() {
  return {
    defineNewspaperModule,
    defineConnector,
    composeIssue: createNewspaperIssue,
    generateIssue: createNewspaperIssue,
    renderModule
  }
}

export const RUN_STATUSES = ['idle', 'running', 'pause-requested', 'paused', 'blocked', 'stopped'] as const

export type RunStatus = (typeof RUN_STATUSES)[number]

export type JobSnapshot = {
  jobId: string
  url: string
  title: string
  company: string
  location: string
  description: string
  skills: string[]
  activeDetailJobId: string
  visibleAction: string
}

export type FilterConfig = {
  cityCode: string
  cityLabel: string
  companyScales: string[]
  includeKeywords: string[]
  excludeKeywords: string[]
  contactLimit: number
}

export type MatchField = 'title' | 'skills' | 'description' | 'company'

export type MatchEvidence = {
  field: MatchField
  keyword: string
}

export type MatchDecision =
  | { kind: 'matched'; evidence: MatchEvidence }
  | { kind: 'excluded'; evidence: MatchEvidence }
  | { kind: 'not-matched'; reason: 'no-include-keywords' | 'no-include-hit' }

export type ProcessedOutcome = 'contacted' | 'skipped' | 'failed' | 'blocked'

export type ProcessedJob = {
  jobId: string
  title: string
  company: string
  url: string
  outcome: ProcessedOutcome
  reason: string
  matchedField?: MatchField | undefined
  matchedKeyword?: string | undefined
  processedAt: string
}

export type RunProgress = {
  status: RunStatus
  sessionContactedCount: number
  scannedCount: number
  matchedCount: number
  skippedCount: number
  failedCount: number
  currentJobId: string | null
  currentJobTitle: string | null
  lastMessage: string
  stopReason: string | null
  startedAt: string | null
  updatedAt: string
}

export type PageStatus = {
  phase: 'unavailable' | 'ready' | 'error'
  message: string
}

export type AppSnapshot = {
  filterConfig: FilterConfig
  run: RunProgress
  page: PageStatus
  historyCount: number
  contactedHistoryCount: number
  history: ProcessedJob[]
  recentHistory: ProcessedJob[]
}

export type ExecutionCheckpoint = {
  mode: 'idle' | 'searching' | 'confirming' | 'returning'
  queryIndex: number
  seenJobIds: string[]
  currentJob: JobSnapshot | null
  searchUrl: string | null
  navigationExpectedUntil: number | null
  consecutiveFailures: number
}

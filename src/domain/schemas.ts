import { z } from 'zod'
import {
  RUN_STATUSES,
  type ExecutionCheckpoint,
  type FilterConfig,
  type PageStatus,
  type RunProgress
} from './types'

const keywordListSchema = z
  .array(z.string())
  .transform((keywords) => [...new Set(keywords.map((keyword) => keyword.trim()).filter(Boolean))])

export const filterConfigSchema = z.object({
  cityCode: z.string().trim().min(1),
  cityLabel: z.string().trim().min(1),
  companyScales: z.array(z.string().regex(/^30[1-6]$/)).max(6),
  includeKeywords: keywordListSchema,
  excludeKeywords: keywordListSchema,
  contactLimit: z.number().int().min(1).max(200).default(1)
})

export const processedJobSchema = z.object({
  jobId: z.string().min(1),
  title: z.string(),
  company: z.string(),
  url: z.string(),
  outcome: z.enum(['contacted', 'skipped', 'failed', 'blocked']),
  reason: z.string(),
  matchedField: z.enum(['title', 'skills', 'description', 'company']).optional(),
  matchedKeyword: z.string().optional(),
  processedAt: z.iso.datetime()
})

export const processedJobsSchema = z.array(processedJobSchema)

export const jobSnapshotSchema = z.object({
  jobId: z.string().min(1),
  url: z.string(),
  title: z.string(),
  company: z.string(),
  location: z.string(),
  description: z.string(),
  skills: z.array(z.string()),
  activeDetailJobId: z.string(),
  visibleAction: z.string()
})

export const runProgressSchema = z.object({
  status: z.enum(RUN_STATUSES),
  sessionContactedCount: z.number().int().nonnegative(),
  scannedCount: z.number().int().nonnegative(),
  matchedCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  currentJobId: z.string().nullable(),
  currentJobTitle: z.string().nullable(),
  lastMessage: z.string(),
  stopReason: z.string().nullable(),
  startedAt: z.iso.datetime().nullable(),
  updatedAt: z.iso.datetime()
})

export const executionCheckpointSchema = z.object({
  mode: z.enum(['idle', 'searching', 'confirming', 'returning']),
  queryIndex: z.number().int().nonnegative(),
  seenJobIds: z.array(z.string()),
  currentJob: jobSnapshotSchema.nullable(),
  searchUrl: z.string().nullable(),
  navigationExpectedUntil: z.number().nullable(),
  consecutiveFailures: z.number().int().nonnegative().default(0)
})

export const persistedStateSchema = z.object({
  version: z.literal(2),
  filterConfig: filterConfigSchema,
  run: runProgressSchema,
  checkpoint: executionCheckpointSchema,
  processedJobs: z.record(z.string(), processedJobSchema)
})

export type PersistedState = z.output<typeof persistedStateSchema>

export const DEFAULT_FILTER_CONFIG: FilterConfig = {
  cityCode: '100010000',
  cityLabel: '全国',
  companyScales: [],
  includeKeywords: ['嵌入式软件开发', 'MCU开发'],
  excludeKeywords: [],
  contactLimit: 1
}

export const createInitialRunProgress = (now = new Date().toISOString()): RunProgress => ({
  status: 'idle',
  sessionContactedCount: 0,
  scannedCount: 0,
  matchedCount: 0,
  skippedCount: 0,
  failedCount: 0,
  currentJobId: null,
  currentJobTitle: null,
  lastMessage: '等待开始',
  stopReason: null,
  startedAt: null,
  updatedAt: now
})

export const DEFAULT_PAGE_STATUS: PageStatus = {
  phase: 'unavailable',
  message: '请打开一个 BOSS 职位页面'
}

export const DEFAULT_EXECUTION_CHECKPOINT: ExecutionCheckpoint = {
  mode: 'idle',
  queryIndex: 0,
  seenJobIds: [],
  currentJob: null,
  searchUrl: null,
  navigationExpectedUntil: null,
  consecutiveFailures: 0
}

export const createDefaultPersistedState = (): PersistedState => ({
  version: 2 as const,
  filterConfig: DEFAULT_FILTER_CONFIG,
  run: createInitialRunProgress(),
  checkpoint: DEFAULT_EXECUTION_CHECKPOINT,
  processedJobs: {}
})

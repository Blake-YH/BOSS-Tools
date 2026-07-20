import { browser } from 'wxt/browser'
import {
  createDefaultPersistedState,
  executionCheckpointSchema,
  filterConfigSchema,
  persistedStateSchema,
  processedJobSchema,
  processedJobsSchema,
  runProgressSchema,
  type PersistedState
} from '../domain/schemas'
import type {
  AppSnapshot,
  ExecutionCheckpoint,
  FilterConfig,
  PageStatus,
  ProcessedJob,
  RunProgress
} from '../domain/types'

export const STORAGE_KEYS = {
  filterConfig: 'settings:v2',
  run: 'run:v2',
  checkpoint: 'checkpoint:v2',
  processedJobs: 'history:v2'
} as const

const readKey = async (key: string): Promise<unknown> => (await browser.storage.local.get(key))[key]

export const readPersistedState = async (): Promise<PersistedState> => {
  const defaults = createDefaultPersistedState()
  const [rawConfig, rawRun, rawCheckpoint, rawHistory] = await Promise.all([
    readKey(STORAGE_KEYS.filterConfig),
    readKey(STORAGE_KEYS.run),
    readKey(STORAGE_KEYS.checkpoint),
    readKey(STORAGE_KEYS.processedJobs)
  ])

  const historyResult = processedJobsSchema.safeParse(rawHistory)

  return persistedStateSchema.parse({
    version: 2,
    filterConfig: filterConfigSchema.catch(defaults.filterConfig).parse(rawConfig),
    run: runProgressSchema.catch(defaults.run).parse(rawRun),
    checkpoint: executionCheckpointSchema.catch(defaults.checkpoint).parse(rawCheckpoint),
    processedJobs: historyResult.success
      ? Object.fromEntries(historyResult.data.map((job) => [job.jobId, job]))
      : defaults.processedJobs
  })
}

export const saveFilterConfig = async (config: FilterConfig): Promise<void> => {
  await browser.storage.local.set({ [STORAGE_KEYS.filterConfig]: filterConfigSchema.parse(config) })
}

export const saveRun = async (run: RunProgress): Promise<void> => {
  await browser.storage.local.set({ [STORAGE_KEYS.run]: runProgressSchema.parse(run) })
}

export const saveCheckpoint = async (checkpoint: ExecutionCheckpoint): Promise<void> => {
  await browser.storage.local.set({
    [STORAGE_KEYS.checkpoint]: executionCheckpointSchema.parse(checkpoint)
  })
}

export const saveProcessedJobs = async (jobs: Record<string, ProcessedJob>): Promise<void> => {
  const parsed = Object.values(jobs).map((job) => processedJobSchema.parse(job))
  await browser.storage.local.set({ [STORAGE_KEYS.processedJobs]: parsed })
}

export const saveProcessedJob = async (job: ProcessedJob): Promise<void> => {
  const state = await readPersistedState()
  await saveProcessedJobs({ ...state.processedJobs, [job.jobId]: processedJobSchema.parse(job) })
}

export const clearProcessedJobs = async (): Promise<void> => {
  await browser.storage.local.set({ [STORAGE_KEYS.processedJobs]: [] })
}

export const deleteProcessedJob = async (jobId: string): Promise<void> => {
  const parsedJobId = processedJobSchema.shape.jobId.parse(jobId)
  const state = await readPersistedState()
  if (!state.processedJobs[parsedJobId]) return
  const remainingJobs = { ...state.processedJobs }
  delete remainingJobs[parsedJobId]
  await saveProcessedJobs(remainingJobs)
}

export const toAppSnapshot = (state: PersistedState, page: PageStatus): AppSnapshot => {
  const history = Object.values(state.processedJobs).sort((a, b) =>
    b.processedAt.localeCompare(a.processedAt)
  )
  return {
    filterConfig: state.filterConfig,
    run: state.run,
    page,
    historyCount: history.length,
    contactedHistoryCount: history.filter((job) => job.outcome === 'contacted').length,
    history,
    recentHistory: history.slice(0, 20)
  }
}

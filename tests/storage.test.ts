import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProcessedJob } from '../src/domain/types'

const fakeStorage = vi.hoisted(() => ({ data: {} as Record<string, unknown> }))

vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: fakeStorage.data[key] })),
        set: vi.fn(async (values: Record<string, unknown>) => {
          Object.assign(fakeStorage.data, values)
        })
      }
    }
  }
}))

import {
  STORAGE_KEYS,
  deleteProcessedJob,
  readPersistedState,
  saveProcessedJobs,
  toAppSnapshot
} from '../src/extension/storage'

const processedJob = (jobId: string, outcome: ProcessedJob['outcome']): ProcessedJob => ({
  jobId,
  title: `岗位 ${jobId}`,
  company: '示例公司',
  url: `https://www.zhipin.com/job_detail/${jobId}.html`,
  outcome,
  reason: '测试记录',
  processedAt: '2026-07-20T00:00:00.000Z'
})

describe('extension history storage', () => {
  beforeEach(() => {
    fakeStorage.data = {}
  })

  it('deletes only the requested history record', async () => {
    await saveProcessedJobs({
      'job-1': processedJob('job-1', 'contacted'),
      'job-2': processedJob('job-2', 'failed')
    })

    await deleteProcessedJob('job-1')

    const state = await readPersistedState()
    expect(state.processedJobs).toEqual({ 'job-2': processedJob('job-2', 'failed') })
    expect(fakeStorage.data[STORAGE_KEYS.processedJobs]).toHaveLength(1)
  })

  it('leaves history unchanged when the requested id does not exist', async () => {
    await saveProcessedJobs({ 'job-2': processedJob('job-2', 'failed') })
    await deleteProcessedJob('missing-job')
    expect((await readPersistedState()).processedJobs).toEqual({
      'job-2': processedJob('job-2', 'failed')
    })
  })

  it('rejects an empty job id', async () => {
    await expect(deleteProcessedJob('')).rejects.toThrow()
  })

  it('exposes the complete history while retaining a bounded recent subset', async () => {
    const jobs = Object.fromEntries(
      Array.from({ length: 25 }, (_, index) => {
        const jobId = `job-${index + 1}`
        return [jobId, processedJob(jobId, 'contacted')]
      })
    )
    await saveProcessedJobs(jobs)
    const snapshot = toAppSnapshot(await readPersistedState(), {
      phase: 'ready',
      message: 'ready'
    })
    expect(snapshot.history).toHaveLength(25)
    expect(snapshot.recentHistory).toHaveLength(20)
  })
})

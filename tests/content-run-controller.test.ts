// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://www.zhipin.com/web/geek/jobs" }

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultPersistedState, type PersistedState } from '../src/domain/schemas'
import type { AppSnapshot, JobSnapshot, PageStatus, ProcessedJob } from '../src/domain/types'

const memory = vi.hoisted(() => ({ state: null as PersistedState | null }))

vi.mock('../src/extension/storage', () => ({
  readPersistedState: vi.fn(async () => structuredClone(memory.state)),
  saveRun: vi.fn(async (run) => {
    if (memory.state) memory.state.run = structuredClone(run)
  }),
  saveCheckpoint: vi.fn(async (checkpoint) => {
    if (memory.state) memory.state.checkpoint = structuredClone(checkpoint)
  }),
  saveProcessedJob: vi.fn(async (job: ProcessedJob) => {
    if (memory.state) memory.state.processedJobs[job.jobId] = structuredClone(job)
  }),
  toAppSnapshot: vi.fn((state: PersistedState, page: PageStatus): AppSnapshot => ({
    filterConfig: state.filterConfig,
    run: state.run,
    page,
    historyCount: Object.keys(state.processedJobs).length,
    contactedHistoryCount: Object.values(state.processedJobs).filter((job) => job.outcome === 'contacted').length,
    history: Object.values(state.processedJobs),
    recentHistory: Object.values(state.processedJobs)
  }))
}))

import { ContentRunController } from '../src/extension/content-run-controller'

const job = (jobId: string): JobSnapshot => ({
  jobId,
  url: `https://www.zhipin.com/job_detail/${jobId}.html`,
  title: '嵌入式软件工程师',
  company: '示例科技',
  location: '杭州',
  description: '负责嵌入式软件开发',
  skills: ['C语言'],
  activeDetailJobId: jobId,
  visibleAction: '立即沟通'
})

const readyAdapter = {
  isReady: vi.fn(() => true),
  detectBlocker: vi.fn(() => null),
  waitForJobList: vi.fn(async () => undefined),
  listJobReferences: vi.fn(() => []),
  selectJob: vi.fn(async () => undefined),
  readSelectedJob: vi.fn(job),
  clickContact: vi.fn(() => null),
  confirmContact: vi.fn(async () => ({ kind: 'success' as const, message: '已确认' })),
  loadMore: vi.fn(async () => false)
}

describe('ContentRunController', () => {
  beforeEach(() => {
    memory.state = createDefaultPersistedState()
    history.replaceState({}, '', '/web/geek/jobs')
    vi.clearAllMocks()
  })

  it('starts a new run and persists an expected search navigation checkpoint', async () => {
    const navigate = vi.fn()
    const controller = new ContentRunController(readyAdapter, navigate)
    const response = await controller.handle({ type: 'START' })

    expect(response.ok).toBe(true)
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledOnce())
    expect(memory.state?.run.status).toBe('running')
    expect(memory.state?.run.sessionContactedCount).toBe(0)
    expect(memory.state?.checkpoint.mode).toBe('searching')
    expect(memory.state?.checkpoint.navigationExpectedUntil).toBeTypeOf('number')
  })

  it('pauses before the next action without clicking a job', async () => {
    const navigate = vi.fn()
    const adapter = { ...readyAdapter, clickContact: vi.fn(() => null) }
    const controller = new ContentRunController(adapter, navigate)
    await controller.handle({ type: 'START' })
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledOnce())

    await controller.handle({ type: 'PAUSE' })

    expect(memory.state?.run.status).toBe('paused')
    expect(adapter.clickContact).not.toHaveBeenCalled()
  })

  it('skips an existing communication relationship without treating it as a failure', async () => {
    history.replaceState(
      {},
      '',
      '/web/geek/jobs?query=%E5%B5%8C%E5%85%A5%E5%BC%8F%E8%BD%AF%E4%BB%B6%E5%BC%80%E5%8F%91&city=100010000'
    )
    const adapter = {
      ...readyAdapter,
      listJobReferences: vi.fn(() => [{ jobId: 'job-existing', title: '嵌入式软件工程师' }]),
      readSelectedJob: vi.fn(() => ({ ...job('job-existing'), visibleAction: '继续沟通' })),
      clickContact: vi.fn(() => null)
    }
    const controller = new ContentRunController(adapter, vi.fn())
    await controller.handle({ type: 'START' })

    await vi.waitFor(() => expect(memory.state?.run.skippedCount).toBe(1))
    await controller.handle({ type: 'STOP' })
    expect(memory.state?.run.skippedCount).toBe(1)
    expect(memory.state?.run.failedCount).toBe(0)
    expect(adapter.clickContact).not.toHaveBeenCalled()
  })

  it('blocks after three consecutive unconfirmed contacts and never increments success', async () => {
    history.replaceState(
      {},
      '',
      '/web/geek/jobs?query=%E5%B5%8C%E5%85%A5%E5%BC%8F%E8%BD%AF%E4%BB%B6%E5%BC%80%E5%8F%91&city=100010000'
    )
    const references = ['job-1', 'job-2', 'job-3'].map((jobId) => ({ jobId, title: '嵌入式软件工程师' }))
    const adapter = {
      ...readyAdapter,
      listJobReferences: vi.fn(() => references),
      readSelectedJob: vi.fn((jobId: string) => job(jobId)),
      clickContact: vi.fn(() => ({ kind: 'failed' as const, message: '未能确认' }))
    }
    const controller = new ContentRunController(adapter, vi.fn())
    await controller.handle({ type: 'START' })

    await vi.waitFor(() => expect(memory.state?.run.status).toBe('blocked'))
    expect(memory.state?.run.failedCount).toBe(3)
    expect(memory.state?.run.sessionContactedCount).toBe(0)
    expect(adapter.clickContact).toHaveBeenCalledTimes(3)
  })
})

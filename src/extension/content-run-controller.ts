import { DEFAULT_EXECUTION_CHECKPOINT } from '../domain/schemas'
import { matchJob } from '../domain/matcher'
import {
  hasReachedContactLimit,
  recoverInterruptedRun,
  reduceRunProgress,
  type RunEvent
} from '../domain/run-machine'
import type {
  AppSnapshot,
  ExecutionCheckpoint,
  JobSnapshot,
  PageStatus,
  ProcessedJob,
  RunProgress
} from '../domain/types'
import type { ContentCommand, ContentResponse } from '../shared/messages'
import { isBossWorkspaceUrl } from '../shared/boss-pages'
import { BossDomAdapter, buildSearchUrl, type ContactResult } from './boss-dom-adapter'
import {
  readPersistedState,
  saveCheckpoint,
  saveProcessedJob,
  saveRun,
  toAppSnapshot
} from './storage'

const EXPECTED_NAVIGATION_WINDOW_MS = 20_000
const MAX_CONSECUTIVE_FAILURES = 3

const nowIso = (): string => new Date().toISOString()

const boundedMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error)
  return message.replace(/\s+/g, ' ').trim().slice(0, 180) || '发生未知错误'
}

const isSupportedPage = (): boolean => isBossWorkspaceUrl(window.location.href)

const searchParametersMatch = (target: string): boolean => {
  const expected = new URL(target)
  const current = new URL(window.location.href)
  return (
    current.pathname === expected.pathname &&
    current.searchParams.get('query') === expected.searchParams.get('query') &&
    current.searchParams.get('city') === expected.searchParams.get('city') &&
    current.searchParams.get('scale') === expected.searchParams.get('scale')
  )
}

type BossDomAdapterPort = Pick<
  BossDomAdapter,
  | 'isReady'
  | 'waitForJobList'
  | 'listJobReferences'
  | 'selectJob'
  | 'readSelectedJob'
  | 'detectBlocker'
  | 'clickContact'
  | 'confirmContact'
  | 'loadMore'
>

export class ContentRunController {
  private loopPromise: Promise<void> | null = null
  private navigationRequested = false

  constructor(
    private readonly adapter: BossDomAdapterPort = new BossDomAdapter(),
    private readonly navigate: (url: string) => void = (url) => window.location.assign(url)
  ) {}

  async initialize(): Promise<void> {
    const state = await readPersistedState()
    if (!['running', 'pause-requested'].includes(state.run.status)) return

    const expectedNavigation =
      state.checkpoint.navigationExpectedUntil !== null &&
      state.checkpoint.navigationExpectedUntil >= Date.now() &&
      state.checkpoint.mode !== 'idle'

    if (!expectedNavigation) {
      await saveRun(recoverInterruptedRun(state.run, nowIso()))
      return
    }

    await saveCheckpoint({ ...state.checkpoint, navigationExpectedUntil: null })
    this.ensureLoop()
  }

  async handle(command: ContentCommand): Promise<ContentResponse> {
    try {
      switch (command.type) {
        case 'GET_SNAPSHOT':
          break
        case 'START':
          await this.start()
          break
        case 'PAUSE':
          await this.pause()
          break
        case 'RESUME':
          await this.resume()
          break
        case 'STOP':
          await this.stop()
          break
      }
      return { ok: true, snapshot: await this.snapshot() }
    } catch (error) {
      return { ok: false, message: boundedMessage(error) }
    }
  }

  async snapshot(): Promise<AppSnapshot> {
    return toAppSnapshot(await readPersistedState(), this.getPageStatus())
  }

  private async start(): Promise<void> {
    const state = await readPersistedState()
    if (state.run.status === 'running' || state.run.status === 'pause-requested') return
    if (!isSupportedPage() || !this.adapter.isReady()) {
      throw new Error('请先在当前标签页打开并登录 BOSS 职位页面')
    }
    if (state.filterConfig.includeKeywords.length === 0) {
      throw new Error('请至少填写一个包含词')
    }

    const run = reduceRunProgress(state.run, { type: 'START', now: nowIso() })
    const searchUrl = buildSearchUrl(state.filterConfig, state.filterConfig.includeKeywords[0]!)
    const checkpoint: ExecutionCheckpoint = {
      ...DEFAULT_EXECUTION_CHECKPOINT,
      mode: 'searching',
      searchUrl
    }
    await Promise.all([saveRun(run), saveCheckpoint(checkpoint)])
    this.ensureLoop()
  }

  private async pause(): Promise<void> {
    const state = await readPersistedState()
    if (!['running', 'pause-requested'].includes(state.run.status)) return
    const inFlight = state.checkpoint.mode === 'confirming'
    await saveRun(
      reduceRunProgress(state.run, {
        type: 'REQUEST_PAUSE',
        inFlight,
        now: nowIso()
      })
    )
  }

  private async resume(): Promise<void> {
    const state = await readPersistedState()
    if (state.run.status !== 'paused') return
    if (!isSupportedPage()) throw new Error('请在 BOSS 职位或聊天页面恢复运行')
    await saveRun(reduceRunProgress(state.run, { type: 'RESUME', now: nowIso() }))
    this.ensureLoop()
  }

  private async stop(): Promise<void> {
    const state = await readPersistedState()
    if (!['running', 'pause-requested', 'paused'].includes(state.run.status)) return
    await Promise.all([
      saveRun(reduceRunProgress(state.run, { type: 'STOP', now: nowIso() })),
      saveCheckpoint(DEFAULT_EXECUTION_CHECKPOINT)
    ])
  }

  private ensureLoop(): void {
    if (this.loopPromise) return
    this.navigationRequested = false
    this.loopPromise = this.runLoop()
      .catch((error: unknown) => this.block(boundedMessage(error)))
      .finally(() => {
        const navigationRequested = this.navigationRequested
        this.loopPromise = null
        if (!navigationRequested) void this.restartLoopIfNeeded()
      })
  }

  private async restartLoopIfNeeded(): Promise<void> {
    const state = await readPersistedState()
    if (state.run.status === 'running') this.ensureLoop()
  }

  private async runLoop(): Promise<void> {
    while (true) {
      const state = await readPersistedState()
      if (state.run.status !== 'running' && state.run.status !== 'pause-requested') return
      if (state.run.status === 'pause-requested' && state.checkpoint.mode !== 'confirming') {
        await saveRun(reduceRunProgress(state.run, { type: 'PAUSED', now: nowIso() }))
        return
      }
      if (hasReachedContactLimit(state.run, state.filterConfig.contactLimit)) {
        await this.finish('已达到本次预沟通数量')
        return
      }

      switch (state.checkpoint.mode) {
        case 'idle':
          await this.finish('本次运行已结束')
          return
        case 'confirming':
          await this.confirmCurrent(state.checkpoint.currentJob)
          break
        case 'returning':
          await this.returnToSearch(state.checkpoint)
          return
        case 'searching':
          if (await this.scanCurrentSearch()) return
          break
      }
    }
  }

  private async scanCurrentSearch(): Promise<boolean> {
    const state = await readPersistedState()
    const query = state.filterConfig.includeKeywords[state.checkpoint.queryIndex]
    if (!query) {
      await this.finish('所有筛选词均已处理完毕')
      return true
    }

    const searchUrl = buildSearchUrl(state.filterConfig, query)
    if (!searchParametersMatch(searchUrl)) {
      await this.navigateWithCheckpoint({ ...state.checkpoint, mode: 'searching', searchUrl }, searchUrl)
      return true
    }

    const blocker = this.adapter.detectBlocker()
    if (blocker) {
      await this.block(blocker)
      return true
    }
    await this.adapter.waitForJobList()

    const references = this.adapter.listJobReferences()
    for (const reference of references) {
      const latest = await readPersistedState()
      if (latest.run.status !== 'running') return true
      if (latest.checkpoint.seenJobIds.includes(reference.jobId)) continue

      const checkpoint = {
        ...latest.checkpoint,
        seenJobIds: [...latest.checkpoint.seenJobIds, reference.jobId]
      }
      await saveCheckpoint(checkpoint)
      await this.dispatch({ type: 'SET_CURRENT', jobId: reference.jobId, title: reference.title, now: nowIso() })
      await this.dispatch({ type: 'SCANNED', now: nowIso() })

      if (latest.processedJobs[reference.jobId]?.outcome === 'contacted') {
        await this.dispatch({ type: 'SKIPPED', message: '已存在成功沟通记录，已跳过', now: nowIso() })
        continue
      }

      await this.adapter.selectJob(reference.jobId)
      const job = this.adapter.readSelectedJob(reference.jobId)
      const decision = matchJob(job, latest.filterConfig)
      if (decision.kind !== 'matched') {
        const reason = decision.kind === 'excluded' ? '命中排除词' : '未命中包含词'
        await saveProcessedJob(this.processedJob(job, 'skipped', reason, decision.kind === 'excluded' ? decision.evidence : undefined))
        await this.dispatch({ type: 'SKIPPED', message: reason, now: nowIso() })
        continue
      }

      if (/继续沟通|已沟通/.test(job.visibleAction)) {
        await saveProcessedJob(this.processedJob(job, 'skipped', '该岗位已存在沟通关系', decision.evidence))
        await this.dispatch({ type: 'SKIPPED', message: '该岗位已存在沟通关系', now: nowIso() })
        continue
      }

      await this.dispatch({ type: 'MATCHED', now: nowIso() })
      const beforeClick = await readPersistedState()
      if (beforeClick.run.status !== 'running') return true

      await saveCheckpoint({
        ...beforeClick.checkpoint,
        mode: 'confirming',
        currentJob: job,
        searchUrl,
        navigationExpectedUntil: Date.now() + EXPECTED_NAVIGATION_WINDOW_MS
      })
      const clickGuard = await readPersistedState()
      if (clickGuard.run.status !== 'running') {
        await Promise.all([
          saveRun(
            clickGuard.run.status === 'pause-requested'
              ? reduceRunProgress(clickGuard.run, { type: 'PAUSED', now: nowIso() })
              : clickGuard.run
          ),
          saveCheckpoint({
            ...clickGuard.checkpoint,
            mode: 'searching',
            currentJob: null,
            navigationExpectedUntil: null
          })
        ])
        return true
      }
      const immediateResult = this.adapter.clickContact(job)
      if (immediateResult) await this.handleContactResult(job, immediateResult)
      return false
    }

    if (await this.adapter.loadMore(references.length)) return false
    await this.advanceQuery()
    return true
  }

  private async confirmCurrent(job: JobSnapshot | null): Promise<void> {
    if (!job) throw new Error('缺少待确认岗位检查点')
    await this.handleContactResult(job, await this.adapter.confirmContact(job.jobId))
  }

  private async handleContactResult(job: JobSnapshot, result: ContactResult): Promise<void> {
    const state = await readPersistedState()
    const decision = matchJob(job, state.filterConfig)
    const evidence = decision.kind === 'matched' ? decision.evidence : undefined

    if (result.kind === 'blocked') {
      await saveProcessedJob(this.processedJob(job, 'blocked', result.message, evidence))
      await this.block(result.message)
      return
    }

    if (result.kind === 'failed') {
      const failures = state.checkpoint.consecutiveFailures + 1
      await saveProcessedJob(this.processedJob(job, 'failed', result.message, evidence))
      await this.dispatch({ type: 'FAILED', message: result.message, now: nowIso() })
      await saveCheckpoint({
        ...state.checkpoint,
        mode: 'searching',
        currentJob: null,
        navigationExpectedUntil: null,
        consecutiveFailures: failures
      })
      if (failures >= MAX_CONSECUTIVE_FAILURES) {
        await this.block('连续 3 个岗位未能确认沟通成功，已停止')
        return
      }
    } else {
      await saveProcessedJob(this.processedJob(job, 'contacted', result.message, evidence))
      await this.dispatch({ type: 'CONTACT_CONFIRMED', message: result.message, now: nowIso() })
      await saveCheckpoint({
        ...state.checkpoint,
        mode: 'searching',
        currentJob: null,
        navigationExpectedUntil: null,
        consecutiveFailures: 0
      })
    }

    const latest = await readPersistedState()
    if (hasReachedContactLimit(latest.run, latest.filterConfig.contactLimit)) {
      await this.finish('已达到本次预沟通数量')
      return
    }
    if (latest.run.status === 'pause-requested') {
      await saveRun(reduceRunProgress(latest.run, { type: 'PAUSED', now: nowIso() }))
      return
    }
    if (/^\/web\/geek\/chat/.test(window.location.pathname)) {
      await saveCheckpoint({ ...latest.checkpoint, mode: 'returning' })
    }
  }

  private async returnToSearch(checkpoint: ExecutionCheckpoint): Promise<void> {
    if (!checkpoint.searchUrl) throw new Error('缺少返回职位列表的地址')
    await this.navigateWithCheckpoint({ ...checkpoint, mode: 'searching' }, checkpoint.searchUrl)
  }

  private async advanceQuery(): Promise<void> {
    const state = await readPersistedState()
    const queryIndex = state.checkpoint.queryIndex + 1
    const query = state.filterConfig.includeKeywords[queryIndex]
    if (!query) {
      await this.finish('所有筛选词均已处理完毕')
      return
    }
    const searchUrl = buildSearchUrl(state.filterConfig, query)
    await this.navigateWithCheckpoint(
      { ...state.checkpoint, queryIndex, mode: 'searching', searchUrl },
      searchUrl
    )
  }

  private async navigateWithCheckpoint(checkpoint: ExecutionCheckpoint, url: string): Promise<void> {
    await saveCheckpoint({
      ...checkpoint,
      navigationExpectedUntil: Date.now() + EXPECTED_NAVIGATION_WINDOW_MS
    })
    this.navigationRequested = true
    this.navigate(url)
  }

  private async dispatch(event: RunEvent): Promise<RunProgress> {
    const state = await readPersistedState()
    const run = reduceRunProgress(state.run, event)
    await saveRun(run)
    return run
  }

  private processedJob(
    job: JobSnapshot,
    outcome: ProcessedJob['outcome'],
    reason: string,
    evidence?: { field: ProcessedJob['matchedField']; keyword: string }
  ): ProcessedJob {
    return {
      jobId: job.jobId,
      title: job.title,
      company: job.company,
      url: job.url,
      outcome,
      reason,
      ...(evidence ? { matchedField: evidence.field, matchedKeyword: evidence.keyword } : {}),
      processedAt: nowIso()
    }
  }

  private async finish(reason: string): Promise<void> {
    const state = await readPersistedState()
    await Promise.all([
      saveRun(reduceRunProgress(state.run, { type: 'STOP', reason, now: nowIso() })),
      saveCheckpoint(DEFAULT_EXECUTION_CHECKPOINT)
    ])
  }

  private async block(reason: string): Promise<void> {
    const state = await readPersistedState()
    await Promise.all([
      saveRun(reduceRunProgress(state.run, { type: 'BLOCK', reason, now: nowIso() })),
      saveCheckpoint({ ...state.checkpoint, navigationExpectedUntil: null })
    ])
  }

  private getPageStatus(): PageStatus {
    if (!isSupportedPage()) return { phase: 'unavailable', message: '请打开一个 BOSS 职位页面' }
    const blocker = this.adapter.detectBlocker()
    if (blocker) return { phase: 'error', message: blocker }
    return this.adapter.isReady() || /^\/web\/geek\/chat/.test(window.location.pathname)
      ? { phase: 'ready', message: '当前 BOSS 页面已就绪' }
      : { phase: 'unavailable', message: '请先登录 BOSS 并打开职位页面' }
  }
}

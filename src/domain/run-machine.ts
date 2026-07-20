import { createInitialRunProgress } from './schemas'
import type { RunProgress } from './types'

export type RunEvent =
  | { type: 'START'; now: string }
  | { type: 'SET_CURRENT'; jobId: string; title: string; now: string }
  | { type: 'SCANNED'; now: string }
  | { type: 'MATCHED'; now: string }
  | { type: 'SKIPPED'; message: string; now: string }
  | { type: 'FAILED'; message: string; now: string }
  | { type: 'CONTACT_CONFIRMED'; message: string; now: string }
  | { type: 'REQUEST_PAUSE'; inFlight: boolean; now: string }
  | { type: 'PAUSED'; now: string }
  | { type: 'RESUME'; now: string }
  | { type: 'BLOCK'; reason: string; now: string }
  | { type: 'STOP'; reason?: string; now: string }
  | { type: 'MESSAGE'; message: string; now: string }

export const recoverInterruptedRun = (state: RunProgress, now: string): RunProgress => {
  if (!['running', 'pause-requested'].includes(state.status)) return state

  return {
    ...state,
    status: 'paused',
    lastMessage: '上次运行被中断，请打开 BOSS 职位页面后继续',
    stopReason: null,
    updatedAt: now
  }
}

export const hasReachedContactLimit = (state: RunProgress, contactLimit: number): boolean =>
  state.sessionContactedCount >= contactLimit

export const reduceRunProgress = (state: RunProgress, event: RunEvent): RunProgress => {
  switch (event.type) {
    case 'START':
      return {
        ...createInitialRunProgress(event.now),
        status: 'running',
        startedAt: event.now,
        lastMessage: '开始筛选岗位'
      }
    case 'SET_CURRENT':
      return {
        ...state,
        currentJobId: event.jobId,
        currentJobTitle: event.title,
        updatedAt: event.now
      }
    case 'SCANNED':
      return { ...state, scannedCount: state.scannedCount + 1, updatedAt: event.now }
    case 'MATCHED':
      return { ...state, matchedCount: state.matchedCount + 1, updatedAt: event.now }
    case 'SKIPPED':
      return {
        ...state,
        skippedCount: state.skippedCount + 1,
        lastMessage: event.message,
        updatedAt: event.now
      }
    case 'FAILED':
      return {
        ...state,
        failedCount: state.failedCount + 1,
        lastMessage: event.message,
        updatedAt: event.now
      }
    case 'CONTACT_CONFIRMED':
      return {
        ...state,
        sessionContactedCount: state.sessionContactedCount + 1,
        lastMessage: event.message,
        updatedAt: event.now
      }
    case 'REQUEST_PAUSE':
      return {
        ...state,
        status: event.inFlight ? 'pause-requested' : 'paused',
        lastMessage: event.inFlight ? '当前岗位确认完成后暂停' : '已暂停',
        updatedAt: event.now
      }
    case 'PAUSED':
      return { ...state, status: 'paused', lastMessage: '已暂停', updatedAt: event.now }
    case 'RESUME':
      return { ...state, status: 'running', lastMessage: '继续沟通', updatedAt: event.now }
    case 'BLOCK':
      return {
        ...state,
        status: 'blocked',
        stopReason: event.reason,
        lastMessage: event.reason,
        updatedAt: event.now
      }
    case 'STOP':
      return {
        ...state,
        status: 'stopped',
        stopReason: event.reason ?? null,
        currentJobId: null,
        currentJobTitle: null,
        lastMessage: event.reason ?? '已停止',
        updatedAt: event.now
      }
    case 'MESSAGE':
      return { ...state, lastMessage: event.message, updatedAt: event.now }
  }
}

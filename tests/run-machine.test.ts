import { describe, expect, it } from 'vitest'
import { createInitialRunProgress } from '../src/domain/schemas'
import { hasReachedContactLimit, recoverInterruptedRun, reduceRunProgress } from '../src/domain/run-machine'

const t0 = '2026-07-19T08:00:00.000Z'
const t1 = '2026-07-19T08:00:01.000Z'

describe('reduceRunProgress', () => {
  it('increments the current session count only on confirmed contact', () => {
    let state = reduceRunProgress(createInitialRunProgress(t0), { type: 'START', now: t0 })
    state = reduceRunProgress(state, { type: 'MATCHED', now: t1 })
    expect(state.sessionContactedCount).toBe(0)

    state = reduceRunProgress(state, {
      type: 'CONTACT_CONFIRMED',
      message: '已发送招呼语',
      now: t1
    })
    expect(state.sessionContactedCount).toBe(1)
  })

  it('preserves progress across pause and resume', () => {
    let state = reduceRunProgress(createInitialRunProgress(t0), { type: 'START', now: t0 })
    state = reduceRunProgress(state, {
      type: 'CONTACT_CONFIRMED',
      message: '已发送招呼语',
      now: t1
    })
    state = reduceRunProgress(state, { type: 'REQUEST_PAUSE', inFlight: false, now: t1 })
    state = reduceRunProgress(state, { type: 'RESUME', now: t1 })

    expect(state.status).toBe('running')
    expect(state.sessionContactedCount).toBe(1)
  })

  it('resets the session count for a new run', () => {
    let state = reduceRunProgress(createInitialRunProgress(t0), { type: 'START', now: t0 })
    state = reduceRunProgress(state, {
      type: 'CONTACT_CONFIRMED',
      message: '已发送招呼语',
      now: t1
    })
    state = reduceRunProgress(state, { type: 'STOP', now: t1 })
    state = reduceRunProgress(state, { type: 'START', now: t1 })

    expect(state.sessionContactedCount).toBe(0)
  })

  it('defers pause while a contact is in flight', () => {
    let state = reduceRunProgress(createInitialRunProgress(t0), { type: 'START', now: t0 })
    state = reduceRunProgress(state, { type: 'REQUEST_PAUSE', inFlight: true, now: t1 })
    expect(state.status).toBe('pause-requested')

    state = reduceRunProgress(state, { type: 'PAUSED', now: t1 })
    expect(state.status).toBe('paused')
  })

  it('recovers an interrupted run as paused without losing progress', () => {
    let state = reduceRunProgress(createInitialRunProgress(t0), { type: 'START', now: t0 })
    state = reduceRunProgress(state, {
      type: 'CONTACT_CONFIRMED',
      message: '已发送招呼语',
      now: t1
    })

    const recovered = recoverInterruptedRun(state, t1)

    expect(recovered.status).toBe('paused')
    expect(recovered.sessionContactedCount).toBe(1)
    expect(recovered.lastMessage).toContain('上次运行被中断')
  })

  it('does not change a safely stopped run during recovery', () => {
    const stopped = reduceRunProgress(createInitialRunProgress(t0), {
      type: 'STOP',
      reason: '用户已停止运行',
      now: t1
    })

    expect(recoverInterruptedRun(stopped, t1)).toBe(stopped)
  })

  it('reaches the configured contact limit without an off-by-one error', () => {
    let state = reduceRunProgress(createInitialRunProgress(t0), { type: 'START', now: t0 })
    expect(hasReachedContactLimit(state, 1)).toBe(false)

    state = reduceRunProgress(state, {
      type: 'CONTACT_CONFIRMED',
      message: '已发送招呼语',
      now: t1
    })

    expect(hasReachedContactLimit(state, 1)).toBe(true)
    expect(hasReachedContactLimit(state, 2)).toBe(false)
  })
})

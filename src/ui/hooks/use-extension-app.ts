import { useCallback, useEffect, useState } from 'react'
import { browser } from 'wxt/browser'
import { DEFAULT_PAGE_STATUS } from '../../domain/schemas'
import type { AppSnapshot, FilterConfig } from '../../domain/types'
import {
  clearProcessedJobs,
  deleteProcessedJob,
  readPersistedState,
  saveFilterConfig,
  toAppSnapshot
} from '../../extension/storage'
import type { ContentCommand, ContentResponse } from '../../shared/messages'
import { BOSS_JOBS_URL, isBossWorkspaceUrl } from '../../shared/boss-pages'

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const currentBossTab = async () => {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
  return tab?.id && tab.url && isBossWorkspaceUrl(tab.url) ? tab : null
}

export type ExtensionAppState = {
  snapshot: AppSnapshot | null
  error: string | null
  busyAction: string | null
  refresh: () => Promise<void>
  openBoss: () => Promise<void>
  saveConfig: (config: FilterConfig) => Promise<void>
  startRun: (config: FilterConfig) => Promise<void>
  sendCommand: (action: string, command: ContentCommand) => Promise<void>
  clearHistory: () => Promise<void>
  deleteHistoryJob: (jobId: string) => Promise<void>
}

export const useExtensionApp = (): ExtensionAppState => {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    const localState = await readPersistedState()
    const tab = await currentBossTab()
    if (!tab?.id) {
      setSnapshot(toAppSnapshot(localState, DEFAULT_PAGE_STATUS))
      return
    }

    try {
      const response = (await browser.tabs.sendMessage(tab.id, {
        type: 'GET_SNAPSHOT'
      } satisfies ContentCommand)) as ContentResponse
      if (response.ok) {
        setSnapshot(response.snapshot)
        setError(null)
      } else {
        setSnapshot(toAppSnapshot(localState, { phase: 'error', message: response.message }))
      }
    } catch {
      setSnapshot(
        toAppSnapshot(localState, {
          phase: 'unavailable',
          message: '扩展尚未连接当前页面，请刷新 BOSS 页面'
        })
      )
    }
  }, [])

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => void refresh(), 0)
    const handleStorageChange = (): void => void refresh()
    const handleTabChange = (): void => void refresh()
    browser.storage.onChanged.addListener(handleStorageChange)
    browser.tabs.onActivated.addListener(handleTabChange)
    browser.tabs.onUpdated.addListener(handleTabChange)
    return () => {
      window.clearTimeout(initialRefresh)
      browser.storage.onChanged.removeListener(handleStorageChange)
      browser.tabs.onActivated.removeListener(handleTabChange)
      browser.tabs.onUpdated.removeListener(handleTabChange)
    }
  }, [refresh])

  const sendCommand = useCallback(
    async (action: string, command: ContentCommand): Promise<void> => {
      setBusyAction(action)
      setError(null)
      try {
        const tab = await currentBossTab()
        if (!tab?.id) throw new Error('请先打开 BOSS 职位页面')
        const response = (await browser.tabs.sendMessage(tab.id, command)) as ContentResponse
        if (!response.ok) throw new Error(response.message)
        setSnapshot(response.snapshot)
      } catch (cause) {
        setError(errorMessage(cause))
      } finally {
        setBusyAction(null)
      }
    },
    []
  )

  const saveConfig = useCallback(
    async (config: FilterConfig): Promise<void> => {
      try {
        await saveFilterConfig(config)
      } catch (cause) {
        setError(errorMessage(cause))
      }
    },
    []
  )

  const startRun = useCallback(
    async (config: FilterConfig): Promise<void> => {
      await saveFilterConfig(config)
      await sendCommand('start', { type: 'START' })
    },
    [sendCommand]
  )

  const clearHistory = useCallback(async (): Promise<void> => {
    setBusyAction('clear-history')
    try {
      await clearProcessedJobs()
      await refresh()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusyAction(null)
    }
  }, [refresh])

  const deleteHistoryJob = useCallback(
    async (jobId: string): Promise<void> => {
      setBusyAction(`delete-history:${jobId}`)
      try {
        await deleteProcessedJob(jobId)
        await refresh()
      } catch (cause) {
        setError(errorMessage(cause))
      } finally {
        setBusyAction(null)
      }
    },
    [refresh]
  )

  const openBoss = useCallback(async (): Promise<void> => {
    await browser.tabs.create({ url: BOSS_JOBS_URL })
  }, [])

  return {
    snapshot,
    error,
    busyAction,
    refresh,
    openBoss,
    saveConfig,
    startRun,
    sendCommand,
    clearHistory,
    deleteHistoryJob
  }
}

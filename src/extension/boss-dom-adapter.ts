import type { FilterConfig, JobSnapshot } from '../domain/types'
import { BOSS_JOBS_URL } from '../shared/boss-pages'

export type JobReference = {
  jobId: string
  title: string
}

export type ContactResult =
  | { kind: 'success'; message: string }
  | { kind: 'blocked'; message: string }
  | { kind: 'failed'; message: string }

const JOB_ID_PATTERN = /\/job_detail\/([^/?]+)\.html/
const JOB_SELECTION_TIMEOUT_MS = 6_000
const CONTACT_CONFIRM_TIMEOUT_MS = 10_000
const DIALOG_SELECTOR = '[role="dialog"], .dialog-wrap, .boss-popup, .modal-container'
const SENT_GREETING_TITLE = '已向BOSS发送消息'
const CONTINUE_CONTACT_TEXT = '继续沟通'
const STAY_ON_PAGE_TEXT = '留在此页'
const NATIVE_INTERACTIVE_SELECTOR =
  'button, a, [role="button"], input[type="button"], input[type="submit"]'
const FALLBACK_INTERACTIVE_SELECTOR = '[class*="btn"], [class*="button"]'
const BLOCKING_TEXT = [
  '今日沟通人数已达上限',
  '沟通人数已达上限',
  '操作过于频繁',
  '账号异常',
  '请完成安全验证'
]

const extractJobId = (href: string): string | null => href.match(JOB_ID_PATTERN)?.[1] ?? null

const normalizedValue = (value: string | null | undefined): string =>
  (value ?? '').trim().replace(/\s+/g, '')

const isVisible = (element: Element | null): element is HTMLElement => {
  if (!(element instanceof HTMLElement)) return false
  const style = window.getComputedStyle(element)
  return style.visibility !== 'hidden' && style.display !== 'none' && element.getClientRects().length > 0
}

const waitFor = async (condition: () => boolean, timeoutMs: number): Promise<void> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (condition()) return
    await new Promise((resolve) => window.setTimeout(resolve, 120))
  }
  throw new Error('等待页面状态超时')
}

export const buildSearchUrl = (config: FilterConfig, query: string): string => {
  const url = new URL(BOSS_JOBS_URL)
  url.searchParams.set('query', query)
  url.searchParams.set('city', config.cityCode)
  if (config.companyScales.length > 0) url.searchParams.set('scale', config.companyScales.join(','))
  return url.toString()
}

export class BossDomAdapter {
  isReady(): boolean {
    const loginVisible = isVisible(
      document.querySelector('.login-register, .btn-login, [class*="login-dialog"]')
    )
    const identityPresent = Boolean(
      document.querySelector('a.link-logout, .nav-figure, [class*="user-avatar"]')
    )
    const jobListVisible = isVisible(document.querySelector('.job-card-wrap'))
    return !loginVisible && (identityPresent || jobListVisible)
  }

  async waitForJobList(): Promise<void> {
    await waitFor(() => isVisible(document.querySelector('.job-card-wrap')), 15_000)
  }

  listJobReferences(): JobReference[] {
    const references = new Map<string, JobReference>()
    const links = document.querySelectorAll<HTMLAnchorElement>(
      '.job-card-wrap a.job-name[href*="/job_detail/"]'
    )
    for (const link of links) {
      const jobId = extractJobId(link.href)
      if (jobId) references.set(jobId, { jobId, title: link.textContent?.trim() ?? '' })
    }
    return [...references.values()]
  }

  async selectJob(jobId: string): Promise<void> {
    if (this.isJobSelected(jobId)) return

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const link = document.querySelector<HTMLAnchorElement>(
        `.job-card-wrap a.job-name[href*="/job_detail/${CSS.escape(jobId)}.html"]`
      )
      if (isVisible(link)) {
        link.scrollIntoView({ block: 'nearest' })
        link.click()
        try {
          await waitFor(() => this.isJobSelected(jobId), JOB_SELECTION_TIMEOUT_MS)
          return
        } catch {
          // Dynamic result lists can replace the clicked node once; reacquire and retry.
        }
      }
      await new Promise((resolve) => window.setTimeout(resolve, 250))
    }

    throw new Error('BOSS 岗位列表持续更新，无法稳定选择目标岗位，已停止以避免误操作')
  }

  readSelectedJob(expectedJobId: string): JobSnapshot {
    const activeLink = document.querySelector<HTMLAnchorElement>('.job-card-wrap.active a.job-name')
    const href = activeLink?.getAttribute('href') ?? ''
    const activeDetailJobId = extractJobId(href) ?? ''
    if (!activeDetailJobId || activeDetailJobId !== expectedJobId) {
      throw new Error('列表岗位与详情岗位不一致，已停止以避免误操作')
    }

    if (!activeLink) throw new Error('未找到当前岗位列表项，已停止以避免误操作')
    const activeCard = activeLink.closest('.job-card-wrap')
    const action = this.detailAction(expectedJobId)
    return {
      jobId: expectedJobId,
      url: new URL(href, window.location.origin).toString(),
      title: activeLink.textContent?.trim() ?? '',
      company: activeCard?.querySelector('.boss-name')?.textContent?.trim() ?? '',
      location: activeCard?.querySelector('.company-location')?.textContent?.trim() ?? '',
      description: document.querySelector('.job-detail-box p.desc')?.textContent?.trim() ?? '',
      skills: [...document.querySelectorAll('.job-detail-box .job-label-list li')]
        .map((item) => item.textContent?.trim() ?? '')
        .filter(Boolean),
      activeDetailJobId,
      visibleAction: action?.textContent?.trim() ?? ''
    }
  }

  detectBlocker(): string | null {
    if (
      /\/web\/user\/?|\/login/.test(window.location.pathname) ||
      isVisible(document.querySelector('.login-register, .btn-login, [class*="login-dialog"]'))
    ) {
      return 'BOSS 登录状态已失效'
    }

    if (
      isVisible(
        document.querySelector('[class*="geetest"], iframe[src*="captcha"], [class*="verify"]')
      )
    ) {
      return '检测到安全验证'
    }

    const bodyText = document.body?.innerText ?? ''
    const blockingText = BLOCKING_TEXT.find((text) => bodyText.includes(text))
    if (blockingText) return blockingText

    const sentGreetingContainers = this.sentGreetingDialogDiscovery().containers
    const unknownDialog = this.visibleDialogs().find(
      (dialog) =>
        !sentGreetingContainers.some(
          (container) => dialog === container || dialog.contains(container) || container.contains(dialog)
        )
    )
    if (unknownDialog) {
      return '检测到未知弹窗，已停止'
    }
    return null
  }

  clickContact(job: JobSnapshot): ContactResult | null {
    const blocker = this.detectBlocker()
    if (blocker) return { kind: 'blocked', message: blocker }
    if (/继续沟通|已沟通/.test(job.visibleAction)) {
      return { kind: 'failed', message: '该岗位已存在沟通关系' }
    }
    if (!this.isJobSelected(job.jobId)) {
      return { kind: 'blocked', message: '沟通前岗位详情已发生变化，已停止以避免误操作' }
    }

    const action = this.detailAction(job.jobId)
    if (!isVisible(action)) return { kind: 'failed', message: '未找到可见的立即沟通按钮' }
    action.click()
    return null
  }

  async confirmContact(jobId: string): Promise<ContactResult> {
    let continuedFromGreetingDialog = false
    try {
      await waitFor(() => {
        if (!continuedFromGreetingDialog) {
          const dialogResult = this.continueFromSentGreetingDialog()
          if (dialogResult === 'invalid') throw new Error('SENT_GREETING_DIALOG_INVALID')
          continuedFromGreetingDialog = dialogResult === 'clicked'
        }
        return this.successSignalCount(jobId, continuedFromGreetingDialog) >= 2
      }, CONTACT_CONFIRM_TIMEOUT_MS)
      return { kind: 'success', message: '已通过双重页面信号确认沟通成功' }
    } catch (error) {
      if (error instanceof Error && error.message === 'SENT_GREETING_DIALOG_INVALID') {
        return { kind: 'blocked', message: '已发现沟通确认弹窗，但无法唯一定位“继续沟通”，已停止' }
      }
      const blocker = this.detectBlocker()
      return blocker
        ? { kind: 'blocked', message: blocker }
        : { kind: 'failed', message: '未能确认平台内置招呼语发送成功' }
    }
  }

  async loadMore(previousCount: number): Promise<boolean> {
    const cards = document.querySelectorAll<HTMLElement>('.job-card-wrap')
    cards.item(cards.length - 1)?.scrollIntoView({ block: 'nearest' })
    await new Promise((resolve) => window.setTimeout(resolve, 1_000))
    return document.querySelectorAll('.job-card-wrap').length > previousCount
  }

  private isJobSelected(jobId: string): boolean {
    const escapedId = CSS.escape(jobId)
    const activeLink = document.querySelector(
      `.job-card-wrap.active a.job-name[href*="/job_detail/${escapedId}.html"]`
    )
    return isVisible(activeLink) && isVisible(this.detailAction(jobId))
  }

  private detailAction(jobId: string): HTMLElement | null {
    return document.querySelector<HTMLElement>(
      `.job-detail-box .op-btn-chat[ka*="${CSS.escape(jobId)}"]`
    )
  }

  private visibleDialogs(): HTMLElement[] {
    return [...document.querySelectorAll<HTMLElement>(DIALOG_SELECTOR)].filter((dialog) =>
      isVisible(dialog)
    )
  }

  private exactTextElements(root: HTMLElement, text: string): HTMLElement[] {
    const matches = new Set<HTMLElement>()
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode()
    while (node) {
      if (normalizedValue(node.nodeValue) === text && node.parentElement && isVisible(node.parentElement)) {
        matches.add(node.parentElement)
      }
      node = walker.nextNode()
    }
    return [...matches]
  }

  private interactiveElementsByText(root: HTMLElement, text: string): HTMLElement[] {
    const matches = new Set<HTMLElement>()
    for (const textElement of this.exactTextElements(root, text)) {
      const interactive =
        textElement.closest<HTMLElement>(NATIVE_INTERACTIVE_SELECTOR) ??
        textElement.closest<HTMLElement>(FALLBACK_INTERACTIVE_SELECTOR)
      if (interactive && root.contains(interactive) && isVisible(interactive)) matches.add(interactive)
    }
    for (const input of root.querySelectorAll<HTMLInputElement>('input[type="button"], input[type="submit"]')) {
      if (isVisible(input) && normalizedValue(input.value) === text) matches.add(input)
    }
    return [...matches]
  }

  private sentGreetingDialogDiscovery(): { titleFound: boolean; containers: HTMLElement[] } {
    if (!document.body) return { titleFound: false, containers: [] }
    const titles = this.exactTextElements(document.body, SENT_GREETING_TITLE)
    const containers = new Set<HTMLElement>()
    for (const title of titles) {
      let candidate = title.parentElement
      while (candidate && candidate !== document.body) {
        const continueActions = this.interactiveElementsByText(candidate, CONTINUE_CONTACT_TEXT)
        const stayActions = this.interactiveElementsByText(candidate, STAY_ON_PAGE_TEXT)
        if (continueActions.length === 1 && stayActions.length === 1) {
          containers.add(candidate)
          break
        }
        candidate = candidate.parentElement
      }
    }
    return { titleFound: titles.length > 0, containers: [...containers] }
  }

  private continueFromSentGreetingDialog(): 'absent' | 'clicked' | 'invalid' {
    const discovery = this.sentGreetingDialogDiscovery()
    if (!discovery.titleFound) return 'absent'
    if (discovery.containers.length !== 1) return 'invalid'
    const buttons = this.interactiveElementsByText(discovery.containers[0]!, CONTINUE_CONTACT_TEXT)
    if (buttons.length !== 1) return 'invalid'
    buttons[0]!.click()
    return 'clicked'
  }

  private successSignalCount(jobId: string, continuedFromGreetingDialog = false): number {
    const routeSignal = /\/web\/geek\/chat/.test(window.location.pathname)
    const chatSurfaceSignal = [...document.querySelectorAll<HTMLElement>(
      '.chat-container, .chat-box, [class*="chat-dialog"]'
    )].some((element) => isVisible(element))
    const relationshipSignal = /继续沟通|已沟通/.test(this.detailAction(jobId)?.textContent ?? '')
    return [continuedFromGreetingDialog, routeSignal, chatSurfaceSignal, relationshipSignal].filter(Boolean)
      .length
  }
}

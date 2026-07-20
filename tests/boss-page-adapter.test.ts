// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BossDomAdapter } from '../src/extension/boss-dom-adapter'

const fixture = readFileSync(resolve('tests/fixtures/boss/jobs.html'), 'utf8')

const installFixtureBehavior = (): void => {
  Object.defineProperty(window, 'CSS', {
    configurable: true,
    value: { escape: (value: string) => value.replace(/["\\]/g, '\\$&') }
  })
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn()
  })
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue({ length: 1 } as DOMRectList)

  const cards = [...document.querySelectorAll<HTMLElement>('.job-card-wrap')]
  const action = document.querySelector<HTMLButtonElement>('.op-btn-chat')!
  cards[1]?.querySelector('.job-name')?.addEventListener('click', (event) => {
    event.preventDefault()
    cards.forEach((card) => card.classList.remove('active'))
    cards[1]?.classList.add('active')
    action.setAttribute('ka', 'job-2')
    action.textContent = '立即沟通'
  })
  action.addEventListener('click', () => {
    if (action.dataset.mode === 'dialog') {
      const dialog = document.createElement('section')
      dialog.className = 'contact-confirm-layer'
      dialog.innerHTML = `
        <div class="contact-confirm-panel">
          <div class="contact-confirm-heading">已向BOSS发送消息</div>
          <p>Boss您好，我想进一步了解该岗位</p>
          <button type="button">留在此页</button>
          <button data-action="continue" type="button"><span>继续沟通</span></button>
        </div>
      `
      dialog.querySelector('[data-action="continue"]')?.addEventListener('click', () => {
        const count = Number(document.body.dataset.continueClickCount ?? '0') + 1
        document.body.dataset.continueClickCount = String(count)
        action.textContent = '继续沟通'
        const chat = document.createElement('section')
        chat.className = 'chat-container'
        chat.textContent = '系统招呼语已显示'
        document.body.append(chat)
        dialog.remove()
      })
      document.body.append(dialog)
      return
    }
    action.textContent = '继续沟通'
    const chat = document.createElement('section')
    chat.className = 'chat-container'
    chat.textContent = '系统招呼语已显示'
    document.body.append(chat)
  })
}

describe('BossDomAdapter local fixture', () => {
  beforeEach(() => {
    document.open()
    document.write(fixture)
    document.close()
    installFixtureBehavior()
  })

  it('reads and correlates the selected job with the detail action', () => {
    const adapter = new BossDomAdapter()
    expect(adapter.listJobReferences()).toEqual([
      { jobId: 'job-1', title: '嵌入式软件工程师' },
      { jobId: 'job-2', title: 'MCU 开发工程师' }
    ])
    expect(adapter.readSelectedJob('job-1')).toMatchObject({
      jobId: 'job-1',
      activeDetailJobId: 'job-1',
      title: '嵌入式软件工程师',
      company: '示例科技',
      location: '杭州',
      skills: ['C 语言', '单片机开发'],
      visibleAction: '立即沟通'
    })
  })

  it('does not click a job that is already selected and correlated', async () => {
    const adapter = new BossDomAdapter()
    const activeLink = document.querySelector('.job-card-wrap.active a.job-name')!
    const clicked = vi.fn()
    activeLink.addEventListener('click', clicked)
    await adapter.selectJob('job-1')
    expect(clicked).not.toHaveBeenCalled()
  })

  it('selects an inactive job and waits for matching detail state', async () => {
    const adapter = new BossDomAdapter()
    await adapter.selectJob('job-2')
    expect(document.querySelector('.job-card-wrap.active a.job-name')?.getAttribute('href')).toContain(
      '/job_detail/job-2.html'
    )
    expect(document.querySelector('.job-detail-box .op-btn-chat')?.getAttribute('ka')).toBe('job-2')
  })

  it('stops when the selected list job and expected detail job differ', () => {
    expect(() => new BossDomAdapter().readSelectedJob('job-2')).toThrow('列表岗位与详情岗位不一致')
  })

  it('detects verification UI and unknown visible dialogs', () => {
    const verification = document.createElement('div')
    verification.className = 'geetest-panel'
    document.body.append(verification)
    expect(new BossDomAdapter().detectBlocker()).toBe('检测到安全验证')

    verification.remove()
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    dialog.textContent = '页面结构发生变化'
    document.body.append(dialog)
    expect(new BossDomAdapter().detectBlocker()).toBe('检测到未知弹窗，已停止')
  })

  it('rejects an already-contacted job without clicking', () => {
    const adapter = new BossDomAdapter()
    const job = adapter.readSelectedJob('job-1')
    expect(adapter.clickContact({ ...job, visibleAction: '继续沟通' })).toEqual({
      kind: 'failed',
      message: '该岗位已存在沟通关系'
    })
    expect(document.querySelector('.chat-container')).toBeNull()
  })

  it('blocks before contact when the selected job correlation changes', () => {
    const adapter = new BossDomAdapter()
    const job = adapter.readSelectedJob('job-1')
    const cards = document.querySelectorAll('.job-card-wrap')
    cards.item(0).classList.remove('active')
    cards.item(1).classList.add('active')
    expect(adapter.clickContact(job)).toEqual({
      kind: 'blocked',
      message: '沟通前岗位详情已发生变化，已停止以避免误操作'
    })
  })

  it('returns success after two visible confirmation signals appear', async () => {
    const adapter = new BossDomAdapter()
    const job = adapter.readSelectedJob('job-1')
    expect(adapter.clickContact(job)).toBeNull()
    await expect(adapter.confirmContact(job.jobId)).resolves.toEqual({
      kind: 'success',
      message: '已通过双重页面信号确认沟通成功'
    })
    expect(document.querySelector('.chat-container')).not.toBeNull()
    expect(document.querySelector('.op-btn-chat')?.textContent).toBe('继续沟通')
  })

  it('continues from the sent-greeting dialog without clicking same text outside it', async () => {
    const adapter = new BossDomAdapter()
    const job = adapter.readSelectedJob('job-1')
    const action = document.querySelector<HTMLButtonElement>('.op-btn-chat')!
    action.dataset.mode = 'dialog'
    const outside = document.createElement('button')
    outside.textContent = '继续沟通'
    const outsideClick = vi.fn()
    outside.addEventListener('click', outsideClick)
    document.body.append(outside)

    expect(adapter.clickContact(job)).toBeNull()
    expect(adapter.detectBlocker()).toBeNull()
    await expect(adapter.confirmContact(job.jobId)).resolves.toEqual({
      kind: 'success',
      message: '已通过双重页面信号确认沟通成功'
    })
    expect(document.body.dataset.continueClickCount).toBe('1')
    expect(outsideClick).not.toHaveBeenCalled()
  })

  it('does not click when the sent-greeting dialog has multiple continue actions', async () => {
    const adapter = new BossDomAdapter()
    const dialog = document.createElement('section')
    dialog.setAttribute('role', 'dialog')
    dialog.innerHTML = `
      <h3>已向BOSS发送消息</h3>
      <button type="button">继续沟通</button>
      <button type="button">继续沟通</button>
    `
    const clicks = vi.fn()
    dialog.querySelectorAll('button').forEach((button) => button.addEventListener('click', clicks))
    document.body.append(dialog)

    await expect(adapter.confirmContact('job-1')).resolves.toEqual({
      kind: 'blocked',
      message: '已发现沟通确认弹窗，但无法唯一定位“继续沟通”，已停止'
    })
    expect(clicks).not.toHaveBeenCalled()
  })

  it('treats greeting text outside a dialog heading as an unknown dialog', () => {
    const dialog = document.createElement('section')
    dialog.setAttribute('role', 'dialog')
    dialog.innerHTML = '<p>已向BOSS发送消息</p><button type="button">继续沟通</button>'
    document.body.append(dialog)
    expect(new BossDomAdapter().detectBlocker()).toBe('检测到未知弹窗，已停止')
  })
})

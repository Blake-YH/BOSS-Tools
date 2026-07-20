import { browser } from 'wxt/browser'
import { defineContentScript } from 'wxt/utils/define-content-script'
import { ContentRunController } from '../src/extension/content-run-controller'
import { isContentCommand } from '../src/shared/messages'

export default defineContentScript({
  matches: ['https://www.zhipin.com/web/geek/*'],
  main() {
    const controller = new ContentRunController()
    browser.runtime.onMessage.addListener((message: unknown) => {
      if (!isContentCommand(message)) return undefined
      return controller.handle(message)
    })
    void controller.initialize()
  }
})

import { defineConfig } from 'wxt'

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'BOSS Tools',
    description: '在当前 BOSS 职位页面筛选岗位并串行发送平台内置招呼语。',
    version: '0.1.0',
    minimum_chrome_version: '114',
    permissions: ['storage', 'sidePanel'],
    host_permissions: ['https://www.zhipin.com/web/geek/*'],
    action: {
      default_title: '打开 BOSS Tools 工作台'
    }
  }
})

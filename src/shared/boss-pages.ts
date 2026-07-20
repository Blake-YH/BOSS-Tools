export const BOSS_JOBS_URL = 'https://www.zhipin.com/web/geek/jobs'

export const isBossWorkspaceUrl = (value: string): boolean => {
  try {
    const url = new URL(value)
    return (
      url.hostname === 'www.zhipin.com' &&
      /^\/web\/geek\/(jobs|chat)(?:\/|$)/.test(url.pathname)
    )
  } catch {
    return false
  }
}

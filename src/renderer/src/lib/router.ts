import type { RouterDetection } from '@shared/types'

export function normalizeRouterUrl(url: string): string {
  let base = (url || '').trim() || 'http://192.168.1.1'
  if (!/^https?:\/\//i.test(base)) base = `http://${base}`
  return base.replace(/\/+$/, '')
}

// 识别结果只对当次填写的地址有效，改过地址后不能拿旧结果下结论
export function activeDetection(
  detection: RouterDetection | null | undefined,
  url: string
): RouterDetection | null {
  if (!detection) return null
  return normalizeRouterUrl(url) === detection.url ? detection : null
}

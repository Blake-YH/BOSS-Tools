import { describe, expect, it } from 'vitest'
import { matchJob, sanitizeFilterConfig } from '../src/domain/matcher'
import { DEFAULT_FILTER_CONFIG } from '../src/domain/schemas'
import type { JobSnapshot } from '../src/domain/types'

const job: JobSnapshot = {
  jobId: 'job-1',
  url: 'https://www.zhipin.com/job_detail/job-1.html',
  title: '嵌入式软件工程师',
  company: '示例科技',
  location: '杭州',
  description: '负责 STM32、FreeRTOS 和 MCU开发',
  skills: ['C语言', '单片机开发'],
  activeDetailJobId: 'job-1',
  visibleAction: '立即沟通'
}

describe('matchJob', () => {
  it('matches include keywords across title, skills, and description', () => {
    expect(matchJob(job, { ...DEFAULT_FILTER_CONFIG, includeKeywords: ['MCU开发'] })).toEqual({
      kind: 'matched',
      evidence: { field: 'description', keyword: 'MCU开发' }
    })
  })

  it('applies company exclusions before includes', () => {
    expect(
      matchJob(job, {
        ...DEFAULT_FILTER_CONFIG,
        includeKeywords: ['嵌入式'],
        excludeKeywords: ['示例科技']
      })
    ).toEqual({
      kind: 'excluded',
      evidence: { field: 'company', keyword: '示例科技' }
    })
  })

  it('does not match without include keywords', () => {
    expect(matchJob(job, { ...DEFAULT_FILTER_CONFIG, includeKeywords: [] })).toEqual({
      kind: 'not-matched',
      reason: 'no-include-keywords'
    })
  })
})

describe('sanitizeFilterConfig', () => {
  it('trims, removes empty entries, and merges duplicates', () => {
    const result = sanitizeFilterConfig({
      ...DEFAULT_FILTER_CONFIG,
      includeKeywords: [' MCU ', '', 'MCU'],
      excludeKeywords: ['外包', ' 外包 ']
    })

    expect(result.includeKeywords).toEqual(['MCU'])
    expect(result.excludeKeywords).toEqual(['外包'])
  })
})

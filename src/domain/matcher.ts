import type { FilterConfig, JobSnapshot, MatchDecision, MatchEvidence, MatchField } from './types'

const normalize = (value: string): string => value.trim().toLocaleLowerCase('zh-CN')

const findEvidence = (fields: Array<[MatchField, string]>, keywords: string[]): MatchEvidence | undefined => {
  for (const rawKeyword of keywords) {
    const keyword = normalize(rawKeyword)
    if (!keyword) continue

    for (const [field, value] of fields) {
      if (normalize(value).includes(keyword)) {
        return { field, keyword: rawKeyword.trim() }
      }
    }
  }

  return undefined
}

export const sanitizeFilterConfig = (config: FilterConfig): FilterConfig => ({
  ...config,
  cityCode: config.cityCode.trim(),
  cityLabel: config.cityLabel.trim(),
  companyScales: [...new Set(config.companyScales)],
  includeKeywords: [...new Set(config.includeKeywords.map((keyword) => keyword.trim()).filter(Boolean))],
  excludeKeywords: [...new Set(config.excludeKeywords.map((keyword) => keyword.trim()).filter(Boolean))]
})

export const matchJob = (job: JobSnapshot, rawConfig: FilterConfig): MatchDecision => {
  const config = sanitizeFilterConfig(rawConfig)
  const sharedFields: Array<[MatchField, string]> = [
    ['title', job.title],
    ['skills', job.skills.join(' ')],
    ['description', job.description]
  ]
  const excludeEvidence = findEvidence([...sharedFields, ['company', job.company]], config.excludeKeywords)

  if (excludeEvidence) {
    return { kind: 'excluded', evidence: excludeEvidence }
  }

  if (config.includeKeywords.length === 0) {
    return { kind: 'not-matched', reason: 'no-include-keywords' }
  }

  const includeEvidence = findEvidence(sharedFields, config.includeKeywords)
  return includeEvidence
    ? { kind: 'matched', evidence: includeEvidence }
    : { kind: 'not-matched', reason: 'no-include-hit' }
}

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EXECUTION_CHECKPOINT,
  DEFAULT_FILTER_CONFIG,
  executionCheckpointSchema,
  filterConfigSchema
} from '../src/domain/schemas'

describe('filterConfigSchema contact limit', () => {
  it('migrates persisted settings without a contact limit to the safe default', () => {
    const legacyConfig = {
      cityCode: DEFAULT_FILTER_CONFIG.cityCode,
      cityLabel: DEFAULT_FILTER_CONFIG.cityLabel,
      companyScales: DEFAULT_FILTER_CONFIG.companyScales,
      includeKeywords: DEFAULT_FILTER_CONFIG.includeKeywords,
      excludeKeywords: DEFAULT_FILTER_CONFIG.excludeKeywords
    }

    expect(filterConfigSchema.parse(legacyConfig).contactLimit).toBe(1)
  })

  it.each([0, 201, 1.5])('rejects an invalid contact limit: %s', (contactLimit) => {
    expect(() => filterConfigSchema.parse({ ...DEFAULT_FILTER_CONFIG, contactLimit })).toThrow()
  })

  it('accepts the upper contact limit boundary', () => {
    expect(filterConfigSchema.parse({ ...DEFAULT_FILTER_CONFIG, contactLimit: 200 }).contactLimit).toBe(200)
  })
})

describe('executionCheckpointSchema', () => {
  it('migrates a version-2 checkpoint without the consecutive failure counter', () => {
    const legacyCheckpoint: Record<string, unknown> = { ...DEFAULT_EXECUTION_CHECKPOINT }
    delete legacyCheckpoint.consecutiveFailures
    expect(executionCheckpointSchema.parse(legacyCheckpoint).consecutiveFailures).toBe(0)
  })
})

import { describe, expect, it } from 'vitest'
import { analyzeConsentedFeedback } from './deterministic-analyzer.js'

describe('deterministic consented-feedback analysis', () => {
  it('derives bounded English signals without retaining source text', () => {
    const result = analyzeConsentedFeedback('I love the fresh citrus opening, but the drydown is a little weak.')
    expect(result.language).toBe('EN')
    expect(result.overall.label).toBe('MIXED')
    expect(result.descriptors.map((item) => item.id)).toContain('citrus')
    expect(result.aspects.map((item) => item.id)).toContain('drydown')
    expect(JSON.stringify(result)).not.toContain('I love')
  })

  it('recognizes Vietnamese sensory language and marks heuristic evidence low confidence', () => {
    const result = analyzeConsentedFeedback('Tôi thích mùi hương hoa hồng mượt, nhưng độ tỏa hơi yếu.')
    expect(result.language).toBe('VI')
    expect(result.descriptors.map((item) => item.id)).toEqual(expect.arrayContaining(['floral']))
    expect(result.evidenceStatus).toBe('LOW_CONFIDENCE')
  })
})

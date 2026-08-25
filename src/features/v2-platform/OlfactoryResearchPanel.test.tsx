import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { OlfactoryResearchPanel } from './OlfactoryResearchPanel'
import { trainingModeLabel } from './olfactory-research-labels'

describe('OlfactoryResearchPanel fail-closed states', () => {
  it('renders the research disclaimer and no fabricated output before inference', () => {
    const markup = renderToStaticMarkup(<OlfactoryResearchPanel material={{ id: 'material_1', name: 'Held-out demo material' }} />)
    expect(markup).toContain('Research odor profile')
    expect(markup).toContain('Not a safety, regulatory, IFRA, supplier, or formula-approval decision.')
    expect(markup).toContain('No inference has been requested.')
    expect(markup).not.toContain('EVALUATED_RESEARCH')
  })

  it('labels the historical mode as transfer learning without implying encoder fine-tuning', () => {
    expect(trainingModeLabel('FINE_TUNE_FROZEN_PRETRAINED_ENCODER')).toBe('Transfer learning — frozen pretrained encoder')
    expect(trainingModeLabel('TRANSFER_LEARNING_FROZEN_PRETRAINED_ENCODER')).toBe('Transfer learning — frozen pretrained encoder')
  })
})

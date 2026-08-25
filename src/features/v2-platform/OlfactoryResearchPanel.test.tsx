import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { OlfactoryResearchPanel } from './OlfactoryResearchPanel'

describe('OlfactoryResearchPanel fail-closed states', () => {
  it('renders the research disclaimer and no fabricated output before inference', () => {
    const markup = renderToStaticMarkup(<OlfactoryResearchPanel material={{ id: 'material_1', name: 'Held-out demo material' }} />)
    expect(markup).toContain('Research odor profile')
    expect(markup).toContain('Not a safety, regulatory, IFRA, supplier, or formula-approval decision.')
    expect(markup).toContain('No inference has been requested.')
    expect(markup).not.toContain('EVALUATED_RESEARCH')
  })
})

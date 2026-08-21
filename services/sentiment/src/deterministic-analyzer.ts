/**
 * A bounded, transparent fallback for consented feedback that has been read
 * from an approved private store. Callers must never persist `rawText`; this
 * module returns only derived signals suitable for `v2_sentiment_analyses`.
 * It intentionally reports LOW_CONFIDENCE rather than pretending that a
 * keyword model is a validated consumer-science classifier.
 */
export type DeterministicAnalysis = {
  language: 'EN' | 'VI' | 'UNKNOWN'
  languageConfidence: number
  overall: { label: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'MIXED'; score: number; confidence: number }
  aspects: Array<{ id: string; label: string; score: number; confidence: number }>
  perceptions: Array<{ id: string; value: number; confidence: number }>
  descriptors: Array<{ id: string; value: number; confidence: number }>
  evidenceStatus: 'LOW_CONFIDENCE' | 'NOT_ENOUGH_EVIDENCE'
}

const POSITIVE = new Set(['love', 'loved', 'beautiful', 'great', 'excellent', 'pleasant', 'elegant', 'smooth', 'fresh', 'ấm', 'thích', 'đẹp', 'hay', 'tuyệt', 'sang', 'mượt', 'dễ chịu'])
const NEGATIVE = new Set(['hate', 'hated', 'bad', 'poor', 'harsh', 'synthetic', 'weak', 'overpowering', 'dislike', 'ghét', 'tệ', 'gắt', 'nhân tạo', 'yếu', 'quá nồng', 'không thích'])
const ASPECTS: Record<string, string[]> = {
  opening: ['opening', 'top', 'mở đầu', 'hương đầu'], heart: ['heart', 'middle', 'giữa', 'hương giữa'],
  drydown: ['drydown', 'base', 'nền', 'hương cuối'], longevity: ['longevity', 'lasts', 'lasting', 'lâu', 'lưu hương'],
  diffusion: ['projection', 'sillage', 'diffusion', 'tỏa', 'lan tỏa'],
}
const DESCRIPTORS: Record<string, string[]> = {
  citrus: ['citrus', 'lemon', 'bergamot', 'cam', 'chanh', 'quýt'], floral: ['floral', 'rose', 'jasmine', 'hoa', 'hồng', 'nhài'],
  woody: ['woody', 'cedar', 'sandal', 'gỗ', 'tuyết tùng', 'đàn hương'], musk: ['musk', 'musky', 'xạ hương'],
  amber: ['amber', 'ambery', 'hổ phách'], marine: ['marine', 'aquatic', 'biển', 'nước'],
}

function normalized(rawText: string) { return rawText.normalize('NFKC').toLocaleLowerCase().replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim() }
function matches(text: string, terms: string[]) { return terms.some((term) => text.includes(term)) }
function scoreNear(text: string, terms: string[]) {
  const fragments = text.split(/[.!?;\n]+/); let positive = 0; let negative = 0; let observations = 0
  for (const fragment of fragments) {
    if (!matches(fragment, terms)) continue
    observations += 1
    for (const word of POSITIVE) if (fragment.includes(word)) positive += 1
    for (const word of NEGATIVE) if (fragment.includes(word)) negative += 1
  }
  if (!observations) return { score: 0, confidence: 0 }
  return { score: Math.max(-1, Math.min(1, (positive - negative) / Math.max(1, positive + negative))), confidence: Math.min(0.6, 0.25 + observations * 0.1) }
}

export function analyzeConsentedFeedback(rawText: string): DeterministicAnalysis {
  const text = normalized(rawText.slice(0, 8_000))
  if (!text) throw new Error('A non-empty transient feedback text is required.')
  const viSignals = (text.match(/[à-ỹđ]/g) ?? []).length + [' tôi ', ' không ', ' mùi ', 'hương'].filter((word) => text.includes(word)).length
  const enSignals = [' the ', ' and ', ' scent ', ' fragrance ', ' smell '].filter((word) => text.includes(word)).length
  const language = viSignals > enSignals ? 'VI' : enSignals > 0 ? 'EN' : 'UNKNOWN'
  const languageConfidence = Math.min(0.9, 0.45 + Math.max(viSignals, enSignals) * 0.1)
  let positive = 0; let negative = 0
  for (const word of POSITIVE) if (text.includes(word)) positive += 1
  for (const word of NEGATIVE) if (text.includes(word)) negative += 1
  const total = positive + negative; const score = total ? Math.max(-1, Math.min(1, (positive - negative) / total)) : 0
  const label = positive && negative ? 'MIXED' : score > 0.15 ? 'POSITIVE' : score < -0.15 ? 'NEGATIVE' : 'NEUTRAL'
  const confidence = total ? Math.min(0.65, 0.25 + total * 0.1) : 0.2
  const aspects = Object.entries(ASPECTS).map(([id, terms]) => ({ id, label: id, ...scoreNear(text, terms) })).filter((item) => item.confidence > 0)
  const descriptors = Object.entries(DESCRIPTORS).filter(([, terms]) => matches(text, terms)).map(([id]) => ({ id, value: 1, confidence: 0.45 }))
  const perceptions = [{ id: 'overall_liking', value: Number(((score + 1) / 2).toFixed(4)), confidence }, ...aspects.map((aspect) => ({ id: `${aspect.id}_liking`, value: Number(((aspect.score + 1) / 2).toFixed(4)), confidence: aspect.confidence }))]
  return { language, languageConfidence, overall: { label, score, confidence }, aspects, perceptions, descriptors, evidenceStatus: total || descriptors.length ? 'LOW_CONFIDENCE' : 'NOT_ENOUGH_EVIDENCE' }
}

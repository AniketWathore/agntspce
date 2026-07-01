// Caveman compression — JS port of caveman-compress NLP variant
// Strips grammatical scaffolding while preserving factual content

const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and',
  'any', 'are', 'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below',
  'between', 'both', 'but', 'by', 'could', 'did', 'do', 'does', 'doing', 'down',
  'during', 'each', 'few', 'for', 'from', 'further', 'had', 'has', 'have', 'having',
  'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how',
  'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'just',
  'me', 'more', 'most', 'my', 'myself',
  'no', 'nor', 'not', 'now', 'of', 'on', 'once', 'only', 'or', 'other', 'our',
  'ours', 'ourselves', 'out', 'over', 'own',
  'per', 'she', 'should', 'so', 'some', 'than', 'that', 'the', 'their', 'them',
  'themselves', 'then', 'there', 'these', 'they', 'this', 'those', 'through',
  'to', 'too', 'under', 'until', 'up', 'upon', 'very',
  'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who',
  'whom', 'why', 'will', 'with', 'would', 'you', 'your', 'yours', 'yourself',
  'yourselves',
])

const AUX_VERBS = new Set([
  'is', 'are', 'was', 'were', 'been', 'being', 'am',
  'have', 'has', 'had', 'having',
  'do', 'does', 'did', 'doing',
  'will', 'would', 'shall', 'should',
  'can', 'could', 'may', 'might', 'must',
  'need', 'dare', 'ought',
])

const DETERMINERS = new Set([
  'the', 'a', 'an',
  'this', 'that', 'these', 'those',
  'each', 'every', 'all', 'both', 'few', 'several', 'some', 'any', 'no',
  'my', 'your', 'his', 'her', 'its', 'our', 'their',
  'much', 'many', 'more', 'most',
  'neither', 'either',
])

const FILLER_ADVERBS = new Set([
  'very', 'really', 'quite', 'extremely', 'incredibly', 'absolutely',
  'totally', 'completely', 'utterly', 'highly', 'particularly',
  'especially', 'truly', 'actually', 'basically', 'essentially',
  'just', 'simply', 'merely', 'purely',
])

const USEFUL_PUNCTUATION = new Set(['-', '/', ':', '%', '$', '€', '£', '+', '#', '@'])

function isPunct(token: string): boolean {
  if (token.length === 0) return true
  if (USEFUL_PUNCTUATION.has(token)) return false
  return /^[^\w\s]+$/.test(token)
}

function isCapitalizedWord(word: string): boolean {
  return /^[A-Z][a-z]/.test(word)
}

function countTokens(text: string): number {
  return Math.max(1, Math.floor(text.trim().length / 4))
}

export function compress(text: string): string {
  if (!text || text.trim().length === 0) return text

  const sentences = text
    .replace(/([.!?])\s+/g, '$1\n')
    .split('\n')
    .map(s => s.trim())
    .filter(s => s.length > 0)

  const compressedSentences: string[] = []

  for (const sentence of sentences) {
    const words = sentence.split(/\s+/)
    const kept: string[] = []
    let prevKept = ''

    for (const word of words) {
      if (word.length === 0) continue

      const clean = word.replace(/^[^\w]+/, '').replace(/[^\w]+$/, '')
      if (clean.length === 0) {
        kept.push(word)
        prevKept = word
        continue
      }

      const lower = clean.toLowerCase()

      // Skip pure punctuation
      if (isPunct(clean)) {
        if (USEFUL_PUNCTUATION.has(clean)) {
          kept.push(word)
          prevKept = word
        }
        continue
      }

      // Keep numbers
      if (/^\d+(\.\d+)?$/.test(clean)) {
        kept.push(word)
        prevKept = word
        continue
      }

      // Keep capitalized words (likely proper nouns / named entities)
      if (isCapitalizedWord(clean) && !AUX_VERBS.has(lower) && !DETERMINERS.has(lower)) {
        kept.push(word)
        prevKept = word
        continue
      }

      // Skip determiners
      if (DETERMINERS.has(lower)) continue

      // Skip auxiliary verbs
      if (AUX_VERBS.has(lower)) continue

      // Skip filler adverbs
      if (FILLER_ADVERBS.has(lower)) continue

      // Skip coordinating conjunctions
      if (lower === 'and' || lower === 'or') continue

      // Skip remaining stop words
      if (STOP_WORDS.has(lower)) continue

      kept.push(word)
      prevKept = word
    }

    if (kept.length > 0) {
      let result = kept.join(' ')

      // Remove leading/trailing punctuation
      result = result.replace(/^[^\w]+/, '').replace(/[^\w]+$/, '')
      // Remove double spaces
      result = result.replace(/\s{2,}/g, ' ')

      if (result.length > 0) {
        result = result.charAt(0).toUpperCase() + result.slice(1)
        compressedSentences.push(result + '.')
      }
    }
  }

  let result = compressedSentences.join(' ')
  if (result.endsWith('.')) {
    result = result.slice(0, -1) + '.'
  }

  return result
}

interface CompressionDetail {
  word: string
  kept: boolean
  reason?: string
}

export interface CompressionDebug {
  original: string
  compressed: string
  details: CompressionDetail[]
  originalChars: number
  compressedChars: number
  originalTokens: number
  compressedTokens: number
  reduction: number
}

export function compressDebug(text: string): CompressionDebug {
  if (!text || text.trim().length === 0) {
    return {
      original: text || '',
      compressed: text || '',
      details: [],
      originalChars: 0,
      compressedChars: 0,
      originalTokens: 0,
      compressedTokens: 0,
      reduction: 0,
    }
  }

  const details: CompressionDetail[] = []

  const sentences = text
    .replace(/([.!?])\s+/g, '$1\n')
    .split('\n')
    .map(s => s.trim())
    .filter(s => s.length > 0)

  const compressedSentences: string[] = []

  for (const sentence of sentences) {
    const words = sentence.split(/\s+/)
    const kept: string[] = []

    for (const word of words) {
      if (word.length === 0) continue

      const clean = word.replace(/^[^\w]+/, '').replace(/[^\w]+$/, '')
      if (clean.length === 0) {
        kept.push(word)
        details.push({ word, kept: true })
        continue
      }

      const lower = clean.toLowerCase()
      let skipReason = ''

      if (isPunct(clean)) {
        if (!USEFUL_PUNCTUATION.has(clean)) skipReason = 'punctuation'
      } else if (/^\d+(\.\d+)?$/.test(clean)) {
        // keep
      } else if (isCapitalizedWord(clean) && !AUX_VERBS.has(lower) && !DETERMINERS.has(lower)) {
        // keep (proper noun)
      } else if (DETERMINERS.has(lower)) {
        skipReason = 'determiner'
      } else if (AUX_VERBS.has(lower)) {
        skipReason = 'auxiliary verb'
      } else if (FILLER_ADVERBS.has(lower)) {
        skipReason = 'filler adverb'
      } else if (lower === 'and' || lower === 'or') {
        skipReason = 'conjunction'
      } else if (STOP_WORDS.has(lower)) {
        skipReason = 'stop word'
      }

      if (skipReason) {
        details.push({ word, kept: false, reason: skipReason })
      } else {
        kept.push(word)
        details.push({ word, kept: true })
      }
    }

    if (kept.length > 0) {
      let result = kept.join(' ')
      result = result.replace(/^[^\w]+/, '').replace(/[^\w]+$/, '')
      result = result.replace(/\s{2,}/g, ' ')
      if (result.length > 0) {
        result = result.charAt(0).toUpperCase() + result.slice(1)
        compressedSentences.push(result + '.')
      }
    }
  }

  let compressed = compressedSentences.join(' ')
  if (compressed.endsWith('.')) {
    compressed = compressed.slice(0, -1) + '.'
  }

  const stats = getStats(text, compressed)
  return { original: text, compressed, details, ...stats }
}

export function decompress(text: string): string {
  if (!text) return text

  const sentences = text.split('.').map(s => s.trim()).filter(s => s.length > 0)
  return sentences
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join('. ') + '.'
}

export function getStats(original: string, compressed: string): {
  originalChars: number
  compressedChars: number
  originalTokens: number
  compressedTokens: number
  reduction: number
} {
  const origTokens = countTokens(original)
  const compTokens = countTokens(compressed)
  return {
    originalChars: original.length,
    compressedChars: compressed.length,
    originalTokens: origTokens,
    compressedTokens: compTokens,
    reduction: origTokens > 0 ? Math.round((origTokens - compTokens) / origTokens * 100 * 10) / 10 : 0,
  }
}

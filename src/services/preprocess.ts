import type { SpeechItem } from '../types/index.js'

/** 形式的議事進行発言のパターン */
const PROCEDURAL_PATTERNS = [
  /^(これより|以上で|ただいまから|本日は|開会します|閉会します|休憩します|再開します)/,
  /^(起立多数|起立少数|異議なし|全会一致)/,
  /^(御異議ありませんか|御異議なしと認めます)/,
  /^(賛成の方|反対の方)/,
  /^(委員長|議長)\s*[（(].+[）)]\s*$/,
  /^(速記を止め|速記を起こし)/,
]

/** 重要な発言者の役職パターン */
const IMPORTANT_SPEAKER_PATTERNS = [
  /大臣/,
  /委員長/,
  /提出者/,
  /答弁者/,
  /副大臣/,
  /政務官/,
  /内閣総理大臣/,
]

const MIN_SPEECH_LENGTH = 20

/** 形式的議事進行発言かどうかを判定する */
function isProceduralSpeech(speech: string): boolean {
  for (const pattern of PROCEDURAL_PATTERNS) {
    if (pattern.test(speech.trim())) {
      return true
    }
  }
  return false
}

/** 重要な発言者かどうかを判定する */
function isImportantSpeaker(speaker: string): boolean {
  for (const pattern of IMPORTANT_SPEAKER_PATTERNS) {
    if (pattern.test(speaker)) {
      return true
    }
  }
  return false
}

/** 発言の重要度スコアを計算する（0〜100） */
function calcImportanceScore(item: SpeechItem, keywords: string[]): number {
  let score = 0

  // 文字数スコア（長いほど重要）
  const length = item.speech.length
  if (length >= 500) score += 30
  else if (length >= 200) score += 20
  else if (length >= 100) score += 10

  // キーワード一致スコア
  for (const kw of keywords) {
    const count = (item.speech.match(new RegExp(kw, 'g')) ?? []).length
    score += Math.min(count * 5, 30)
  }

  // 重要発言者スコア
  if (isImportantSpeaker(item.speaker)) {
    score += 20
  }

  return Math.min(score, 100)
}

export interface PreprocessOptions {
  keywords?: string[]
  minSpeechLength?: number
}

export interface Chunk {
  items: SpeechItem[]
  charCount: number
}

/**
 * 発言群の前処理を行う
 * 1. 形式的議事進行発言の除外
 * 2. 短発言の除外
 * 3. 同一話者連続発言の結合
 * 4. 重要度スコア付与
 */
export function preprocessSpeeches(
  items: SpeechItem[],
  options: PreprocessOptions = {},
): SpeechItem[] {
  const keywords = options.keywords ?? []
  const minLength = options.minSpeechLength ?? MIN_SPEECH_LENGTH

  // ステップ 1: 形式的発言・短発言の除外
  const filtered = items.filter((item) => {
    if (item.speech.trim().length < minLength) return false
    if (isProceduralSpeech(item.speech)) return false
    return true
  })

  // ステップ 2: 同一話者の連続発言を結合
  const merged: SpeechItem[] = []
  for (const item of filtered) {
    const last = merged.at(-1)
    if (last && last.speaker === item.speaker && last.issueID === item.issueID) {
      last.speech = last.speech + '\n' + item.speech
    } else {
      merged.push({ ...item })
    }
  }

  // ステップ 3: 重要度スコアでソート（重要度の高い順）
  if (keywords.length > 0) {
    merged.sort((a, b) => calcImportanceScore(b, keywords) - calcImportanceScore(a, keywords))
  }

  return merged
}

/**
 * 発言群をチャンクに分割する
 * @param maxCharsPerChunk 1チャンクの最大文字数
 * @param maxItemsPerChunk 1チャンクの最大発言数
 */
export function splitIntoChunks(
  items: SpeechItem[],
  maxCharsPerChunk: number,
  maxItemsPerChunk: number,
): Chunk[] {
  const chunks: Chunk[] = []
  let current: SpeechItem[] = []
  let currentChars = 0

  for (const item of items) {
    const speechLength = item.speech.length

    if (
      current.length > 0 &&
      (currentChars + speechLength > maxCharsPerChunk || current.length >= maxItemsPerChunk)
    ) {
      chunks.push({ items: current, charCount: currentChars })
      current = []
      currentChars = 0
    }

    current.push(item)
    currentChars += speechLength
  }

  if (current.length > 0) {
    chunks.push({ items: current, charCount: currentChars })
  }

  return chunks
}
